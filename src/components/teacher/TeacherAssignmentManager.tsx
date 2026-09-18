import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  BookOpen,
  Plus,
  Calendar,
  Clock,
  Send,
  MessageSquare,
  FileText,
  CheckCircle2,
  Trash2,
  Edit2,
  Sparkles,
  Users,
  Award,
  AlertCircle,
  FolderPlus,
  Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ClassAssignment, ClassStudent } from './TeacherAdminWorkspace';
import { format, parseISO, isAfter, isBefore, addDays } from 'date-fns';

export interface ClassAssignmentItem {
  id: string;
  title: string;
  subject: string;
  description: string;
  dueDate: string;
  type: 'homework' | 'project' | 'test' | 'revision';
  maxMarks?: number;
  classCategory: string;
  teacherName: string;
  createdAt: string;
  submissionsCount?: number;
}

interface TeacherAssignmentManagerProps {
  activeClass: ClassAssignment;
  students: ClassStudent[];
  teacherName: string;
}

export const TeacherAssignmentManager: React.FC<TeacherAssignmentManagerProps> = ({
  activeClass,
  students,
  teacherName,
}) => {
  const { toast } = useToast();
  const storageKey = `presences_assignments_${activeClass.category}`;

  const [assignments, setAssignments] = useState<ClassAssignmentItem[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        id: '1',
        title: 'Gauss Law & Electrostatics Practice Problems',
        subject: 'Physics',
        description: 'Complete Exercise 2.3 questions 1 to 12 in the physics homework notebook.',
        dueDate: format(addDays(new Date(), 2), 'yyyy-MM-dd'),
        type: 'homework',
        maxMarks: 20,
        classCategory: activeClass.category,
        teacherName: teacherName || 'Faculty Teacher',
        createdAt: new Date().toISOString(),
        submissionsCount: 14,
      },
      {
        id: '2',
        title: 'Weekly Unit Test: Chemical Bonding',
        subject: 'Chemistry',
        description: 'Multiple choice & subjective test covering VSEPR theory and hybridization.',
        dueDate: format(addDays(new Date(), 4), 'yyyy-MM-dd'),
        type: 'test',
        maxMarks: 50,
        classCategory: activeClass.category,
        teacherName: teacherName || 'Faculty Teacher',
        createdAt: new Date().toISOString(),
        submissionsCount: 0,
      },
    ];
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // New assignment form state
  const [newTitle, setNewTitle] = useState('');
  const [newSubject, setNewSubject] = useState('Mathematics');
  const [newDescription, setNewDescription] = useState('');
  const [newDueDate, setNewDueDate] = useState(format(addDays(new Date(), 2), 'yyyy-MM-dd'));
  const [newType, setNewType] = useState<'homework' | 'project' | 'test' | 'revision'>('homework');
  const [newMaxMarks, setNewMaxMarks] = useState<number>(20);
  const [broadcastWhatsApp, setBroadcastWhatsApp] = useState(true);

  // Save to localStorage whenever assignments change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(assignments));
    } catch {}
  }, [assignments, storageKey]);

  // Filtered assignments list
  const filteredAssignments = useMemo(() => {
    let list = assignments;
    if (filterType !== 'all') {
      list = list.filter(a => a.type === filterType);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(a =>
        a.title.toLowerCase().includes(q) ||
        a.subject.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
      );
    }
    return list;
  }, [assignments, filterType, searchQuery]);

  // Create Assignment Handler
  const handleCreateAssignment = async () => {
    if (!newTitle.trim() || !newDescription.trim()) {
      toast({ title: 'Missing Details', description: 'Please fill in the title and description.', variant: 'destructive' });
      return;
    }

    const createdItem: ClassAssignmentItem = {
      id: `assign-${Date.now()}`,
      title: newTitle.trim(),
      subject: newSubject,
      description: newDescription.trim(),
      dueDate: newDueDate,
      type: newType,
      maxMarks: newMaxMarks,
      classCategory: activeClass.category,
      teacherName: teacherName || 'Faculty Teacher',
      createdAt: new Date().toISOString(),
      submissionsCount: 0,
    };

    setAssignments(prev => [createdItem, ...prev]);

    // Optional: save to Supabase announcement/assignment table
    try {
      await supabase.from('attendance_records').insert({
        category: activeClass.category,
        class: activeClass.class,
        section: activeClass.section,
        status: 'registered',
        source: 'assignment-broadcast',
        device_info: {
          assignment_id: createdItem.id,
          title: createdItem.title,
          subject: createdItem.subject,
          due_date: createdItem.dueDate,
          type: createdItem.type,
          teacher: teacherName,
        },
      });
    } catch {}

    toast({
      title: '✅ Assignment Created & Broadcasted',
      description: `"${createdItem.title}" assigned to Class ${activeClass.category}.`,
    });

    setIsCreateOpen(false);
    setNewTitle('');
    setNewDescription('');
  };

  // Delete Assignment
  const handleDeleteAssignment = (id: string) => {
    setAssignments(prev => prev.filter(a => a.id !== id));
    toast({ title: 'Assignment Removed', description: 'Deleted from class board.' });
  };

  // Broadcast to Parents via WhatsApp
  const handleBroadcastWhatsApp = (assign: ClassAssignmentItem) => {
    const msg = encodeURIComponent(
      `📢 *PM Shri KV NFC Vigyan Vihar — Class ${activeClass.category} Assignment*\n\n` +
      `*Subject:* ${assign.subject} (${assign.type.toUpperCase()})\n` +
      `*Topic:* ${assign.title}\n` +
      `*Details:* ${assign.description}\n` +
      `*Due Date:* ${format(parseISO(assign.dueDate), 'dd MMMM yyyy')}\n` +
      `*Max Marks:* ${assign.maxMarks || 20}\n\n` +
      `_Assigned by ${teacherName}._ Please ensure student completes on time.`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  return (
    <div className="space-y-4">
      <Card className="border shadow-md rounded-2xl bg-card">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-extrabold flex items-center gap-2">
                    <span>Homework & Assignment Assigner</span>
                    <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/30 text-xs font-bold">
                      Class {activeClass.category}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Assign homework, unit tests, and projects directly to your class students and broadcast to parents.
                  </CardDescription>
                </div>
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              className="text-xs h-8 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold rounded-xl gap-1.5 shadow-md shadow-indigo-600/20"
            >
              <Plus className="h-4 w-4" /> Create Assignment
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <Input
              placeholder="Search assignments by title or subject..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-8 text-xs rounded-xl w-full sm:w-72"
            />

            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              {['all', 'homework', 'test', 'project', 'revision'].map((typeKey) => (
                <Button
                  key={typeKey}
                  size="sm"
                  variant={filterType === typeKey ? 'default' : 'ghost'}
                  onClick={() => setFilterType(typeKey)}
                  className="h-7 text-xs rounded-lg px-2.5 capitalize"
                >
                  {typeKey}
                </Button>
              ))}
            </div>
          </div>

          {/* Assignment Cards Grid */}
          {filteredAssignments.length === 0 ? (
            <div className="text-center py-12 px-4 border border-dashed rounded-2xl bg-muted/10">
              <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-50" />
              <h4 className="text-sm font-bold text-foreground">No Assignments Found</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Tap "Create Assignment" above to assign homework or tests for Class {activeClass.category}.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredAssignments.map((item) => {
                const isOverdue = isBefore(parseISO(item.dueDate), new Date());
                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-card hover:border-indigo-500/40 hover:shadow-md transition-all flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge className={`text-[10px] font-bold uppercase ${
                            item.type === 'test'
                              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                              : item.type === 'project'
                              ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30'
                              : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30'
                          }`}>
                            {item.subject} • {item.type}
                          </Badge>
                          {item.maxMarks && (
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {item.maxMarks} Marks
                            </Badge>
                          )}
                        </div>

                        <button
                          onClick={() => handleDeleteAssignment(item.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition"
                          title="Delete Assignment"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <h4 className="font-bold text-sm text-foreground mt-2 leading-snug">
                        {item.title}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {item.description}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                        <span className={`text-[11px] font-medium ${isOverdue ? 'text-rose-500 font-bold' : ''}`}>
                          Due: {format(parseISO(item.dueDate), 'dd MMM yyyy')}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleBroadcastWhatsApp(item)}
                          className="h-7 text-[11px] rounded-lg px-2 gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 border-emerald-500/30 font-semibold"
                          title="Send homework notice to parents on WhatsApp"
                        >
                          <MessageSquare className="h-3 w-3" /> WhatsApp
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create Assignment Modal ── */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md sm:rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-indigo-600" />
              Create Class Assignment • Class {activeClass.category}
            </DialogTitle>
            <DialogDescription className="text-xs">
              This will be added to the student portal and can be broadcasted directly to parents.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div>
              <Label className="text-xs font-semibold">Assignment Title:</Label>
              <Input
                placeholder="e.g. Chapter 3 Chemical Reactions Worksheet"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="h-8 text-xs mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-semibold">Subject:</Label>
                <Select value={newSubject} onValueChange={setNewSubject}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English', 'Computer Science', 'Social Studies', 'Hindi'].map(s => (
                      <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold">Type:</Label>
                <Select value={newType} onValueChange={(v: any) => setNewType(v)}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="homework" className="text-xs">Homework</SelectItem>
                    <SelectItem value="test" className="text-xs">Class / Unit Test</SelectItem>
                    <SelectItem value="project" className="text-xs">Project / Activity</SelectItem>
                    <SelectItem value="revision" className="text-xs">Revision</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">Description / Questions:</Label>
              <Textarea
                placeholder="Describe questions, textbook page numbers, formulas, or guidelines..."
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                rows={3}
                className="text-xs mt-1 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-semibold">Submission Due Date:</Label>
                <Input
                  type="date"
                  value={newDueDate}
                  onChange={e => setNewDueDate(e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Max Marks / Points:</Label>
                <Input
                  type="number"
                  value={newMaxMarks}
                  onChange={e => setNewMaxMarks(Number(e.target.value))}
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setIsCreateOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateAssignment}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl"
            >
              Assign & Broadcast
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeacherAssignmentManager;
