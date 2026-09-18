import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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
  Zap,
  Phone,
  MessageSquare,
  Search,
  CheckSquare,
  GraduationCap,
  Loader2,
  Check,
  UserX,
  UserCheck,
  CheckCheck,
  RefreshCw,
  QrCode,
  ScanFace,
  BookOpen,
  Filter,
  ShieldCheck,
  LayoutDashboard,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Share2,
  Smartphone,
  ExternalLink,
  User,
  Home,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { ClassStudent, ClassAssignment } from './TeacherAdminWorkspace';
import { sanitizeStudentPhotoUrl } from '@/utils/studentPhotoResolver';
import { TeacherGatePassReview } from './TeacherGatePassReview';
import { TeacherAbsenteeManager } from './TeacherAbsenteeManager';
import { TeacherMonthlyRegister } from './TeacherMonthlyRegister';

interface TeacherMobileAppViewProps {
  teacherName: string;
  teacherEmail: string;
  avatarUrl?: string;
  activeClass: ClassAssignment | null;
  assignments: ClassAssignment[];
  students: ClassStudent[];
  stats: {
    total: number;
    present: number;
    late: number;
    absent: number;
    unmarked: number;
    attendancePct: number;
    unattendedFromYesterday: number;
  };
  previousDayLabel: string;
  pendingGatePassesCount: number;
  isMarkingAttendance: boolean;
  onSelectClass: (cls: ClassAssignment) => void;
  onQuickMarkAttendance: (studentId: string, status: 'present' | 'late' | 'absent') => Promise<void>;
  onAutoMarkAbsent: (onlyUnattendedFromYesterday?: boolean) => Promise<void>;
  onMarkAllPresent: () => Promise<void>;
  onOpenAddStudent?: () => void;
  onOpenFaceCapture?: (student: ClassStudent) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const TeacherMobileAppView: React.FC<TeacherMobileAppViewProps> = ({
  teacherName,
  teacherEmail,
  avatarUrl,
  activeClass,
  assignments,
  students,
  stats,
  previousDayLabel,
  pendingGatePassesCount,
  isMarkingAttendance,
  onSelectClass,
  onQuickMarkAttendance,
  onAutoMarkAbsent,
  onMarkAllPresent,
  onOpenAddStudent,
  onOpenFaceCapture,
  onRefresh,
  isRefreshing = false,
}) => {
  const { trigger: haptic } = useHapticFeedback();
  const [mobileTab, setMobileTab] = useState<'dashboard' | 'rollcall' | 'absentees' | 'gatepass' | 'register'>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [rollCallFilter, setRollCallFilter] = useState<'all' | 'unmarked' | 'present' | 'late' | 'absent'>('all');

  // Greeting based on current time
  const greeting = useMemo(() => {
    const hr = new Date().getHours();
    if (hr < 12) return 'Good Morning';
    if (hr < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  // Filtered students for mobile roll call
  const filteredStudents = useMemo(() => {
    let list = students;

    if (rollCallFilter === 'unmarked') {
      list = list.filter((s) => !s.today_status || s.today_status === 'unmarked');
    } else if (rollCallFilter !== 'all') {
      list = list.filter((s) => s.today_status === rollCallFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.roll_number && s.roll_number.toLowerCase().includes(q)) ||
          (s.admission_number && s.admission_number.toLowerCase().includes(q))
      );
    }

    return list;
  }, [students, rollCallFilter, searchQuery]);

  // Absentees list for quick WhatsApp
  const absenteesList = useMemo(() => {
    return students.filter((s) => s.today_status === 'absent' || (!s.today_status || s.today_status === 'unmarked'));
  }, [students]);

  const sendWhatsAppToParent = (student: ClassStudent) => {
    haptic('selection');
    if (!student.parent_phone) return;
    const clean = student.parent_phone.replace(/[^0-9]/g, '');
    const phone = clean.length === 10 ? `91${clean}` : clean;
    const statusText = student.today_status === 'present' ? 'PRESENT' : student.today_status === 'late' ? 'LATE' : 'ABSENT';
    const text = encodeURIComponent(
      `🏛️ *PM SHRI KV NFC VIGYAN VIHAR*\n\nDear Parent of *${student.name}* (Class ${activeClass?.category || 'Student'}),\n\nThis is an official update from Class Teacher ${teacherName}. Today's attendance status is marked as: *${statusText}*.\n\n_If you have any queries or medical emergency, please reply to this notice._`
    );
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  const handleCallParent = (phone?: string) => {
    haptic('selection');
    if (phone) window.open(`tel:${phone.replace(/[^0-9+]/g, '')}`, '_self');
  };

  // SVG Gauge Calculations
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (stats.attendancePct / 100) * circumference;

  return (
    <div className="space-y-4 pb-28 font-sans select-none max-w-lg mx-auto">
      {/* ── 1. Mobile Header & Teacher Profile Bar ── */}
      <div className="p-4 rounded-3xl bg-card border border-border/80 shadow-md space-y-3 relative overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <Link to="/profile" className="flex items-center gap-3 min-w-0 group">
            <Avatar className="h-12 w-12 rounded-2xl border-2 border-primary/20 shadow-sm shrink-0 group-hover:scale-105 transition-transform">
              <AvatarImage src={avatarUrl} alt={teacherName} />
              <AvatarFallback className="rounded-2xl font-black bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-sm">
                {teacherName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <span className="text-[11px] font-bold text-muted-foreground block">
                {greeting},
              </span>
              <h2 className="text-base font-black text-foreground truncate leading-tight group-hover:text-primary transition-colors">
                {teacherName}
              </h2>
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                PM Shri KV NFC • Class In-Charge
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-1 shrink-0">
            {onRefresh && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  haptic('selection');
                  onRefresh();
                }}
                className="h-9 w-9 rounded-xl hover:bg-muted"
                title="Refresh Data"
              >
                <RefreshCw className={`h-4 w-4 text-muted-foreground ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
              </Button>
            )}

            <Link
              to="/"
              className="h-9 w-9 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
              title="Return to Main Portal"
            >
              <Home className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Horizontal Class Selector Pill Strip */}
        {assignments.length > 0 && (
          <div className="pt-2 border-t border-border/60">
            <div className="flex items-center justify-between mb-1.5 px-0.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                Your Assigned Classes
              </span>
              <span className="text-[10px] text-primary font-bold">
                {activeClass?.category} Active
              </span>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {assignments.map((cls) => {
                const isSelected = activeClass?.category === cls.category;
                return (
                  <button
                    key={cls.category}
                    onClick={() => {
                      haptic('selection');
                      onSelectClass(cls);
                    }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 flex items-center gap-1.5 border shadow-xs ${
                      isSelected
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-600 shadow-md shadow-blue-500/20 scale-102'
                        : 'bg-muted/40 text-muted-foreground border-border/70 hover:bg-muted'
                    }`}
                  >
                    <span>Class {cls.category}</span>
                    {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Mobile Main Tab Contents ── */}
      <div>
        {/* TAB 1: DASHBOARD */}
        {mobileTab === 'dashboard' && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0.88, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-3.5"
          >
            {/* Real-Time Attendance Donut KPI Card */}
            <Card className="rounded-3xl border border-border/80 bg-gradient-to-b from-card to-muted/20 shadow-md overflow-hidden">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
                    <span className="text-xs font-black uppercase tracking-wider text-foreground">
                      Today's Live Attendance
                    </span>
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px] font-bold">
                    Class {activeClass?.category}
                  </Badge>
                </div>

                <div className="flex items-center justify-between gap-4">
                  {/* Circular Donut Progress Ring */}
                  <div className="relative h-24 w-24 shrink-0 flex items-center justify-center">
                    <svg className="h-24 w-24 -rotate-90 transform" viewBox="0 0 80 80">
                      <circle
                        cx="40"
                        cy="40"
                        r={radius}
                        className="stroke-muted/40"
                        strokeWidth="8"
                        fill="transparent"
                      />
                      <circle
                        cx="40"
                        cy="40"
                        r={radius}
                        className="stroke-emerald-500 transition-all duration-700 ease-out"
                        strokeWidth="8"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                        fill="transparent"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-xl font-black font-mono text-foreground leading-none">
                        {stats.attendancePct}%
                      </span>
                      <span className="text-[9px] font-bold text-muted-foreground mt-0.5">
                        RATE
                      </span>
                    </div>
                  </div>

                  {/* 4 Multi-colored Stats Tiles */}
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    <div className="p-2.5 rounded-2xl bg-muted/50 border border-border/60">
                      <span className="text-[10px] font-bold text-muted-foreground block">Total</span>
                      <span className="text-lg font-black font-mono text-foreground">{stats.total}</span>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25">
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block">Present</span>
                      <span className="text-lg font-black font-mono text-emerald-700 dark:text-emerald-300">{stats.present}</span>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/25">
                      <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 block">Late</span>
                      <span className="text-lg font-black font-mono text-amber-700 dark:text-amber-300">{stats.late}</span>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/25">
                      <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 block">Absent</span>
                      <span className="text-lg font-black font-mono text-rose-700 dark:text-rose-300">{stats.absent}</span>
                    </div>
                  </div>
                </div>

                {/* Quick Automation Actions */}
                <div className="flex gap-2 pt-1 border-t border-border/50">
                  <Button
                    size="sm"
                    onClick={() => {
                      haptic('selection');
                      onAutoMarkAbsent(true);
                    }}
                    disabled={isMarkingAttendance}
                    className="flex-1 rounded-2xl h-10 text-xs font-black bg-rose-600 hover:bg-rose-700 text-white shadow-sm gap-1.5"
                  >
                    {isMarkingAttendance ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
                    Auto-Mark Absent ({stats.unattendedFromYesterday})
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      haptic('selection');
                      onMarkAllPresent();
                    }}
                    disabled={isMarkingAttendance}
                    className="flex-1 rounded-2xl h-10 text-xs font-black border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 gap-1.5"
                  >
                    <CheckCheck className="h-3.5 w-3.5 text-emerald-600" />
                    Mark All Present
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 4 Fast Mobile Power Shortcuts */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => {
                  haptic('selection');
                  setMobileTab('rollcall');
                }}
                className="p-3.5 rounded-3xl bg-card border border-border/80 shadow-xs text-left hover:border-primary/50 transition-all flex flex-col justify-between h-28 active:scale-98"
              >
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-600 flex items-center justify-center">
                  <CheckSquare className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-foreground">Roll Call Session</h4>
                  <p className="text-[10px] text-muted-foreground">{stats.unmarked} Unmarked Students</p>
                </div>
              </button>

              <button
                onClick={() => {
                  haptic('selection');
                  setMobileTab('absentees');
                }}
                className="p-3.5 rounded-3xl bg-card border border-border/80 shadow-xs text-left hover:border-rose-500/50 transition-all flex flex-col justify-between h-28 active:scale-98"
              >
                <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 flex items-center justify-center">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-foreground">Absentee Radar</h4>
                  <p className="text-[10px] text-muted-foreground">1-Tap WhatsApp Alerts</p>
                </div>
              </button>

              <button
                onClick={() => {
                  haptic('selection');
                  setMobileTab('gatepass');
                }}
                className="p-3.5 rounded-3xl bg-card border border-border/80 shadow-xs text-left hover:border-amber-500/50 transition-all flex flex-col justify-between h-28 active:scale-98"
              >
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center relative">
                  <QrCode className="h-5 w-5" />
                  {pendingGatePassesCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center animate-pulse">
                      {pendingGatePassesCount}
                    </span>
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-black text-foreground">Gate Pass Review</h4>
                  <p className="text-[10px] text-muted-foreground">{pendingGatePassesCount} Pending Tier 1</p>
                </div>
              </button>

              <button
                onClick={() => {
                  haptic('selection');
                  setMobileTab('register');
                }}
                className="p-3.5 rounded-3xl bg-card border border-border/80 shadow-xs text-left hover:border-indigo-500/50 transition-all flex flex-col justify-between h-28 active:scale-98"
              >
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 flex items-center justify-center">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-foreground">Monthly Register</h4>
                  <p className="text-[10px] text-muted-foreground">Download Excel Logs</p>
                </div>
              </button>
            </div>
          </motion.div>
        )}

        {/* TAB 2: MOBILE ROLL CALL / ATTENDANCE */}
        {mobileTab === 'rollcall' && (
          <motion.div
            key="rollcall"
            initial={{ opacity: 0.88, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-3"
          >
            {/* Search & Filter Bar */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search student by name, roll no..."
                  className="h-10 pl-9 rounded-2xl text-xs bg-card border-border/80"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                {[
                  { id: 'all', label: 'All', count: students.length },
                  { id: 'unmarked', label: 'Unmarked', count: stats.unmarked },
                  { id: 'present', label: 'Present', count: stats.present },
                  { id: 'late', label: 'Late', count: stats.late },
                  { id: 'absent', label: 'Absent', count: stats.absent },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      haptic('selection');
                      setRollCallFilter(tab.id as any);
                    }}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1 border ${
                      rollCallFilter === tab.id
                        ? 'bg-primary text-white border-primary shadow-xs'
                        : 'bg-card text-muted-foreground border-border/70'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className="text-[10px] opacity-80">({tab.count})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Student Roll Call Cards Feed */}
            <div className="space-y-2.5">
              {filteredStudents.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-xs rounded-3xl bg-card border border-dashed">
                  No students matching your filter.
                </div>
              ) : (
                filteredStudents.map((s) => {
                  const photoUrl = s.photo_url
                    ? sanitizeStudentPhotoUrl(s.photo_url)
                    : `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(s.name)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;

                  const isPresent = s.today_status === 'present';
                  const isLate = s.today_status === 'late';
                  const isAbsent = s.today_status === 'absent';
                  const isUnmarked = !s.today_status || s.today_status === 'unmarked';

                  return (
                    <div
                      key={s.id}
                      className={`p-3 rounded-2xl border transition-all space-y-2.5 ${
                        isPresent
                          ? 'border-emerald-500/30 bg-emerald-500/5'
                          : isLate
                          ? 'border-amber-500/30 bg-amber-500/5'
                          : isAbsent
                          ? 'border-rose-500/30 bg-rose-500/5'
                          : 'border-border/80 bg-card shadow-xs'
                      }`}
                    >
                      {/* Student Info Top Row */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar className="h-10 w-10 rounded-xl border border-border/80 shrink-0">
                            <AvatarImage src={photoUrl} alt={s.name} />
                            <AvatarFallback className="rounded-xl font-bold bg-muted text-xs">
                              {s.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-black text-foreground truncate">{s.name}</span>
                              {s.roll_number && (
                                <Badge variant="outline" className="font-mono text-[9px] px-1 py-0 h-4">
                                  #{s.roll_number}
                                </Badge>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">
                              ID: {s.admission_number || s.id}
                              {s.today_time && ` • ${s.today_time}`}
                            </p>
                          </div>
                        </div>

                        {/* Direct Parent Action buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          {s.parent_phone && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleCallParent(s.parent_phone)}
                                className="h-8 w-8 rounded-xl bg-muted/60 hover:bg-muted text-muted-foreground flex items-center justify-center transition-colors"
                                title="Call Parent"
                              >
                                <Phone className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => sendWhatsAppToParent(s)}
                                className="h-8 w-8 rounded-xl bg-emerald-500/15 hover:bg-emerald-500 text-emerald-600 hover:text-white flex items-center justify-center transition-colors"
                                title="WhatsApp Notice"
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* 3 Large Touch Targets: [Present (P)] [Late (L)] [Absent (A)] */}
                      <div className="grid grid-cols-3 gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            haptic('selection');
                            onQuickMarkAttendance(s.id, 'present');
                          }}
                          className={`py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1 border active:scale-95 ${
                            isPresent
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-500/30'
                              : 'bg-background hover:bg-emerald-500/10 text-muted-foreground border-border/70'
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" /> Present (P)
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            haptic('selection');
                            onQuickMarkAttendance(s.id, 'late');
                          }}
                          className={`py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1 border active:scale-95 ${
                            isLate
                              ? 'bg-amber-600 text-white border-amber-600 shadow-sm shadow-amber-500/30'
                              : 'bg-background hover:bg-amber-500/10 text-muted-foreground border-border/70'
                          }`}
                        >
                          <Clock className="h-3.5 w-3.5" /> Late (L)
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            haptic('selection');
                            onQuickMarkAttendance(s.id, 'absent');
                          }}
                          className={`py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1 border active:scale-95 ${
                            isAbsent
                              ? 'bg-rose-600 text-white border-rose-600 shadow-sm shadow-rose-500/30'
                              : 'bg-background hover:bg-rose-500/10 text-muted-foreground border-border/70'
                          }`}
                        >
                          <XCircle className="h-3.5 w-3.5" /> Absent (A)
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}

        {/* TAB 3: ABSENTEE RADAR & 1-TAP WHATSAPP BLAST */}
        {mobileTab === 'absentees' && (
          <motion.div
            key="absentees"
            initial={{ opacity: 0.88, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-3"
          >
            <div className="p-4 rounded-3xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-rose-700 dark:text-rose-300">
                  {absenteesList.length} Absent / Unmarked Today
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Send immediate WhatsApp notifications to guardians with 1-tap.
                </p>
              </div>
              <Badge className="bg-rose-600 text-white font-mono text-xs">
                Class {activeClass?.category}
              </Badge>
            </div>

            <div className="space-y-2">
              {absenteesList.length === 0 ? (
                <div className="p-8 text-center rounded-3xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                  <p className="text-sm font-bold">Zero Absentees Today!</p>
                  <p className="text-xs text-muted-foreground">100% of students in Class {activeClass?.category} are present.</p>
                </div>
              ) : (
                absenteesList.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 rounded-2xl bg-card border border-border/80 flex items-center justify-between gap-2 shadow-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-foreground truncate">{s.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Parent: <strong className="text-foreground">{s.parent_name || 'Guardian'}</strong> • {s.parent_phone || 'No phone'}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => sendWhatsAppToParent(s)}
                      disabled={!s.parent_phone}
                      className="rounded-xl h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs gap-1.5 shrink-0"
                    >
                      <Send className="h-3 w-3" /> WhatsApp
                    </Button>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}

        {/* TAB 4: GATE PASS MOBILE REVIEW */}
        {mobileTab === 'gatepass' && (
          <motion.div
            key="gatepass"
            initial={{ opacity: 0.88, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <TeacherGatePassReview
              activeClass={activeClass}
              teacherName={teacherName}
              teacherEmail={teacherEmail}
              students={students}
            />
          </motion.div>
        )}

        {/* TAB 5: MONTHLY REGISTER & EXPORT */}
        {mobileTab === 'register' && (
          <motion.div
            key="register"
            initial={{ opacity: 0.88, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <TeacherMonthlyRegister
              activeClass={activeClass}
              students={students}
            />
          </motion.div>
        )}
      </div>

      {/* ── 3. Bottom Teacher Mobile App Dock ── */}
      <nav className="fixed inset-x-0 bottom-0 z-50 safe-area-bottom pointer-events-none">
        <div className="mx-3 mb-2.5 max-w-lg mx-auto p-1.5 rounded-3xl bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-2xl border border-white/10 shadow-2xl flex items-center justify-around pointer-events-auto">
          {[
            { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
            { id: 'rollcall', label: 'Roll Call', icon: CheckSquare, badge: stats.unmarked > 0 ? stats.unmarked : undefined },
            { id: 'absentees', label: 'Absentees', icon: UserX, badge: absenteesList.length > 0 ? absenteesList.length : undefined },
            { id: 'gatepass', label: 'Gate Pass', icon: QrCode, badge: pendingGatePassesCount > 0 ? pendingGatePassesCount : undefined },
            { id: 'register', label: 'Register', icon: Calendar },
          ].map((item) => {
            const isActive = mobileTab === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => {
                  haptic('selection');
                  setMobileTab(item.id as any);
                }}
                className={`relative py-1.5 px-3 rounded-2xl flex flex-col items-center gap-0.5 transition-all duration-200 flex-1 ${
                  isActive
                    ? 'text-blue-400 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="teacher-mobile-dock-pill"
                    className="absolute inset-0 rounded-2xl bg-blue-500/20 border border-blue-500/40"
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                  />
                )}
                <div className="relative z-10">
                  <Icon className="h-5 w-5" />
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 h-3.5 min-w-[14px] px-1 rounded-full bg-rose-500 text-white text-[8px] font-black flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] relative z-10 tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default TeacherMobileAppView;
