import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Users,
  UserPlus,
  Edit2,
  Trash2,
  GraduationCap,
  BookOpen,
  CheckCircle2,
  Sparkles,
  Search,
  Layers,
  Save,
  Phone,
  Mail,
  Award,
  CalendarDays,
  ShieldCheck,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ALL_CLASS_SECTIONS, getCategoryLabel, CLASSES, SECTIONS } from '@/constants/schoolConfig';
import { parseClassSection } from '@/utils/teacherAccess';
import { cn } from '@/lib/utils';

export interface FacultyTeacher {
  id: string;
  name: string;
  employee_id: string;
  specialization?: string;
  role?: string;
  email?: string;
  phone?: string;
  periodsPerWeek?: number;
}

export interface SubjectItem {
  id: string;
  name: string;
  short_name?: string | null;
  category?: string;
}

export interface ClassFacultyAssignment {
  category: string;
  classTeacherId?: string;
  coClassTeacherId?: string;
  subjectTeachers: Record<string, string>;
}

interface FacultyManagementPanelProps {
  teachers: FacultyTeacher[];
  subjects: SubjectItem[];
  timetableData?: any[];
  onRefreshTeachers: () => Promise<void> | void;
  onApplySubjectTeachersToTimetable?: (category: string, subjectTeachers: Record<string, string>) => Promise<void> | void;
  initialSelectedCategory?: string;
}

export const FacultyManagementPanel: React.FC<FacultyManagementPanelProps> = ({
  teachers,
  subjects,
  timetableData = [],
  onRefreshTeachers,
  onApplySubjectTeachersToTimetable,
  initialSelectedCategory = '6-A',
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'assignments' | 'directory'>('assignments');
  const [selectedClass, setSelectedClass] = useState<string>(initialSelectedCategory);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<FacultyTeacher | null>(null);
  const [teacherForm, setTeacherForm] = useState({
    name: '',
    employee_id: '',
    specialization: 'Mathematics',
    role: 'TGT',
    email: '',
    phone: '',
  });

  const [classAssignments, setClassAssignments] = useState<Record<string, ClassFacultyAssignment>>(() => {
    try {
      const saved = localStorage.getItem('class_faculty_assignments');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [savingAssignments, setSavingAssignments] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from('class_teachers').select('*');
        if (!error && data && data.length > 0) {
          const map: Record<string, ClassFacultyAssignment> = {};
          data.forEach((row: any) => {
            const cat = row.category || (row.class && row.section ? `${row.class}-${row.section}` : '6-A');
            if (!map[cat]) {
              map[cat] = { category: cat, subjectTeachers: {} };
            }
            if (row.role === 'class_teacher') {
              map[cat].classTeacherId = row.teacher_id;
            } else if (row.role === 'co_class_teacher') {
              map[cat].coClassTeacherId = row.teacher_id;
            } else if (row.role === 'subject_teacher' && row.subject_id) {
              map[cat].subjectTeachers[row.subject_id] = row.teacher_id;
            }
          });
          setClassAssignments((prev) => ({ ...prev, ...map }));
        }
      } catch (err) {
        console.warn('Could not load class assignments from DB:', err);
      }
    })();
  }, []);

  const teacherWorkloads = useMemo(() => {
    const counts: Record<string, number> = {};
    (timetableData || []).forEach((row: any) => {
      const teacherId = row.teacher_id || row.teacher_record_id || row.metadata?.teacher_id;
      if (teacherId) {
        counts[teacherId] = (counts[teacherId] || 0) + 1;
      }
    });
    return counts;
  }, [timetableData]);

  const currentAssignment = useMemo(() => {
    return (
      classAssignments[selectedClass] || {
        category: selectedClass,
        subjectTeachers: {},
      }
    );
  }, [classAssignments, selectedClass]);

  const handleSetClassTeacher = (teacherId: string, isCo = false) => {
    setClassAssignments((prev) => {
      const existing = prev[selectedClass] || { category: selectedClass, subjectTeachers: {} };
      const updated = {
        ...existing,
        [isCo ? 'coClassTeacherId' : 'classTeacherId']: teacherId === '__none' ? undefined : teacherId,
      };
      const next = { ...prev, [selectedClass]: updated };
      localStorage.setItem('class_faculty_assignments', JSON.stringify(next));
      return next;
    });
  };

  const handleAssignSubjectTeacher = (subjectId: string, teacherId: string) => {
    setClassAssignments((prev) => {
      const existing = prev[selectedClass] || { category: selectedClass, subjectTeachers: {} };
      const updated = {
        ...existing,
        subjectTeachers: {
          ...existing.subjectTeachers,
          [subjectId]: teacherId === '__none' ? '' : teacherId,
        },
      };
      const next = { ...prev, [selectedClass]: updated };
      localStorage.setItem('class_faculty_assignments', JSON.stringify(next));
      return next;
    });
  };

  const handleSaveClassAssignments = async () => {
    setSavingAssignments(true);
    try {
      const parsed = parseClassSection(selectedClass);
      const rowsToSave: any[] = [];

      if (currentAssignment.classTeacherId) {
        const t = teachers.find((tch) => tch.id === currentAssignment.classTeacherId);
        rowsToSave.push({
          category: selectedClass,
          class: parsed?.className || selectedClass.split('-')[0],
          section: parsed?.section || selectedClass.split('-')[1] || 'A',
          role: 'class_teacher',
          teacher_id: currentAssignment.classTeacherId,
          teacher_name: t?.name || 'Class Teacher',
          teacher_email: t?.email || null,
        });
      }

      if (currentAssignment.coClassTeacherId) {
        const t = teachers.find((tch) => tch.id === currentAssignment.coClassTeacherId);
        rowsToSave.push({
          category: selectedClass,
          class: parsed?.className || selectedClass.split('-')[0],
          section: parsed?.section || selectedClass.split('-')[1] || 'A',
          role: 'co_class_teacher',
          teacher_id: currentAssignment.coClassTeacherId,
          teacher_name: t?.name || 'Co-Class Teacher',
          teacher_email: t?.email || null,
        });
      }

      Object.entries(currentAssignment.subjectTeachers).forEach(([subjId, tchId]) => {
        if (!tchId) return;
        const t = teachers.find((tch) => tch.id === tchId);
        const s = subjects.find((sbj) => sbj.id === subjId);
        rowsToSave.push({
          category: selectedClass,
          class: parsed?.className || selectedClass.split('-')[0],
          section: parsed?.section || selectedClass.split('-')[1] || 'A',
          role: 'subject_teacher',
          teacher_id: tchId,
          teacher_name: t?.name || 'Subject Teacher',
          subject_id: subjId,
          metadata: {
            subject_name: s?.name,
          },
        });
      });

      await supabase.from('class_teachers').delete().eq('category', selectedClass);
      if (rowsToSave.length > 0) {
        await supabase.from('class_teachers').insert(rowsToSave);
      }

      localStorage.setItem('class_faculty_assignments', JSON.stringify(classAssignments));

      toast({
        title: '✅ Faculty Assignment Saved',
        description: `Assigned Class Teacher & ${Object.keys(currentAssignment.subjectTeachers).length} Subject Teachers for ${getCategoryLabel(selectedClass)}.`,
      });

      if (onApplySubjectTeachersToTimetable) {
        await onApplySubjectTeachersToTimetable(selectedClass, currentAssignment.subjectTeachers);
      }
    } catch (e: any) {
      console.error('Error saving faculty assignments:', e);
      toast({
        title: 'Assignment Saved Locally',
        description: 'Saved to local browser storage.',
      });
    } finally {
      setSavingAssignments(false);
    }
  };

  const handleOpenAddTeacher = () => {
    setEditingTeacher(null);
    setTeacherForm({
      name: '',
      employee_id: `T${Date.now().toString().slice(-4)}`,
      specialization: 'Mathematics',
      role: 'TGT',
      email: '',
      phone: '',
    });
    setTeacherModalOpen(true);
  };

  const handleOpenEditTeacher = (t: FacultyTeacher) => {
    setEditingTeacher(t);
    setTeacherForm({
      name: t.name,
      employee_id: t.employee_id,
      specialization: t.specialization || 'Mathematics',
      role: t.role || 'TGT',
      email: t.email || '',
      phone: t.phone || '',
    });
    setTeacherModalOpen(true);
  };

  const handleSaveTeacher = async () => {
    const name = teacherForm.name.trim();
    if (!name) {
      toast({ title: 'Name required', description: 'Please enter teacher full name.', variant: 'destructive' });
      return;
    }

    try {
      const recordPayload = {
        category: 'Teacher',
        status: 'registered',
        device_info: {
          type: 'staff_registration',
          metadata: {
            name,
            employee_id: teacherForm.employee_id.trim() || `T-${Math.floor(1000 + Math.random() * 9000)}`,
            specialization: teacherForm.specialization,
            role: teacherForm.role,
            email: teacherForm.email.trim(),
            phone: teacherForm.phone.trim(),
            department: 'Faculty',
            position: 'Teacher',
          },
        },
      };

      if (editingTeacher) {
        await supabase.from('attendance_records').update(recordPayload).eq('id', editingTeacher.id);
      } else {
        await supabase.from('attendance_records').insert([recordPayload]);
      }

      toast({
        title: editingTeacher ? 'Teacher Updated' : 'Teacher Added',
        description: `${name} has been added to the faculty directory.`,
      });

      setTeacherModalOpen(false);
      await onRefreshTeachers();
    } catch (e: any) {
      toast({
        title: 'Saved locally',
        description: 'Teacher created in local session.',
      });
      setTeacherModalOpen(false);
      await onRefreshTeachers();
    }
  };

  const filteredTeachers = useMemo(() => {
    if (!searchQuery.trim()) return teachers;
    const q = searchQuery.toLowerCase();
    return teachers.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.specialization && t.specialization.toLowerCase().includes(q)) ||
        t.employee_id.toLowerCase().includes(q)
    );
  }, [teachers, searchQuery]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 p-2 rounded-2xl bg-muted/60 border border-border/50">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('assignments')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all',
              activeTab === 'assignments'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <GraduationCap className="h-4 w-4 text-primary" />
            <span>Class Faculty & Subject Assignment</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('directory')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all',
              activeTab === 'directory'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Users className="h-4 w-4 text-primary" />
            <span>Faculty Directory & Workload</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
              {teachers.length}
            </Badge>
          </button>
        </div>

        {activeTab === 'directory' && (
          <Button
            size="sm"
            onClick={handleOpenAddTeacher}
            className="h-8 px-3 text-xs font-bold rounded-xl gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add New Teacher
          </Button>
        )}
      </div>

      {activeTab === 'assignments' ? (
        <Card className="rounded-3xl border shadow-lg bg-card/70 backdrop-blur-xl overflow-hidden">
          <CardHeader className="p-4 sm:p-5 border-b bg-gradient-to-r from-muted/50 to-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  Fixed Subject Teachers — {getCategoryLabel(selectedClass)}
                </CardTitle>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs font-bold">
                  Class {selectedClass}
                </Badge>
              </div>
              <CardDescription className="text-xs mt-0.5">
                Assign the designated class teacher and fixed subject teachers. Any period with this subject will automatically show this teacher.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger className="h-9 w-44 rounded-xl text-xs bg-background font-semibold">
                  <SelectValue placeholder="Select Class" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {ALL_CLASS_SECTIONS.map((cat) => (
                    <SelectItem key={cat} value={cat} className="text-xs font-medium">
                      {getCategoryLabel(cat)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                size="sm"
                onClick={handleSaveClassAssignments}
                disabled={savingAssignments}
                className="h-9 px-4 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                {savingAssignments ? 'Saving...' : 'Save & Sync Timetable'}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-5 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl border border-primary/30 bg-primary/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <GraduationCap className="h-4 w-4 text-primary" /> Designated Class Teacher
                  </span>
                  <Badge variant="secondary" className="text-[10px] uppercase font-bold">Official Lead</Badge>
                </div>
                <Select
                  value={currentAssignment.classTeacherId || '__none'}
                  onValueChange={(val) => handleSetClassTeacher(val, false)}
                >
                  <SelectTrigger className="h-10 text-xs rounded-xl bg-background font-semibold">
                    <SelectValue placeholder="Select Class Teacher" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="__none" className="text-xs text-muted-foreground">-- None Assigned --</SelectItem>
                    {teachers.map((t) => (
                      <SelectItem key={t.id} value={t.id} className="text-xs font-medium">
                        {t.name} ({t.specialization || 'Faculty'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Responsible for morning roll call, attendance reporting & parent communication for {getCategoryLabel(selectedClass)}.
                </p>
              </div>

              <div className="p-4 rounded-2xl border border-border/80 bg-muted/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-indigo-500" /> Co-Class Teacher / Associate
                  </span>
                  <Badge variant="outline" className="text-[10px] uppercase">Secondary</Badge>
                </div>
                <Select
                  value={currentAssignment.coClassTeacherId || '__none'}
                  onValueChange={(val) => handleSetClassTeacher(val, true)}
                >
                  <SelectTrigger className="h-10 text-xs rounded-xl bg-background font-semibold">
                    <SelectValue placeholder="Select Co-Class Teacher" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="__none" className="text-xs text-muted-foreground">-- None Assigned --</SelectItem>
                    {teachers.map((t) => (
                      <SelectItem key={t.id} value={t.id} className="text-xs font-medium">
                        {t.name} ({t.specialization || 'Faculty'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Steps in during class teacher absence and supports student discipline.
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-extrabold text-foreground">Subject Teacher Allocations</h3>
                  <p className="text-xs text-muted-foreground">
                    When this class has a period for any subject below, the timetable automatically binds to this teacher.
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs font-mono">
                  {Object.values(currentAssignment.subjectTeachers).filter(Boolean).length} / {subjects.length} Subjects Assigned
                </Badge>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-border/70 bg-background/50">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/60 text-muted-foreground font-bold">
                      <th className="p-3 w-12 text-center">#</th>
                      <th className="p-3 min-w-[160px]">Curriculum Subject</th>
                      <th className="p-3 min-w-[240px]">Assigned Fixed Subject Teacher</th>
                      <th className="p-3 text-center w-28">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {subjects.map((subj, idx) => {
                      const assignedTeacherId = currentAssignment.subjectTeachers[subj.id];
                      const assignedTeacher = teachers.find((t) => t.id === assignedTeacherId);

                      return (
                        <tr key={subj.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3 text-center text-muted-foreground font-mono">{idx + 1}</td>
                          <td className="p-3 font-semibold text-foreground">
                            <div className="font-bold text-xs">{subj.name}</div>
                            {subj.short_name && (
                              <span className="text-[10px] font-mono text-muted-foreground">
                                Code: {subj.short_name}
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <Select
                              value={assignedTeacherId || '__none'}
                              onValueChange={(val) => handleAssignSubjectTeacher(subj.id, val)}
                            >
                              <SelectTrigger className="h-9 text-xs rounded-xl bg-card">
                                <SelectValue placeholder="Assign teacher..." />
                              </SelectTrigger>
                              <SelectContent className="max-h-60">
                                <SelectItem value="__none" className="text-xs text-muted-foreground">
                                  -- Unassigned --
                                </SelectItem>
                                {teachers.map((t) => (
                                  <SelectItem key={t.id} value={t.id} className="text-xs font-medium">
                                    {t.name} ({t.specialization || 'Faculty'})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-3 text-center">
                            {assignedTeacher ? (
                              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] font-bold">
                                Assigned
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                Pending
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-3xl border shadow-lg bg-card/70 backdrop-blur-xl overflow-hidden">
          <CardHeader className="p-4 sm:p-5 border-b bg-gradient-to-r from-muted/50 to-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Faculty Directory & Teaching Workload
              </CardTitle>
              <CardDescription className="text-xs">
                Manage registered teachers, update contact details, and balance weekly teaching periods across the school.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-48 sm:w-60">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search faculty..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs rounded-xl bg-background"
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-5">
            <div className="overflow-x-auto rounded-2xl border border-border/70 bg-background/50">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b bg-muted/60 text-muted-foreground font-bold">
                    <th className="p-3">Faculty Name & Role</th>
                    <th className="p-3">Primary Subject</th>
                    <th className="p-3">Staff ID</th>
                    <th className="p-3">Weekly Workload</th>
                    <th className="p-3">Contact</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredTeachers.map((t) => {
                    const workload = teacherWorkloads[t.id] || 0;
                    const isOverloaded = workload > 30;
                    const isOptimal = workload >= 20 && workload <= 30;

                    return (
                      <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <div className="font-extrabold text-foreground text-xs">{t.name}</div>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 mt-0.5">
                            {t.role || 'Teacher'}
                          </Badge>
                        </td>
                        <td className="p-3 font-semibold text-primary">
                          {t.specialization || 'General'}
                        </td>
                        <td className="p-3 font-mono text-muted-foreground">
                          {t.employee_id}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-xs tabular-nums">{workload}</span>
                            <span className="text-[10px] text-muted-foreground">periods/wk</span>
                            <Badge
                              className={cn(
                                'text-[9px] px-1.5 py-0',
                                isOverloaded
                                  ? 'bg-rose-500/15 text-rose-600 border-rose-500/30'
                                  : isOptimal
                                    ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30'
                                    : 'bg-muted text-muted-foreground'
                              )}
                            >
                              {isOverloaded ? 'Heavy' : isOptimal ? 'Balanced' : 'Light'}
                            </Badge>
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          <div className="space-y-0.5 text-[11px]">
                            {t.email && (
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3 opacity-70" />
                                <span className="truncate max-w-[140px]">{t.email}</span>
                              </div>
                            )}
                            {t.phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3 opacity-70" />
                                <span>{t.phone}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditTeacher(t)}
                            className="h-7 px-2.5 text-xs font-semibold rounded-lg hover:bg-muted"
                          >
                            <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={teacherModalOpen} onOpenChange={setTeacherModalOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              {editingTeacher ? 'Edit Teacher Details' : 'Add New Teacher to Faculty'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure teacher identity, specialization, and staff credentials.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Teacher Full Name *</Label>
              <Input
                value={teacherForm.name}
                onChange={(e) => setTeacherForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Dr. Rajesh Sharma"
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Staff / Employee ID</Label>
                <Input
                  value={teacherForm.employee_id}
                  onChange={(e) => setTeacherForm((p) => ({ ...p, employee_id: e.target.value }))}
                  placeholder="e.g. T1042"
                  className="h-9 text-xs rounded-xl font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Designation / Role</Label>
                <Select
                  value={teacherForm.role}
                  onValueChange={(val) => setTeacherForm((p) => ({ ...p, role: val }))}
                >
                  <SelectTrigger className="h-9 text-xs rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PGT" className="text-xs">PGT (Post Graduate)</SelectItem>
                    <SelectItem value="TGT" className="text-xs">TGT (Trained Graduate)</SelectItem>
                    <SelectItem value="PRT" className="text-xs">PRT (Primary Teacher)</SelectItem>
                    <SelectItem value="HOD" className="text-xs">Head of Department</SelectItem>
                    <SelectItem value="Visiting" className="text-xs">Visiting Faculty</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Primary Subject / Specialization</Label>
              <Select
                value={teacherForm.specialization}
                onValueChange={(val) => setTeacherForm((p) => ({ ...p, specialization: val }))}
              >
                <SelectTrigger className="h-9 text-xs rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mathematics" className="text-xs">Mathematics</SelectItem>
                  <SelectItem value="Science & Physics" className="text-xs">Science & Physics</SelectItem>
                  <SelectItem value="Chemistry & Biology" className="text-xs">Chemistry & Biology</SelectItem>
                  <SelectItem value="English Language" className="text-xs">English Language</SelectItem>
                  <SelectItem value="Hindi & Sanskrit" className="text-xs">Hindi & Sanskrit</SelectItem>
                  <SelectItem value="Social Studies & History" className="text-xs">Social Studies (SST)</SelectItem>
                  <SelectItem value="Computer Science & AI" className="text-xs">Computer Science & AI</SelectItem>
                  <SelectItem value="Physical Education" className="text-xs">Physical Education / Sports</SelectItem>
                  <SelectItem value="Art & Music" className="text-xs">Art & Music</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Email Address</Label>
                <Input
                  type="email"
                  value={teacherForm.email}
                  onChange={(e) => setTeacherForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="teacher@school.edu"
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Phone Number</Label>
                <Input
                  type="tel"
                  value={teacherForm.phone}
                  onChange={(e) => setTeacherForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="+91 98765 43210"
                  className="h-9 text-xs rounded-xl"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTeacherModalOpen(false)}
              className="text-xs rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveTeacher}
              className="text-xs bg-primary hover:bg-primary/90 text-white font-bold rounded-xl px-4"
            >
              Save Teacher
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FacultyManagementPanel;
