import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Download,
  Plus,
  Calendar,
  AlertCircle,
  FileSpreadsheet,
  Zap,
  Phone,
  MessageSquare,
  UserX,
  UserCheck,
  QrCode,
  ScanFace,
  BookOpen,
  ArrowRight,
  TrendingUp,
  ShieldAlert,
  Sparkles,
  ChevronRight,
  CheckCheck,
  ExternalLink,
  ShieldCheck,
  HeartHandshake,
  Eye,
  Smartphone,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { sanitizeStudentPhotoUrl } from '@/utils/studentPhotoResolver';
import { ClassStudent, ClassAssignment } from './TeacherAdminWorkspace';

interface TeacherDashboardOverviewProps {
  teacherName: string;
  teacherEmail: string;
  avatarUrl?: string;
  activeClass: ClassAssignment;
  assignments: ClassAssignment[];
  students: ClassStudent[];
  previousDayLabel: string;
  pendingGatePassesCount: number;
  onSelectTab: (tab: string) => void;
  onSelectClass: (c: ClassAssignment) => void;
  onQuickMarkAttendance: (student: ClassStudent, status: 'present' | 'late' | 'absent') => void;
  onAutoMarkAbsent: (onlyPrevDayPresent?: boolean) => void;
  onMarkAllPresent: () => void;
  onOpenExportModal: () => void;
  isMarkingAttendance: boolean;
}

export const TeacherDashboardOverview: React.FC<TeacherDashboardOverviewProps> = ({
  teacherName,
  teacherEmail,
  avatarUrl,
  activeClass,
  assignments,
  students,
  previousDayLabel,
  pendingGatePassesCount,
  onSelectTab,
  onSelectClass,
  onQuickMarkAttendance,
  onAutoMarkAbsent,
  onMarkAllPresent,
  onOpenExportModal,
  isMarkingAttendance,
}) => {
  // Compute key summary statistics
  const stats = useMemo(() => {
    const total = (students || []).length;
    const present = (students || []).filter(s => s.today_status === 'present').length;
    const late = (students || []).filter(s => s.today_status === 'late').length;
    const absent = (students || []).filter(s => s.today_status === 'absent').length;
    const unmarked = (students || []).filter(s => !s.today_status || s.today_status === 'unmarked').length;
    const presentYesterday = (students || []).filter(s => s.was_present_yesterday).length;
    const unattendedFromYesterday = (students || []).filter(
      s => s.was_present_yesterday && (!s.today_status || s.today_status === 'unmarked')
    ).length;
    const biometricEnrolled = (students || []).filter(s => s.has_face_descriptor).length;
    const manualMarksCount = (students || []).filter(s => s.is_manual).length;
    const attendancePct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    return {
      total,
      present,
      late,
      absent,
      unmarked,
      presentYesterday,
      unattendedFromYesterday,
      biometricEnrolled,
      manualMarksCount,
      attendancePct,
    };
  }, [students]);

  // Recent check-in live stream (students marked present/late today)
  const recentCheckIns = useMemo(() => {
    return (students || [])
      .filter(s => s.today_status === 'present' || s.today_status === 'late')
      .slice(0, 6);
  }, [students]);

  // Absent & Unmarked students for quick review
  const absenteesList = useMemo(() => {
    return (students || []).filter(s => s.today_status === 'absent' || (!s.today_status || s.today_status === 'unmarked')).slice(0, 5);
  }, [students]);

  const getStudentPhotoUrl = (student: ClassStudent) => {
    if (student.photo_url) {
      const clean = sanitizeStudentPhotoUrl(student.photo_url);
      if (clean) return clean;
    }
    return `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(student.name || 'Student')}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
  };

  const openWhatsAppParent = (student: ClassStudent) => {
    if (!student.parent_phone) return;
    const cleanPhone = student.parent_phone.replace(/[^0-9]/g, '');
    const phoneWithCode = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const msg = encodeURIComponent(
      `Hello ${student.parent_name || 'Parent'}, this is from PM Shri KV NFC Vigyan Vihar regarding ${student.name} (Class ${activeClass?.category}). Today's attendance status is: ${student.today_status ? student.today_status.toUpperCase() : 'ABSENT'}. Please contact school administration if you have any questions.`
    );
    window.open(`https://wa.me/${phoneWithCode}?text=${msg}`, '_blank');
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ─── 1. TOP MOBILE-FRIENDLY CLASS SELECTOR PILLS ─────────────────────── */}
      {(assignments || []).length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <span className="text-xs font-bold text-muted-foreground shrink-0 pl-1">My Classes:</span>
          {(assignments || []).map((a) => {
            const isSelected = activeClass?.category === a.category;
            return (
              <button
                key={a.category}
                type="button"
                onClick={() => onSelectClass(a)}
                className={`px-3.5 py-1.5 rounded-2xl text-xs font-mono font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 ring-2 ring-primary/40'
                    : 'bg-card text-muted-foreground hover:text-foreground border border-slate-200 dark:border-white/10'
                }`}
              >
                <span>Class {a.class}–{a.section}</span>
                {isSelected && <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />}
              </button>
            );
          })}
        </div>
      )}

      {/* ─── 2. ATTENDANCE VITALS NANO BENTO STRIP ────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        {/* Total Strength */}
        <div
          onClick={() => onSelectTab('students')}
          className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-card hover:border-primary/40 transition-all cursor-pointer shadow-xs group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground">Class Roster</span>
            <div className="h-7 w-7 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
              <Users className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-foreground">{stats.total}</span>
            <span className="text-[10px] text-muted-foreground font-mono">{stats.biometricEnrolled} Enrolled</span>
          </div>
        </div>

        {/* Present Today */}
        <div
          onClick={() => onSelectTab('daily')}
          className="p-3.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40 transition-all cursor-pointer shadow-xs group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Present</span>
            <div className="h-7 w-7 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{stats.present}</span>
            <span className="text-[10px] text-emerald-600/80 font-mono">
              {stats.late > 0 ? `+${stats.late} Late` : `${stats.attendancePct}% Rate`}
            </span>
          </div>
        </div>

        {/* Absent / Unmarked */}
        <div
          onClick={() => onSelectTab('absentees')}
          className="p-3.5 rounded-2xl border border-rose-500/20 bg-rose-500/5 hover:border-rose-500/40 transition-all cursor-pointer shadow-xs group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">Absent / Pending</span>
            <div className="h-7 w-7 rounded-xl bg-rose-500/15 flex items-center justify-center text-rose-600 dark:text-rose-400 group-hover:scale-110 transition-transform">
              <XCircle className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
              {stats.absent + stats.unmarked}
            </span>
            <span className="text-[10px] text-rose-600/80 font-mono">
              {stats.unmarked > 0 ? `${stats.unmarked} unmarked` : 'Marked'}
            </span>
          </div>
        </div>

        {/* Attendance Rate */}
        <div
          onClick={() => onSelectTab('register')}
          className="p-3.5 rounded-2xl border border-blue-500/20 bg-blue-500/5 hover:border-blue-500/40 transition-all cursor-pointer shadow-xs group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">Turnout</span>
            <div className="h-7 w-7 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
              <Zap className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono">
              {stats.attendancePct}%
            </span>
            <span className={`text-[10px] font-bold font-mono ${stats.attendancePct >= 75 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {stats.attendancePct >= 75 ? 'CBSE Compliant' : 'Defaulter Alert'}
            </span>
          </div>
        </div>
      </div>

      {/* ─── 3. CRITICAL ACTION ALERT BANNER (IF UNATTENDED FROM PREVIOUS DAY) ─── */}
      {stats.unattendedFromYesterday > 0 && (
        <Card className="border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent rounded-2xl shadow-xs overflow-hidden">
          <CardContent className="p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                <AlertCircle className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5 flex-wrap">
                  <span>{stats.unattendedFromYesterday} Student{stats.unattendedFromYesterday > 1 ? 's' : ''} Present on {previousDayLabel} Not Checked In Today</span>
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Recommended: Auto-mark these students absent or verify manual roll call.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              <Button
                size="sm"
                disabled={isMarkingAttendance}
                onClick={() => onAutoMarkAbsent(true)}
                className="text-xs h-8 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl gap-1.5 shadow-sm w-full sm:w-auto"
              >
                <UserX className="h-3.5 w-3.5" />
                Auto-Mark Absent ({stats.unattendedFromYesterday})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── 4. 1-TAP RAPID ACTION TILES (MOBILE THUMB DOCK) ─────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Quick Actions & Classroom Tools
          </h3>
          <span className="text-[10px] text-primary font-semibold">1-Tap Fast Launch</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5">
          {/* Roll Call */}
          <button
            type="button"
            onClick={() => onSelectTab('daily')}
            className="p-3 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-card hover:border-primary/50 hover:bg-primary/5 active:scale-95 transition-all text-left flex flex-col justify-between gap-3 group shadow-xs"
          >
            <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <CheckCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black text-foreground">Roll Call</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Take daily attendance</p>
            </div>
          </button>

          {/* Absentee Radar */}
          <button
            type="button"
            onClick={() => onSelectTab('absentees')}
            className="p-3 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-card hover:border-rose-500/50 hover:bg-rose-500/5 active:scale-95 transition-all text-left flex flex-col justify-between gap-3 group shadow-xs"
          >
            <div className="h-9 w-9 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <UserX className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black text-foreground">Absentees</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{stats.absent + stats.unmarked} to review</p>
            </div>
          </button>

          {/* AI Parent Notices */}
          <button
            type="button"
            onClick={() => onSelectTab('notifications')}
            className="p-3 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-card hover:border-indigo-500/50 hover:bg-indigo-500/5 active:scale-95 transition-all text-left flex flex-col justify-between gap-3 group shadow-xs"
          >
            <div className="h-9 w-9 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black text-foreground">Parent Notices</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">AI Writer & WhatsApp</p>
            </div>
          </button>

          {/* Monthly Register */}
          <button
            type="button"
            onClick={() => onSelectTab('register')}
            className="p-3 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-card hover:border-blue-500/50 hover:bg-blue-500/5 active:scale-95 transition-all text-left flex flex-col justify-between gap-3 group shadow-xs"
          >
            <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black text-foreground">Register</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Monthly P/A Matrix</p>
            </div>
          </button>

          {/* Export Attendance */}
          <button
            type="button"
            onClick={onOpenExportModal}
            className="p-3 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-card hover:border-emerald-500/50 hover:bg-emerald-500/5 active:scale-95 transition-all text-left flex flex-col justify-between gap-3 group shadow-xs"
          >
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black text-foreground">Export</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Excel & PDF reports</p>
            </div>
          </button>

          {/* Gate Passes */}
          <button
            type="button"
            onClick={() => onSelectTab('gate_passes')}
            className="p-3 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-card hover:border-amber-500/50 hover:bg-amber-500/5 active:scale-95 transition-all text-left flex flex-col justify-between gap-3 group shadow-xs"
          >
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black text-foreground">Gate Pass</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {pendingGatePassesCount > 0 ? `${pendingGatePassesCount} Pending` : 'Issue Pass'}
              </p>
            </div>
          </button>

          {/* Android Widgets */}
          <button
            type="button"
            onClick={() => onSelectTab('widgets')}
            className="p-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60 hover:bg-amber-500/10 active:scale-95 transition-all text-left flex flex-col justify-between gap-3 group shadow-xs col-span-2 sm:col-span-1"
          >
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black text-foreground flex items-center gap-1">
                <span>Android Widgets</span>
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Material You Board</p>
            </div>
          </button>
        </div>
      </div>

      {/* ─── 5. DUAL COCKPIT: RECENT LIVE STREAM & UNMARKED RADAR ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Unmarked / Absent Students Fast Roll Call List */}
        <Card className="rounded-2xl border shadow-xs">
          <CardHeader className="p-4 pb-2.5 border-b bg-muted/20 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xs sm:text-sm font-bold flex items-center gap-1.5">
                <UserX className="h-4 w-4 text-rose-500" />
                <span>Pending / Absent Review ({stats.absent + stats.unmarked})</span>
              </CardTitle>
              <CardDescription className="text-[10px] mt-0.5">
                Quick 1-tap mark for students awaiting attendance
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onSelectTab('daily')}
              className="text-[11px] h-7 px-2 font-bold text-primary gap-1"
            >
              Full List <ChevronRight className="h-3 w-3" />
            </Button>
          </CardHeader>

          <CardContent className="p-3 space-y-2">
            {absenteesList.length === 0 ? (
              <div className="text-center py-6 text-xs text-muted-foreground flex flex-col items-center gap-1">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                <span className="font-bold text-foreground">All attendance marked for today!</span>
                <span className="text-[10px]">No pending or unmarked students in Class {activeClass.category}.</span>
              </div>
            ) : (
              absenteesList.map(student => (
                <div
                  key={student.id}
                  className="p-2.5 rounded-xl border bg-card/60 hover:bg-card flex items-center justify-between gap-2 text-xs transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar className="h-8 w-8 rounded-xl border shrink-0">
                      <AvatarImage src={getStudentPhotoUrl(student)} alt={student.name} />
                      <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                        {student.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-bold text-foreground truncate">{student.name}</p>
                      <p className="text-[10px] font-mono text-muted-foreground truncate">
                        Roll #{student.roll_number || '—'} • {student.was_present_yesterday ? 'Present Yesterday' : 'No Entry'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onQuickMarkAttendance(student, 'present')}
                      className="h-7 px-2 text-[10px] font-bold rounded-lg text-emerald-600 hover:bg-emerald-500/10 border-emerald-500/30"
                      title="Mark Present"
                    >
                      P
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onQuickMarkAttendance(student, 'absent')}
                      className="h-7 px-2 text-[10px] font-bold rounded-lg text-rose-600 hover:bg-rose-500/10 border-rose-500/30"
                      title="Mark Absent"
                    >
                      A
                    </Button>
                    {student.parent_phone && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openWhatsAppParent(student)}
                        className="h-7 w-7 p-0 text-emerald-600 rounded-lg"
                        title="WhatsApp Parent"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}

            {stats.unmarked > 0 && (
              <div className="pt-2 flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={onMarkAllPresent}
                  disabled={isMarkingAttendance}
                  className="w-full text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl gap-1.5 shadow-sm"
                >
                  <UserCheck className="h-3.5 w-3.5" /> Mark All Remaining Present ({stats.unmarked})
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Live Stream of Recent Check-ins */}
        <Card className="rounded-2xl border shadow-xs">
          <CardHeader className="p-4 pb-2.5 border-b bg-muted/20 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xs sm:text-sm font-bold flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Live Check-in Stream ({stats.present + stats.late})</span>
              </CardTitle>
              <CardDescription className="text-[10px] mt-0.5">
                Real-time entries from Spotlight Engine, Gates & Kiosks
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onSelectTab('daily')}
              className="text-[11px] h-7 px-2 font-bold text-primary gap-1"
            >
              View Roster <ChevronRight className="h-3 w-3" />
            </Button>
          </CardHeader>

          <CardContent className="p-3 space-y-2">
            {recentCheckIns.length === 0 ? (
              <div className="text-center py-6 text-xs text-muted-foreground">
                No students checked in yet today.
              </div>
            ) : (
              recentCheckIns.map(student => (
                <div
                  key={student.id}
                  className="p-2.5 rounded-xl border bg-card/60 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar className="h-8 w-8 rounded-xl border shrink-0">
                      <AvatarImage src={getStudentPhotoUrl(student)} alt={student.name} />
                      <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                        {student.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-bold text-foreground truncate">{student.name}</p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 truncate">
                        <span className="font-mono">Roll #{student.roll_number || '—'}</span>
                        <span>•</span>
                        <span className="capitalize">{student.capture_mode || student.attendance_source || 'Biometric'}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge
                      className={`text-[10px] font-bold ${
                        student.today_status === 'present'
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                      }`}
                    >
                      {student.today_time || (student.today_status === 'late' ? 'Late' : 'Present')}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TeacherDashboardOverview;
