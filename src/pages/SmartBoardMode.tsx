import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Tv,
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  Shuffle,
  Mic,
  Timer,
  Edit3,
  Users,
  ChevronLeft,
  Sparkles,
  RefreshCw,
  Clock,
  Calendar,
  Award,
  CheckCircle2,
  AlertCircle,
  Clock3,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ClassStudent, ClassAssignment, getPreviousWorkingDay } from '@/components/teacher/TeacherAdminWorkspace';
import { sanitizeStudentPhotoUrl } from '@/utils/studentPhotoResolver';
import { matchesClassAndSection, parseClassSection, fetchTeacherCategories } from '@/utils/teacherAccess';
import { useUserRole } from '@/hooks/useUserRole';
import { SmartBoardScratchpad } from '@/components/widgets/smartboard/SmartBoardScratchpad';
import { DecibelMeterWidget } from '@/components/widgets/android/DecibelMeterWidget';
import { StudentPickerWidget } from '@/components/widgets/android/StudentPickerWidget';
import { StopwatchWidget } from '@/components/widgets/android/StopwatchWidget';
import { playSchoolBell, playSuccessChime } from '@/utils/audioChimes';

const DEFAULT_CLASSES: ClassAssignment[] = [
  { class: '6', section: 'A', category: '6-A' },
  { class: '10', section: 'A', category: '10-A' },
  { class: '10', section: 'B', category: '10-B' },
  { class: '9', section: 'A', category: '9-A' },
  { class: '8', section: 'A', category: '8-A' },
  { class: '11', section: 'A', category: '11-A' },
  { class: '12', section: 'A', category: '12-A' },
];

export const SmartBoardMode: React.FC = () => {
  const navigate = useNavigate();
  const { userId } = useUserRole();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<'scratchpad' | 'picker' | 'noise' | 'timer' | 'roster'>('scratchpad');
  const [activeClass, setActiveClass] = useState<ClassAssignment>(DEFAULT_CLASSES[0]);
  const [classList, setClassList] = useState<ClassAssignment[]>(DEFAULT_CLASSES);
  const [students, setStudents] = useState<ClassStudent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Clock tick
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Handle Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Fetch teacher categories
  useEffect(() => {
    if (!userId) return;
    fetchTeacherCategories(userId).then((categories) => {
      if (categories && categories.length > 0) {
        const assigned = categories
          .map((c) => {
            const parsed = parseClassSection(c);
            return parsed ? { class: parsed.className, section: parsed.section, category: c } : null;
          })
          .filter((c): c is ClassAssignment => Boolean(c));

        if (assigned.length > 0) {
          const combined = [...assigned];
          DEFAULT_CLASSES.forEach((d) => {
            if (!combined.some((c) => c.category === d.category)) combined.push(d);
          });
          setClassList(combined);
          setActiveClass(combined[0]);
        }
      }
    });
  }, [userId]);

  // Load students for active class
  const loadClassData = useCallback(async () => {
    if (!activeClass) return;
    setIsRefreshing(true);
    try {
      const { class: cls, section: sec } = activeClass;
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      const [profilesRes, registeredAttRes, descriptorsRes, todayAttRes] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase
          .from('attendance_records')
          .select('id, user_id, student_id, student_name, class, section, category, status, device_info, image_url, timestamp')
          .eq('status', 'registered')
          .order('timestamp', { ascending: false }),
        supabase.from('face_descriptors').select('id, user_id, student_id, image_url'),
        supabase
          .from('attendance_records')
          .select('id, user_id, student_id, student_name, class, section, category, status, timestamp, device_info, capture_mode, source')
          .gte('timestamp', startOfToday.toISOString())
          .lte('timestamp', endOfToday.toISOString())
          .order('timestamp', { ascending: false }),
      ]);

      const norm = (v: any) => (v == null ? '' : String(v).trim().toLowerCase());

      const facePhotoMap = new Map<string, string>();
      (descriptorsRes.data || []).forEach((f: any) => {
        const uId = norm(f.user_id);
        const sId = norm(f.student_id);
        if (f.image_url) {
          if (uId) facePhotoMap.set(uId, f.image_url);
          if (sId) facePhotoMap.set(sId, f.image_url);
        }
      });

      const todayAttMap = new Map<string, { status: 'present' | 'late' | 'absent'; time: string }>();
      (todayAttRes.data || []).forEach((att: any) => {
        if (att.status === 'registered') return;
        const rawStatus = (att.status || '').toLowerCase().trim();
        let normalizedStatus: 'present' | 'late' | 'absent' = 'present';
        if (rawStatus.includes('late')) normalizedStatus = 'late';
        else if (rawStatus.includes('absent')) normalizedStatus = 'absent';

        const timeFormatted = att.timestamp
          ? new Date(att.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
          : '';

        const info = { status: normalizedStatus, time: timeFormatted };
        if (att.user_id) todayAttMap.set(norm(att.user_id), info);
        if (att.student_id) todayAttMap.set(norm(att.student_id), info);
        if (att.student_name) todayAttMap.set(norm(att.student_name), info);
      });

      const studentMap = new Map<string, ClassStudent>();
      const byUserId = new Map<string, string>();
      const byName = new Map<string, string>();

      const upsertStudent = (candidate: ClassStudent) => {
        const uid = norm(candidate.user_id);
        const nameKey = norm(candidate.name);
        const existingKey = (uid && byUserId.get(uid)) || (nameKey && byName.get(nameKey)) || (studentMap.has(candidate.id) ? candidate.id : undefined);

        if (existingKey && studentMap.has(existingKey)) {
          const cur = studentMap.get(existingKey)!;
          studentMap.set(existingKey, {
            ...cur,
            name: cur.name && cur.name !== 'Student' ? cur.name : candidate.name,
            photo_url: cur.photo_url || candidate.photo_url,
            today_status: cur.today_status && cur.today_status !== 'unmarked' ? cur.today_status : candidate.today_status,
            today_time: cur.today_time || candidate.today_time,
          });
        } else {
          studentMap.set(candidate.id, candidate);
          if (uid) byUserId.set(uid, candidate.id);
          if (nameKey) byName.set(nameKey, candidate.id);
        }
      };

      (registeredAttRes.data || []).forEach((r: any) => {
        const deviceInfo = (r.device_info as any) || {};
        const meta = deviceInfo?.metadata || {};
        const categoryVal = r.category || meta.category || meta.department;
        const classVal = r.class || meta.class;
        const sectionVal = r.section || meta.section;

        if (!matchesClassAndSection({ category: categoryVal, class: classVal, section: sectionVal, department: meta.department }, cls, sec)) return;

        const name = meta.name || r.student_name || deviceInfo.name || 'Student';
        const rawPhoto = r.image_url || meta.firebase_image_url || (r.user_id && facePhotoMap.get(norm(r.user_id))) || '';
        const photo = sanitizeStudentPhotoUrl(rawPhoto);
        const attInfo = (r.user_id && todayAttMap.get(norm(r.user_id))) || (r.student_id && todayAttMap.get(norm(r.student_id))) || todayAttMap.get(norm(name));

        upsertStudent({
          id: r.id || r.user_id || `att-${name}`,
          user_id: r.user_id,
          name,
          roll_number: meta.roll_number || deviceInfo.roll_number || '',
          admission_number: meta.employee_id || r.student_id || '',
          parent_name: meta.parent_name || '',
          parent_email: meta.parent_email || '',
          parent_phone: meta.parent_phone || '',
          photo_url: photo,
          has_face_descriptor: Boolean(photo),
          today_status: attInfo?.status || 'unmarked',
          today_time: attInfo?.time || '',
        });
      });

      (profilesRes.data || []).forEach((p: any) => {
        if (!matchesClassAndSection(p, cls, sec)) return;
        const name = p.display_name || p.full_name || p.username || 'Student';
        const rawPhoto = p.photo_url || p.avatar_url || (p.user_id && facePhotoMap.get(norm(p.user_id))) || '';
        const photo = sanitizeStudentPhotoUrl(rawPhoto);
        const attInfo = (p.user_id && todayAttMap.get(norm(p.user_id))) || todayAttMap.get(norm(name));

        upsertStudent({
          id: p.id || p.user_id || `prof-${name}`,
          user_id: p.user_id || p.id,
          name,
          roll_number: p.roll_number || '',
          admission_number: p.admission_number || '',
          parent_name: p.parent_name || '',
          parent_email: p.parent_email || '',
          parent_phone: p.parent_phone || '',
          photo_url: photo,
          has_face_descriptor: Boolean(photo),
          today_status: attInfo?.status || 'unmarked',
          today_time: attInfo?.time || '',
        });
      });

      const finalStudents = Array.from(studentMap.values()).sort((a, b) => {
        const rollA = parseInt(a.roll_number || '999', 10);
        const rollB = parseInt(b.roll_number || '999', 10);
        if (!isNaN(rollA) && !isNaN(rollB) && rollA !== rollB) return rollA - rollB;
        return a.name.localeCompare(b.name);
      });

      setStudents(finalStudents);
    } catch (err) {
      console.error('Error loading smart board student data:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [activeClass]);

  useEffect(() => {
    loadClassData();
  }, [loadClassData]);

  // Quick mark attendance directly on smart board touchscreen
  const handleQuickMarkAttendance = async (student: ClassStudent, status: 'present' | 'late' | 'absent') => {
    if (!activeClass) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    // Optimistic UI update
    setStudents((prev) =>
      prev.map((s) => (s.id === student.id ? { ...s, today_status: status, today_time: timeStr } : s))
    );

    try {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      let del = supabase
        .from('attendance_records')
        .delete()
        .gte('timestamp', startOfToday.toISOString())
        .lte('timestamp', endOfToday.toISOString());

      if (student.user_id) del = del.eq('user_id', student.user_id);
      else del = del.eq('student_name', student.name);

      await del;

      await supabase.from('attendance_records').insert({
        user_id: student.user_id || null,
        student_id: student.admission_number || student.roll_number || null,
        student_name: student.name,
        class: activeClass.class,
        section: activeClass.section,
        category: activeClass.category,
        roll_number: student.roll_number || null,
        status: status,
        source: 'smart-board-mode',
        capture_mode: 'manual',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Smart board attendance marking error:', err);
    }
  };

  // Attendance metrics
  const totalStudents = students.length;
  const presentCount = students.filter((s) => s.today_status === 'present').length;
  const lateCount = students.filter((s) => s.today_status === 'late').length;
  const absentCount = students.filter((s) => s.today_status === 'absent').length;
  const attendanceRate = totalStudents > 0 ? Math.round(((presentCount + lateCount) / totalStudents) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col select-none overflow-x-hidden font-sans">
      {/* Smart Board Ultra-Wide Top HUD Bar */}
      <header className="px-6 py-4 bg-slate-900/95 border-b border-slate-800 backdrop-blur-xl flex items-center justify-between gap-4 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/widgets')}
            className="h-11 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-black border border-slate-700 flex items-center gap-2 transition-all active:scale-95"
            title="Return to Hub"
          >
            <ChevronLeft className="h-4 w-4" /> Back to Hub
          </button>

          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
              <Tv className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-white">
                  Presences Smart Board Mode
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-black border border-emerald-500/30 animate-pulse">
                  LIVE 4K HUD
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                High-contrast interactive classroom display for 65"/75"/86" touchscreens
              </p>
            </div>
          </div>
        </div>

        {/* Center: Live Class Selector & Time */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-950/80 px-3 py-1.5 rounded-2xl border border-slate-800">
            {classList.map((c) => (
              <button
                key={c.category}
                type="button"
                onClick={() => setActiveClass(c)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                  activeClass.category === c.category
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {c.category}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-800/80 border border-slate-700/80 text-sm font-mono font-bold">
            <Clock className="h-4 w-4 text-indigo-400" />
            <span>{currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => playSchoolBell()}
            className="h-11 px-4 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-black flex items-center gap-2 transition-all active:scale-95 shadow-sm"
            title="Ring School Bell"
          >
            <Volume2 className="h-4 w-4" /> School Bell
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="h-11 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-indigo-600/30"
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen 4K'}</span>
          </button>
        </div>
      </header>

      {/* Main Classroom Screen Body */}
      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1920px] mx-auto w-full">
        {/* Left Column: TPA KPI Header & Multi-Tool Tabs */}
        <div className="lg:col-span-8 flex flex-col space-y-4">
          {/* Big TPA Attendance Glance Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/90 border border-slate-800 rounded-3xl p-4 shadow-xl">
            <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">Enrolled</span>
                <span className="text-2xl font-black text-white">{totalStudents}</span>
              </div>
              <Users className="h-6 w-6 text-slate-500" />
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-emerald-400 block uppercase tracking-wider">Present</span>
                <span className="text-2xl font-black text-emerald-300">{presentCount}</span>
              </div>
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/30 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-amber-400 block uppercase tracking-wider">Late</span>
                <span className="text-2xl font-black text-amber-300">{lateCount}</span>
              </div>
              <Clock3 className="h-6 w-6 text-amber-400" />
            </div>

            <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-indigo-400 block uppercase tracking-wider">Attendance %</span>
                <span className="text-2xl font-black text-indigo-300">{attendanceRate}%</span>
              </div>
              <Award className="h-6 w-6 text-indigo-400" />
            </div>
          </div>

          {/* Interactive Workspace Navigation Tabs */}
          <div className="flex items-center gap-2 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('scratchpad')}
              className={`flex-1 py-3 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                activeTab === 'scratchpad'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Edit3 className="h-4 w-4" /> Touch Whiteboard
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('picker')}
              className={`flex-1 py-3 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                activeTab === 'picker'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Shuffle className="h-4 w-4" /> Student Lucky Wheel
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('noise')}
              className={`flex-1 py-3 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                activeTab === 'noise'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Mic className="h-4 w-4" /> Sound & Decibel Meter
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('timer')}
              className={`flex-1 py-3 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                activeTab === 'timer'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Timer className="h-4 w-4" /> Period Countdown
            </button>
          </div>

          {/* Active Interactive Board Component Area */}
          <div className="flex-1 bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col min-h-[500px]">
            {activeTab === 'scratchpad' && (
              <div className="flex-1 flex flex-col">
                <SmartBoardScratchpad />
              </div>
            )}

            {activeTab === 'picker' && (
              <div className="flex-1 flex flex-col items-center justify-center p-4">
                <div className="w-full max-w-md">
                  <StudentPickerWidget
                    widget={{
                      id: 'sb-picker',
                      type: 'student_picker',
                      title: 'Class Lucky Wheel',
                      size: '2x2',
                      palette: 'dynamic-rose',
                      pinned: false,
                      order: 0,
                    }}
                    students={students}
                  />
                </div>
              </div>
            )}

            {activeTab === 'noise' && (
              <div className="flex-1 flex flex-col items-center justify-center p-4">
                <div className="w-full max-w-md">
                  <DecibelMeterWidget
                    widget={{
                      id: 'sb-noise',
                      type: 'decibel_meter',
                      title: 'Live Microphone dB Level',
                      size: '2x2',
                      palette: 'dynamic-blue',
                      pinned: false,
                      order: 0,
                    }}
                  />
                </div>
              </div>
            )}

            {activeTab === 'timer' && (
              <div className="flex-1 flex flex-col items-center justify-center p-4">
                <div className="w-full max-w-md">
                  <StopwatchWidget
                    widget={{
                      id: 'sb-timer',
                      type: 'stopwatch_timer',
                      title: 'Period Timer & Gong',
                      size: '2x2',
                      palette: 'dynamic-amber',
                      pinned: false,
                      order: 0,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Class Attendance Stream (Touch Cards) */}
        <div className="lg:col-span-4 bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <Users className="h-5 w-5 text-indigo-400" />
              <div>
                <h3 className="text-base font-black text-white">
                  Class {activeClass.category} Roster
                </h3>
                <span className="text-xs text-slate-400">
                  {students.length} Enrolled Students
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={loadClassData}
              disabled={isRefreshing}
              className="h-9 w-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 transition-all active:scale-95"
              title="Refresh Roster"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
          </div>

          {/* Student Grid / List */}
          <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[640px] pr-1">
            {students.map((student) => {
              const isPresent = student.today_status === 'present';
              const isLate = student.today_status === 'late';
              const isAbsent = student.today_status === 'absent';

              return (
                <div
                  key={student.id}
                  className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    isPresent
                      ? 'bg-emerald-950/20 border-emerald-500/30'
                      : isLate
                      ? 'bg-amber-950/20 border-amber-500/30'
                      : isAbsent
                      ? 'bg-rose-950/20 border-rose-500/30'
                      : 'bg-slate-950/40 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {student.photo_url ? (
                      <img
                        src={student.photo_url}
                        alt={student.name}
                        className="h-10 w-10 rounded-xl object-cover border border-slate-700 shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-bold text-xs shrink-0">
                        {student.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate">{student.name}</span>
                        {student.roll_number && (
                          <span className="text-[10px] font-mono text-slate-400">#{student.roll_number}</span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 block font-mono">
                        {student.today_time ? `@ ${student.today_time}` : 'Not checked in'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleQuickMarkAttendance(student, 'present')}
                      className={`h-8 px-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center border active:scale-95 ${
                        isPresent
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-emerald-950/40 hover:text-emerald-300'
                      }`}
                      title="Mark Present"
                    >
                      P
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickMarkAttendance(student, 'late')}
                      className={`h-8 px-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center border active:scale-95 ${
                        isLate
                          ? 'bg-amber-600 text-white border-amber-500 shadow-md shadow-amber-600/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-amber-950/40 hover:text-amber-300'
                      }`}
                      title="Mark Late"
                    >
                      L
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickMarkAttendance(student, 'absent')}
                      className={`h-8 px-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center border active:scale-95 ${
                        isAbsent
                          ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-rose-950/40 hover:text-rose-300'
                      }`}
                      title="Mark Absent"
                    >
                      A
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
};

export default SmartBoardMode;
