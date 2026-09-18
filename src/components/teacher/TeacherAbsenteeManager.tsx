import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  UserX,
  UserCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  CheckCheck,
  Phone,
  MessageSquare,
  Sparkles,
  Loader2,
  Send,
  Zap,
  RefreshCw,
  ShieldCheck,
  CheckSquare,
  Square,
  UserMinus,
  SlidersHorizontal,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { sanitizeStudentPhotoUrl } from '@/utils/studentPhotoResolver';
import { ClassStudent, ClassAssignment } from './TeacherAdminWorkspace';

interface TeacherAbsenteeManagerProps {
  activeClass: ClassAssignment;
  students: ClassStudent[];
  teacherName: string;
  teacherEmail: string;
  previousDayLabel: string;
  onRefresh: () => void;
}

export const TeacherAbsenteeManager: React.FC<TeacherAbsenteeManagerProps> = ({
  activeClass,
  students,
  teacherName,
  teacherEmail,
  previousDayLabel,
  onRefresh,
}) => {
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all_unattended' | 'unmarked' | 'absent' | 'late'>('all_unattended');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  // Filter students who are absent, unmarked, or late
  const unattendedStudents = useMemo(() => {
    return students.filter(s => {
      const st = s.today_status;
      if (!st || st === 'unmarked' || st === 'absent' || st === 'late') {
        return true;
      }
      return false;
    });
  }, [students]);

  // Apply search and sub-tab filtering
  const filteredList = useMemo(() => {
    let list = unattendedStudents;

    if (filterTab === 'unmarked') {
      list = list.filter(s => !s.today_status || s.today_status === 'unmarked');
    } else if (filterTab === 'absent') {
      list = list.filter(s => s.today_status === 'absent');
    } else if (filterTab === 'late') {
      list = list.filter(s => s.today_status === 'late');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.roll_number && s.roll_number.toLowerCase().includes(q)) ||
        (s.admission_number && s.admission_number.toLowerCase().includes(q)) ||
        (s.parent_phone && s.parent_phone.includes(q))
      );
    }

    return list;
  }, [unattendedStudents, filterTab, searchQuery]);

  // Category counts
  const counts = useMemo(() => {
    const unmarked = students.filter(s => !s.today_status || s.today_status === 'unmarked').length;
    const absent = students.filter(s => s.today_status === 'absent').length;
    const late = students.filter(s => s.today_status === 'late').length;
    const present = students.filter(s => s.today_status === 'present').length;
    const attendedYesterdayButUnmarkedToday = students.filter(
      s => s.was_present_yesterday && (!s.today_status || s.today_status === 'unmarked')
    ).length;

    return {
      total: students.length,
      unattended: unmarked + absent,
      unmarked,
      absent,
      late,
      present,
      attendedYesterdayButUnmarkedToday,
    };
  }, [students]);

  // Handle single student manual attendance mark
  const handleMarkStudent = async (student: ClassStudent, targetStatus: 'present' | 'late' | 'absent') => {
    setIsProcessing(student.id);
    const now = new Date();
    const nowIso = now.toISOString();

    try {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      // 1. Delete existing today's record to prevent duplicates
      let del = supabase
        .from('attendance_records')
        .delete()
        .gte('timestamp', startOfToday.toISOString())
        .lte('timestamp', endOfToday.toISOString());

      if (student.user_id) {
        del = del.eq('user_id', student.user_id);
      } else {
        del = del.eq('student_name', student.name);
      }
      await del;

      // 2. Insert new manual attendance record
      const { error } = await supabase.from('attendance_records').insert({
        user_id: student.user_id || null,
        student_id: student.admission_number || student.roll_number || null,
        student_name: student.name,
        class: activeClass.class,
        section: activeClass.section,
        category: activeClass.category,
        roll_number: student.roll_number || null,
        status: targetStatus,
        source: 'teacher-portal',
        capture_mode: 'manual',
        timestamp: nowIso,
        device_info: {
          source: 'teacher-portal',
          capture_mode: 'manual',
          mark: 'manual_attendance',
          marked_by: teacherName,
          verified_by: teacherEmail,
          was_present_previous_day: Boolean(student.was_present_yesterday),
          metadata: {
            name: student.name,
            roll_number: student.roll_number,
            class: activeClass.class,
            section: activeClass.section,
            department: activeClass.category,
            manual: true,
            marked_at: nowIso,
          },
        },
        metadata: {
          source: 'teacher-portal',
          capture_mode: 'manual',
          mark: 'manual_attendance',
          marked_by: teacherName,
          verified_by: teacherEmail,
          was_present_previous_day: Boolean(student.was_present_yesterday),
          manual: true,
        },
      });

      if (error) throw error;

      toast({
        title: `✅ Marked ${targetStatus.toUpperCase()}`,
        description: `${student.name} marked as ${targetStatus} (Manual Teacher Override).`,
      });

      onRefresh();
    } catch (err: any) {
      console.error('Error marking attendance:', err);
      toast({ title: 'Marking Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsProcessing(null);
    }
  };

  // Batch mark selected students
  const handleBatchMark = async (targetStatus: 'present' | 'absent' | 'late') => {
    const targetStudents = students.filter(s => selectedIds.includes(s.id));
    if (targetStudents.length === 0) {
      toast({ title: 'No Selection', description: 'Please select at least one student.', variant: 'destructive' });
      return;
    }

    setIsBatchProcessing(true);
    try {
      const nowIso = new Date().toISOString();
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      // Clean old records for selected students
      for (const s of targetStudents) {
        let del = supabase
          .from('attendance_records')
          .delete()
          .gte('timestamp', startOfToday.toISOString())
          .lte('timestamp', endOfToday.toISOString());

        if (s.user_id) del = del.eq('user_id', s.user_id);
        else del = del.eq('student_name', s.name);
        await del;
      }

      // Insert new records
      const rows = targetStudents.map(s => ({
        user_id: s.user_id || null,
        student_id: s.admission_number || s.roll_number || null,
        student_name: s.name,
        class: activeClass.class,
        section: activeClass.section,
        category: activeClass.category,
        roll_number: s.roll_number || null,
        status: targetStatus,
        source: 'teacher-portal',
        capture_mode: 'manual',
        timestamp: nowIso,
        device_info: {
          source: 'teacher-portal',
          capture_mode: 'manual',
          mark: 'manual_attendance',
          marked_by: teacherName,
          verified_by: teacherEmail,
          was_present_previous_day: Boolean(s.was_present_yesterday),
          metadata: {
            name: s.name,
            roll_number: s.roll_number,
            class: activeClass.class,
            section: activeClass.section,
            department: activeClass.category,
            manual: true,
            marked_at: nowIso,
          },
        },
        metadata: {
          source: 'teacher-portal',
          capture_mode: 'manual',
          mark: 'manual_attendance',
          marked_by: teacherName,
          verified_by: teacherEmail,
          was_present_previous_day: Boolean(s.was_present_yesterday),
          manual: true,
        },
      }));

      const { error } = await supabase.from('attendance_records').insert(rows);
      if (error) throw error;

      toast({
        title: `✅ Batch Marked ${targetStatus.toUpperCase()}`,
        description: `Successfully marked ${targetStudents.length} student${targetStudents.length > 1 ? 's' : ''} as ${targetStatus}.`,
      });

      setSelectedIds([]);
      onRefresh();
    } catch (err: any) {
      console.error('Batch error:', err);
      toast({ title: 'Batch Action Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // WhatsApp Alert Trigger
  const openWhatsAppParent = (student: ClassStudent) => {
    if (!student.parent_phone) {
      toast({ title: 'No Phone Number', description: 'Parent phone number is not listed for this student.', variant: 'destructive' });
      return;
    }
    const cleanPhone = student.parent_phone.replace(/[^0-9]/g, '');
    const phoneWithCode = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const msg = encodeURIComponent(
      `Hello ${student.parent_name || 'Parent'}, this is from PM Shri KV NFC Vigyan Vihar regarding ${student.name} (Class ${activeClass.category}). Today's attendance status is currently recorded as: ${student.today_status ? student.today_status.toUpperCase() : 'ABSENT'}. Please notify class teacher if student is attending or on medical leave.`
    );
    window.open(`https://wa.me/${phoneWithCode}?text=${msg}`, '_blank');
  };

  // Toggle selection
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredList.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredList.map(s => s.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  return (
    <Card className="border shadow-lg rounded-2xl overflow-hidden bg-background">
      <CardHeader className="border-b bg-muted/20 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <UserX className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-extrabold flex items-center gap-2">
                  <span>Daily Absentee & Verification Radar</span>
                  <Badge variant="outline" className="bg-rose-500/10 text-rose-600 border-rose-500/30 text-xs font-bold">
                    {counts.unattended} Need Review
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Check and verify absent students. 1-tap to mark Present in real-time with instant Supabase database synchronization.
                </CardDescription>
              </div>
            </div>
          </div>

          {/* Quick Filter Counts Pill */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onRefresh}
              className="text-xs h-8 rounded-xl gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        </div>

        {/* Highlight Banner if students attended yesterday but haven't checked in today */}
        {counts.attendedYesterdayButUnmarkedToday > 0 && (
          <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
              <span>
                <strong>{counts.attendedYesterdayButUnmarkedToday} student(s)</strong> attended class on <strong>{previousDayLabel}</strong> but have no gate capture today.
              </span>
            </div>
            <Button
              size="sm"
              disabled={isBatchProcessing}
              onClick={() => {
                const targetIds = students
                  .filter(s => s.was_present_yesterday && (!s.today_status || s.today_status === 'unmarked'))
                  .map(s => s.id);
                setSelectedIds(targetIds);
                toast({
                  title: 'Selected Potential Gate Misses',
                  description: `Selected ${targetIds.length} students who attended on ${previousDayLabel}.`,
                });
              }}
              className="text-xs h-7 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg px-2.5 shrink-0 shadow-xs"
            >
              Select All ({counts.attendedYesterdayButUnmarkedToday})
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Search and Sub-tabs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name, roll no, or phone..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs rounded-xl"
            />
          </div>

          {/* Sub-tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            <Button
              variant={filterTab === 'all_unattended' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilterTab('all_unattended')}
              className="h-7 text-xs rounded-lg px-2.5"
            >
              All Unattended ({counts.unattended})
            </Button>
            <Button
              variant={filterTab === 'unmarked' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilterTab('unmarked')}
              className="h-7 text-xs rounded-lg px-2.5 text-slate-600 dark:text-slate-300"
            >
              Unmarked ({counts.unmarked})
            </Button>
            <Button
              variant={filterTab === 'absent' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilterTab('absent')}
              className="h-7 text-xs rounded-lg px-2.5 text-rose-600"
            >
              Confirmed Absent ({counts.absent})
            </Button>
            <Button
              variant={filterTab === 'late' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilterTab('late')}
              className="h-7 text-xs rounded-lg px-2.5 text-amber-600"
            >
              Late ({counts.late})
            </Button>
          </div>
        </div>

        {/* Batch Action Toolbar (When students are selected) */}
        {selectedIds.length > 0 && (
          <div className="p-2.5 rounded-xl border border-blue-500/30 bg-blue-500/10 flex flex-wrap items-center justify-between gap-2 animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <Badge className="bg-blue-600 text-white font-bold text-xs">
                {selectedIds.length} Selected
              </Badge>
              <span className="text-xs text-muted-foreground">Bulk override actions:</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={isBatchProcessing}
                onClick={() => handleBatchMark('present')}
                className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg gap-1 shadow-sm"
              >
                {isBatchProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
                Mark Present ({selectedIds.length})
              </Button>

              <Button
                size="sm"
                disabled={isBatchProcessing}
                onClick={() => handleBatchMark('late')}
                className="text-xs h-7 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg gap-1 shadow-sm"
              >
                <Clock className="h-3 w-3" /> Mark Late
              </Button>

              <Button
                size="sm"
                disabled={isBatchProcessing}
                onClick={() => handleBatchMark('absent')}
                className="text-xs h-7 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg gap-1 shadow-sm"
              >
                <UserX className="h-3 w-3" /> Mark Absent
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds([])}
                className="text-xs h-7 rounded-lg text-muted-foreground"
              >
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Student Cards List */}
        {filteredList.length === 0 ? (
          <div className="text-center py-12 px-4 border border-dashed rounded-2xl bg-muted/10">
            <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-foreground">All Clear! No Absentees in This View</h4>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
              Every student in Class {activeClass.category} currently has verified attendance logged.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* Header select all bar */}
            <div className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground bg-muted/30 rounded-lg">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="flex items-center gap-2 hover:text-foreground font-semibold"
              >
                {selectedIds.length > 0 && selectedIds.length === filteredList.length ? (
                  <CheckSquare className="h-4 w-4 text-blue-600" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                <span>Select All ({filteredList.length})</span>
              </button>
              <span>{filteredList.length} Students listed</span>
            </div>

            {/* List */}
            {filteredList.map(student => {
              const isSelected = selectedIds.includes(student.id);
              const isCurrProcessing = isProcessing === student.id;

              return (
                <div
                  key={student.id}
                  className={`p-3 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isSelected
                      ? 'border-blue-500/60 bg-blue-500/5 shadow-xs'
                      : 'border-slate-200/80 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 bg-card'
                  }`}
                >
                  {/* Left: Checkbox + Avatar + Details */}
                  <div className="flex items-start sm:items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleSelectOne(student.id)}
                      className="mt-1 sm:mt-0 text-muted-foreground hover:text-foreground shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-blue-600" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>

                    <Avatar className="h-9 w-9 rounded-xl border shrink-0">
                      <AvatarImage
                        src={
                          student.photo_url
                            ? sanitizeStudentPhotoUrl(student.photo_url)
                            : `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(student.name || 'Student')}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`
                        }
                        alt={student.name}
                      />
                      <AvatarFallback className="text-xs font-bold bg-muted">
                        {student.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-foreground">{student.name}</span>
                        <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-4 bg-muted/50">
                          Roll #{student.roll_number || '—'}
                        </Badge>
                        {student.today_status === 'absent' ? (
                          <Badge className="bg-rose-500/10 text-rose-600 border-rose-500/30 text-[10px] px-1.5 py-0 h-4">
                            Absent
                          </Badge>
                        ) : student.today_status === 'late' ? (
                          <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px] px-1.5 py-0 h-4">
                            Late ({student.today_time || '—'})
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-500/10 text-slate-600 border-slate-500/30 text-[10px] px-1.5 py-0 h-4">
                            Unmarked
                          </Badge>
                        )}
                        {student.is_manual && (
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 text-[9px] px-1 py-0 h-3.5">
                            Manual
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                        {student.was_present_yesterday ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Attended on {previousDayLabel}
                          </span>
                        ) : (
                          <span className="text-muted-foreground flex items-center gap-1">
                            <UserMinus className="h-3 w-3" /> Not seen on {previousDayLabel}
                          </span>
                        )}
                        {student.parent_phone && (
                          <span className="font-mono text-muted-foreground">
                            📞 {student.parent_phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Instant 1-Click Action Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    {/* WhatsApp Notice Button */}
                    {student.parent_phone && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openWhatsAppParent(student)}
                        className="h-8 w-8 p-0 rounded-xl text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                        title="Send WhatsApp notice to parent"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </Button>
                    )}

                    {/* 1-Tap Mark Present */}
                    <Button
                      size="sm"
                      disabled={isCurrProcessing}
                      onClick={() => handleMarkStudent(student, 'present')}
                      className="text-xs h-8 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1 shadow-sm"
                      title="Instantly mark Present in database"
                    >
                      {isCurrProcessing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserCheck className="h-3.5 w-3.5" />
                      )}
                      Mark Present
                    </Button>

                    {/* 1-Tap Mark Late */}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isCurrProcessing}
                      onClick={() => handleMarkStudent(student, 'late')}
                      className="text-xs h-8 px-2.5 rounded-xl border-amber-500/30 text-amber-600 hover:bg-amber-500/10 font-semibold"
                      title="Mark Late"
                    >
                      Late
                    </Button>

                    {/* 1-Tap Mark Absent */}
                    {student.today_status !== 'absent' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isCurrProcessing}
                        onClick={() => handleMarkStudent(student, 'absent')}
                        className="text-xs h-8 px-2.5 rounded-xl border-rose-500/30 text-rose-600 hover:bg-rose-500/10 font-semibold"
                        title="Mark Absent"
                      >
                        Absent
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TeacherAbsenteeManager;
