import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  Smartphone, 
  Sparkles, 
  RefreshCw, 
  SlidersHorizontal, 
  Layers, 
  GraduationCap, 
  ShieldCheck, 
  Calendar, 
  Clock, 
  ArrowRight,
  BookOpen,
  LayoutGrid
} from 'lucide-react';
import { AndroidWidgetBoard } from '@/components/widgets/android/AndroidWidgetBoard';
import { AddWidgetToHomeScreenModal } from '@/components/widgets/android/AddWidgetToHomeScreenModal';
import { ClassStudent, ClassAssignment, getPreviousWorkingDay } from '@/components/teacher/TeacherAdminWorkspace';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { sanitizeStudentPhotoUrl } from '@/utils/studentPhotoResolver';
import { matchesClassAndSection, parseClassSection, fetchTeacherCategories } from '@/utils/teacherAccess';
import { Link } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import MobileNavBar from '@/components/mobile/MobileNavBar';
import LiteModeToggle from '@/components/LiteModeToggle';

const DEFAULT_CLASSES: ClassAssignment[] = [
  { class: '6', section: 'A', category: '6-A' },
  { class: '10', section: 'A', category: '10-A' },
  { class: '10', section: 'B', category: '10-B' },
  { class: '9', section: 'A', category: '9-A' },
  { class: '8', section: 'A', category: '8-A' },
  { class: '11', section: 'A', category: '11-A' },
  { class: '12', section: 'A', category: '12-A' },
];

const WidgetsPage: React.FC = () => {
  const { toast } = useToast();
  const { userId, role, isTeacher, isAdminOrPrincipal } = useUserRole();

  const [activeClass, setActiveClass] = useState<ClassAssignment>(DEFAULT_CLASSES[0]);
  const [classList, setClassList] = useState<ClassAssignment[]>(DEFAULT_CLASSES);
  const [students, setStudents] = useState<ClassStudent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showAddWidgetModal, setShowAddWidgetModal] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load available teacher assignments or school-wide classes
  const loadClassAssignments = useCallback(async () => {
    if (!userId) return;
    try {
      const categories = await fetchTeacherCategories(userId);
      if (categories && categories.length > 0) {
        const assigned: ClassAssignment[] = categories
          .map(c => {
            const parsed = parseClassSection(c);
            return parsed ? { class: parsed.className, section: parsed.section, category: c } : null;
          })
          .filter((c): c is ClassAssignment => Boolean(c));

        if (assigned.length > 0) {
          // Merge with default list avoiding duplicates
          const combined = [...assigned];
          DEFAULT_CLASSES.forEach(d => {
            if (!combined.some(c => c.category === d.category)) {
              combined.push(d);
            }
          });
          setClassList(combined);
          setActiveClass(combined[0]);
        }
      }
    } catch (err) {
      console.error('Error loading widget classes:', err);
    }
  }, [userId]);

  useEffect(() => {
    loadClassAssignments();
  }, [loadClassAssignments]);

  // Load students and live attendance using the multi-identifier engine
  const loadClassData = useCallback(async () => {
    if (!activeClass) return;
    setIsRefreshing(true);
    try {
      const { class: cls, section: sec } = activeClass;
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      const prevWorkingDay = getPreviousWorkingDay();

      const [
        profilesRes,
        registeredAttRes,
        descriptorsRes,
        todayAttRes,
        prevDayAttRes,
        todayGateRes,
        todayGvEventsRes,
      ] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase
          .from('attendance_records')
          .select('id, user_id, student_id, student_name, class, section, category, status, device_info, image_url, timestamp')
          .eq('status', 'registered')
          .order('timestamp', { ascending: false }),
        supabase
          .from('face_descriptors')
          .select('id, user_id, student_id, image_url'),
        supabase
          .from('attendance_records')
          .select('id, user_id, student_id, student_name, class, section, category, status, timestamp, device_info, capture_mode, source')
          .gte('timestamp', startOfToday.toISOString())
          .lte('timestamp', endOfToday.toISOString())
          .order('timestamp', { ascending: false }),
        supabase
          .from('attendance_records')
          .select('id, user_id, student_id, student_name, class, section, category, status, timestamp, device_info')
          .gte('timestamp', prevWorkingDay.start.toISOString())
          .lte('timestamp', prevWorkingDay.end.toISOString())
          .order('timestamp', { ascending: false }),
        (supabase as any)
          .from('gate_entries')
          .select('id, student_id, student_name, entry_time, is_recognized, class, section, metadata')
          .gte('entry_time', startOfToday.toISOString())
          .lte('entry_time', endOfToday.toISOString())
          .order('entry_time', { ascending: false }),
        (supabase as any)
          .from('gv_events')
          .select('id, event_type, student_id, timestamp, metadata')
          .gte('timestamp', startOfToday.toISOString())
          .lte('timestamp', endOfToday.toISOString())
          .order('timestamp', { ascending: false }),
      ]);

      const norm = (v: any) => (v == null ? '' : String(v).trim().toLowerCase());

      const enrolledFaceIds = new Set<string>();
      const facePhotoMap = new Map<string, string>();
      (descriptorsRes.data || []).forEach((f: any) => {
        const uId = norm(f.user_id);
        const sId = norm(f.student_id);
        if (uId) enrolledFaceIds.add(uId);
        if (sId) enrolledFaceIds.add(sId);
        if (f.image_url) {
          if (uId) facePhotoMap.set(uId, f.image_url);
          if (sId) facePhotoMap.set(sId, f.image_url);
        }
      });

      const prevDayPresentSet = new Set<string>();
      (prevDayAttRes.data || []).forEach((att: any) => {
        if (att.status === 'registered') return;
        const rawStatus = (att.status || '').toLowerCase();
        if (rawStatus.includes('present') || rawStatus.includes('late') || rawStatus.includes('verified') || rawStatus.includes('unauthorized')) {
          if (att.user_id) prevDayPresentSet.add(norm(att.user_id));
          if (att.student_id) prevDayPresentSet.add(norm(att.student_id));
          if (att.student_name) prevDayPresentSet.add(norm(att.student_name));
          const dInfo = (att.device_info as any) || {};
          const meta = dInfo.metadata || {};
          if (meta.employee_id) prevDayPresentSet.add(norm(meta.employee_id));
          if (dInfo.employee_id) prevDayPresentSet.add(norm(dInfo.employee_id));
          if (meta.roll_number) prevDayPresentSet.add(norm(meta.roll_number));
          if (meta.name) prevDayPresentSet.add(norm(meta.name));
        }
      });

      const todayAttMap = new Map<string, {
        status: 'present' | 'late' | 'absent';
        time: string;
        source?: string;
        captureMode?: string;
        isManual?: boolean;
      }>();

      const registerTodayRecord = (key: string, info: { status: 'present' | 'late' | 'absent'; time: string; source?: string; captureMode?: string; isManual?: boolean }) => {
        if (!key) return;
        const cleanKey = norm(key);
        if (!cleanKey) return;
        const existing = todayAttMap.get(cleanKey);
        if (!existing || (existing.status === 'absent' && info.status !== 'absent') || info.isManual) {
          todayAttMap.set(cleanKey, info);
        }
      };

      (todayAttRes.data || []).forEach((att: any) => {
        if (att.status === 'registered') return;
        const sName = att.student_name || '';
        const uId = att.user_id ? String(att.user_id) : '';
        const sId = att.student_id ? String(att.student_id) : '';
        const dInfo = (att.device_info as any) || {};
        const meta = dInfo.metadata || {};
        const empId = meta.employee_id || dInfo.employee_id || '';
        const rollNum = meta.roll_number || dInfo.roll_number || '';
        const metaName = meta.name || dInfo.name || '';

        const rawStatus = (att.status || '').toLowerCase().trim();
        let normalizedStatus: 'present' | 'late' | 'absent' = 'present';
        if (rawStatus.includes('late')) normalizedStatus = 'late';
        else if (rawStatus.includes('absent')) normalizedStatus = 'absent';
        else normalizedStatus = 'present';

        const timeFormatted = att.timestamp ? new Date(att.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
        const isManual = Boolean(
          att.capture_mode === 'manual' ||
          att.source === 'teacher-portal' ||
          dInfo.mark === 'manual_attendance' ||
          dInfo.manual ||
          att.source === 'manual'
        );

        const info = {
          status: normalizedStatus,
          time: timeFormatted,
          source: att.source || dInfo.source || (isManual ? 'teacher-portal' : 'biometric-kiosk'),
          captureMode: att.capture_mode || dInfo.capture_mode || (isManual ? 'manual' : 'spotlight-engine'),
          isManual,
        };

        if (uId) registerTodayRecord(uId, info);
        if (sId) registerTodayRecord(sId, info);
        if (empId) registerTodayRecord(empId, info);
        if (rollNum) registerTodayRecord(rollNum, info);
        if (sName) registerTodayRecord(sName, info);
        if (metaName) registerTodayRecord(metaName, info);
        if (att.id) registerTodayRecord(att.id, info);
      });

      (todayGateRes.data || []).forEach((g: any) => {
        const sId = g.student_id ? String(g.student_id) : '';
        const sName = g.student_name || '';
        const meta = g.metadata || {};
        const empId = meta.employee_id || meta.admission_number || '';
        const rollNum = meta.roll_number || '';
        const timeFormatted = g.entry_time ? new Date(g.entry_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
        const gateInfo = {
          status: 'present' as const,
          time: timeFormatted,
          source: 'gate-security',
          captureMode: 'rfid-gate',
          isManual: false,
        };

        if (sId) registerTodayRecord(sId, gateInfo);
        if (empId) registerTodayRecord(empId, gateInfo);
        if (rollNum) registerTodayRecord(rollNum, gateInfo);
        if (sName) registerTodayRecord(sName, gateInfo);
        if (g.id) registerTodayRecord(g.id, gateInfo);
      });

      (todayGvEventsRes.data || []).forEach((ev: any) => {
        const sId = ev.student_id ? String(ev.student_id) : '';
        const meta = ev.metadata || {};
        const sName = meta.student_name || meta.name || '';
        const empId = meta.employee_id || meta.admission_number || '';
        const rollNum = meta.roll_number || '';
        const timeFormatted = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
        const gvInfo = {
          status: 'present' as const,
          time: timeFormatted,
          source: 'spotlight-engine',
          captureMode: 'ai-vision',
          isManual: false,
        };

        if (sId) registerTodayRecord(sId, gvInfo);
        if (empId) registerTodayRecord(empId, gvInfo);
        if (rollNum) registerTodayRecord(rollNum, gvInfo);
        if (sName) registerTodayRecord(sName, gvInfo);
        if (ev.id) registerTodayRecord(ev.id, gvInfo);
      });

      const studentMap = new Map<string, ClassStudent>();
      const byUserId = new Map<string, string>();
      const byName = new Map<string, string>();
      const byEmployeeId = new Map<string, string>();

      const upsertStudent = (candidate: ClassStudent) => {
        const uid = norm(candidate.user_id);
        const nameKey = norm(candidate.name);
        const empKey = norm(candidate.admission_number || candidate.roll_number);

        const existingKey =
          (uid && byUserId.get(uid)) ||
          (empKey && byEmployeeId.get(empKey)) ||
          (nameKey && byName.get(nameKey)) ||
          (studentMap.has(candidate.id) ? candidate.id : undefined);

        if (existingKey && studentMap.has(existingKey)) {
          const cur = studentMap.get(existingKey)!;
          const merged: ClassStudent = {
            ...cur,
            user_id: cur.user_id || candidate.user_id,
            name: cur.name && cur.name !== 'Student' ? cur.name : candidate.name,
            roll_number: cur.roll_number || candidate.roll_number || '',
            admission_number: cur.admission_number || candidate.admission_number || '',
            parent_name: cur.parent_name || candidate.parent_name || '',
            parent_email: cur.parent_email || candidate.parent_email || '',
            parent_phone: cur.parent_phone || candidate.parent_phone || '',
            photo_url: cur.photo_url || candidate.photo_url || '',
            has_face_descriptor: cur.has_face_descriptor || candidate.has_face_descriptor,
            today_status: cur.today_status && cur.today_status !== 'unmarked' ? cur.today_status : candidate.today_status,
            today_time: cur.today_time || candidate.today_time,
            was_present_yesterday: cur.was_present_yesterday ?? candidate.was_present_yesterday,
            capture_mode: cur.capture_mode || candidate.capture_mode,
            attendance_source: cur.attendance_source || candidate.attendance_source,
            is_manual: cur.is_manual ?? candidate.is_manual,
          };
          studentMap.set(existingKey, merged);
        } else {
          studentMap.set(candidate.id, candidate);
          const key = candidate.id;
          if (uid) byUserId.set(uid, key);
          if (nameKey) byName.set(nameKey, key);
          if (empKey) byEmployeeId.set(empKey, key);
        }
      };

      // 1. Registered students
      (registeredAttRes.data || []).forEach((r: any) => {
        const deviceInfo = (r.device_info as any) || {};
        const meta = deviceInfo?.metadata || {};
        const categoryVal = r.category || meta.category || meta.department;
        const classVal = r.class || meta.class;
        const sectionVal = r.section || meta.section;

        if (!matchesClassAndSection({ category: categoryVal, class: classVal, section: sectionVal, department: meta.department }, cls, sec)) {
          return;
        }

        const name = meta.name || r.student_name || deviceInfo.name || 'Student';
        const empId = meta.employee_id || deviceInfo.employee_id || r.student_id || '';
        const roll = meta.roll_number || deviceInfo.roll_number || '';
        const pPhone = meta.parent_phone || deviceInfo.parent_phone || meta.phone || '';
        const pEmail = meta.parent_email || deviceInfo.parent_email || (meta.email?.includes('@') ? meta.email : '');
        const pName = meta.parent_name || deviceInfo.parent_name || '';

        const uidKey = norm(r.user_id);
        const nameK = norm(name);
        const empK = norm(empId);
        const rollK = norm(roll);

        const rawPhoto = r.image_url || meta.firebase_image_url || meta.image_url || (uidKey && facePhotoMap.get(uidKey)) || (empK && facePhotoMap.get(empK)) || '';
        const photo = sanitizeStudentPhotoUrl(rawPhoto);

        const hasFace =
          (uidKey && enrolledFaceIds.has(uidKey)) ||
          (empK && enrolledFaceIds.has(empK)) ||
          Boolean(photo);

        const attInfo =
          (uidKey && todayAttMap.get(uidKey)) ||
          (empK && todayAttMap.get(empK)) ||
          (rollK && todayAttMap.get(rollK)) ||
          (nameK && todayAttMap.get(nameK)) ||
          (r.id && todayAttMap.get(norm(r.id)));

        const wasPresentPrev = Boolean(
          (uidKey && prevDayPresentSet.has(uidKey)) ||
          (empK && prevDayPresentSet.has(empK)) ||
          (rollK && prevDayPresentSet.has(rollK)) ||
          (nameK && prevDayPresentSet.has(nameK)) ||
          (r.id && prevDayPresentSet.has(norm(r.id)))
        );

        upsertStudent({
          id: r.id || r.user_id || `att-${nameK}`,
          user_id: r.user_id,
          name,
          roll_number: roll,
          admission_number: empId,
          parent_name: pName,
          parent_email: pEmail,
          parent_phone: pPhone,
          photo_url: photo,
          has_face_descriptor: hasFace,
          today_status: attInfo?.status || 'unmarked',
          today_time: attInfo?.time || '',
          was_present_yesterday: wasPresentPrev,
          capture_mode: attInfo?.captureMode,
          attendance_source: attInfo?.source,
          is_manual: attInfo?.isManual,
        });
      });

      // 2. Profiles
      (profilesRes.data || []).forEach((p: any) => {
        if (!matchesClassAndSection(p, cls, sec)) return;

        const name = p.display_name || p.full_name || p.username || 'Student';
        const uidKey = norm(p.user_id || p.id);
        const nameK = norm(name);
        const empK = norm(p.admission_number || p.roll_number);
        const rollK = norm(p.roll_number);

        const rawPhoto = p.photo_url || p.avatar_url || (uidKey && facePhotoMap.get(uidKey)) || (empK && facePhotoMap.get(empK)) || '';
        const photo = sanitizeStudentPhotoUrl(rawPhoto);

        const hasFace =
          (uidKey && enrolledFaceIds.has(uidKey)) ||
          (empK && enrolledFaceIds.has(empK)) ||
          Boolean(photo);

        const attInfo =
          (uidKey && todayAttMap.get(uidKey)) ||
          (empK && todayAttMap.get(empK)) ||
          (rollK && todayAttMap.get(rollK)) ||
          (nameK && todayAttMap.get(nameK)) ||
          (p.id && todayAttMap.get(norm(p.id)));

        const wasPresentPrev = Boolean(
          (uidKey && prevDayPresentSet.has(uidKey)) ||
          (empK && prevDayPresentSet.has(empK)) ||
          (rollK && prevDayPresentSet.has(rollK)) ||
          (nameK && prevDayPresentSet.has(nameK)) ||
          (p.id && prevDayPresentSet.has(norm(p.id)))
        );

        upsertStudent({
          id: p.id || p.user_id || `prof-${nameK}`,
          user_id: p.user_id || p.id,
          name,
          roll_number: p.roll_number || '',
          admission_number: p.admission_number || '',
          parent_name: p.parent_name || '',
          parent_email: p.parent_email || (p.email?.includes('@') ? p.email : ''),
          parent_phone: p.parent_phone || p.phone_number || '',
          photo_url: photo,
          has_face_descriptor: hasFace,
          today_status: attInfo?.status || 'unmarked',
          today_time: attInfo?.time || '',
          was_present_yesterday: wasPresentPrev,
          capture_mode: attInfo?.captureMode,
          attendance_source: attInfo?.source,
          is_manual: attInfo?.isManual,
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
      console.error('Error loading widget data:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [activeClass]);

  useEffect(() => {
    loadClassData();
  }, [loadClassData]);

  // Realtime Supabase live sync across attendance and gate entries
  useEffect(() => {
    if (!activeClass) return;
    const channel = supabase
      .channel(`public_widgets_live_sync_${activeClass.class}_${activeClass.section}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => loadClassData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gate_entries' }, () => loadClassData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeClass, loadClassData]);

  const stats = React.useMemo(() => {
    const total = students.length;
    const present = students.filter(s => s.today_status === 'present').length;
    const late = students.filter(s => s.today_status === 'late').length;
    const absent = students.filter(s => s.today_status === 'absent').length;
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return { total, present, late, absent, rate };
  }, [students]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20 pb-28 md:pb-16">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-8 space-y-6">
        {/* Hero Banner with Material You Accent */}
        <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-card/90 via-card/60 to-primary/10 p-5 md:p-7 shadow-xl backdrop-blur-2xl">
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                  <LayoutGrid className="h-5 w-5" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>
                  Android Widgets Hub
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-primary/15 text-primary border border-primary/30">
                  Material You 14+
                </span>
                <LiteModeToggle variant="badge" />
              </div>

              <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl font-medium">
                Live interactive glanceable widgets, automated attendance rings, timetable countdown, noise decibel monitor, and quick actions accessible to all users.
              </p>

              {/* Class Selector Pill Bar */}
              <div className="flex items-center gap-2 pt-2 overflow-x-auto no-scrollbar pb-1">
                <span className="text-xs font-bold text-muted-foreground shrink-0 flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5 text-primary" /> Active Class:
                </span>
                {classList.map((c) => {
                  const isSelected = activeClass.category === c.category;
                  return (
                    <motion.button
                      key={c.category}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setActiveClass(c)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                        isSelected
                          ? 'bg-primary text-white shadow-md shadow-primary/30 ring-2 ring-primary/40'
                          : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/80'
                      }`}
                    >
                      Class {c.class}–{c.section}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Quick Live Stats Pills */}
            <div className="flex flex-wrap md:flex-col items-start md:items-end gap-2 shrink-0">
              <div className="flex items-center gap-2 bg-background/60 backdrop-blur-md px-3.5 py-1.5 rounded-2xl border border-border/70 text-xs font-bold">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-muted-foreground">Class {activeClass.category}:</span>
                <span className="text-foreground font-extrabold">{stats.present} Present</span>
                <span className="text-muted-foreground font-normal">/ {stats.total} Total</span>
                <span className="text-primary font-black ml-1">({stats.rate}%)</span>
              </div>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddWidgetModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition-all active:scale-95 shadow-sm"
                >
                  <Smartphone className="h-3.5 w-3.5 text-amber-500" />
                  <span>Add to Home Screen</span>
                </button>

                <button
                  type="button"
                  onClick={loadClassData}
                  disabled={isRefreshing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-muted/60 hover:bg-muted text-foreground border border-border/70 transition-all active:scale-95"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
                  <span>Sync Live</span>
                </button>

                {isTeacher && (
                  <Link
                    to={`/teacher?class=${activeClass.category}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-primary text-white shadow-sm hover:opacity-95 transition-all"
                  >
                    <span>Teacher Portal</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* The Live Material You Android Widget Grid */}
        <AndroidWidgetBoard
          students={students}
          activeClass={activeClass}
          onRefresh={loadClassData}
          isRefreshing={isRefreshing}
        />

        {/* Home screen guide modal */}
        <AddWidgetToHomeScreenModal
          isOpen={showAddWidgetModal}
          onClose={() => setShowAddWidgetModal(false)}
        />
      </main>

      <MobileNavBar />
    </div>
  );
};

export default WidgetsPage;
