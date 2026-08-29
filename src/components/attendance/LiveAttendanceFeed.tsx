import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { format } from 'date-fns';
import {
  Activity,
  Clock,
  CheckCircle2,
  AlertCircle,
  Zap,
  MailCheck,
  ShieldCheck,
  User,
} from 'lucide-react';

const STORAGE_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/face-images/`;

interface AttendanceRecord {
  id: string;
  user_id: string | null;
  student_name?: string | null;
  timestamp: string;
  status: string | null;
  confidence: number | null;
  category: string | null;
  class?: string | null;
  section?: string | null;
  image_url: string | null;
  device_info: any;
}

const LiveAttendanceFeed: React.FC = () => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [visibleCount, setVisibleCount] = useState(12);
  const [profileAvatarByUserId, setProfileAvatarByUserId] = useState<Record<string, string>>({});

  const visibleRecords = useMemo(() => records.slice(0, visibleCount), [records, visibleCount]);

  const getStudentName = (record: AttendanceRecord): string => {
    if (record.student_name) return record.student_name;
    if (record.device_info?.metadata?.name) return record.device_info.metadata.name;
    return record.user_id ? `Student · ${record.user_id.slice(0, 6)}` : 'Verified Student';
  };

  const getStudentImage = (record: AttendanceRecord): string | null => {
    if (record.image_url) {
      if (record.image_url.startsWith('data:') || record.image_url.startsWith('http')) {
        return record.image_url;
      }
      return `${STORAGE_BASE_URL}${record.image_url}`;
    }
    const metadata = record.device_info?.metadata;
    if (metadata?.avatar_url && typeof metadata.avatar_url === 'string') return metadata.avatar_url;
    if (metadata?.photo_url && typeof metadata.photo_url === 'string') return metadata.photo_url;
    if (metadata?.image_url && typeof metadata.image_url === 'string') {
      if (metadata.image_url.startsWith('data:') || metadata.image_url.startsWith('http')) return metadata.image_url;
      return `${STORAGE_BASE_URL}${metadata.image_url}`;
    }
    if (metadata?.firebase_image_url) return metadata.firebase_image_url;
    if (record.user_id && profileAvatarByUserId[record.user_id]) return profileAvatarByUserId[record.user_id];
    return null;
  };

  useEffect(() => {
    const fetchRecords = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data } = await supabase
        .from('attendance_records')
        .select('*')
        .gte('timestamp', today.toISOString())
        .in('status', ['present', 'late', 'absent'])
        .order('timestamp', { ascending: false })
        .limit(30);

      if (data) setRecords(data as AttendanceRecord[]);
    };

    fetchRecords();

    const channel = supabase
      .channel('attendance-live-feed-v2')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'attendance_records' },
        payload => {
          const newRecord = payload.new as AttendanceRecord;
          if (newRecord.status && ['present', 'late', 'absent'].includes(newRecord.status)) {
            setRecords(prev => [newRecord, ...prev.filter(r => r.id !== newRecord.id).slice(0, 29)]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const fetchProfileImages = async () => {
      const userIds = Array.from(
        new Set(records.map(r => r.user_id).filter((id): id is string => Boolean(id)))
      );
      if (!userIds.length) return;

      const { data } = await supabase
        .from('profiles')
        .select('id, user_id, avatar_url, photo_url')
        .or(`id.in.(${userIds.join(',')}),user_id.in.(${userIds.join(',')})`);

      if (data) {
        const nextMap: Record<string, string> = {};
        data.forEach((p: any) => {
          const img = p.photo_url || p.avatar_url;
          if (p.id && img) nextMap[p.id] = img;
          if (p.user_id && img) nextMap[p.user_id] = img;
        });
        setProfileAvatarByUserId(nextMap);
      }
    };

    fetchProfileImages();
  }, [records]);

  const presentCount = records.filter(r => r.status === 'present').length;
  const lateCount = records.filter(r => r.status === 'late').length;

  return (
    <div className="h-full flex flex-col space-y-3">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">
            Live Stream
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
          <span className="text-emerald-500 font-semibold">{presentCount} Present</span>
          {lateCount > 0 && <span className="text-amber-500 font-semibold">• {lateCount} Late</span>}
        </div>
      </div>

      {/* Feed List */}
      <div className="space-y-2 overflow-y-auto max-h-[480px] pr-1">
        <AnimatePresence mode="popLayout">
          {visibleRecords.map((record, index) => {
            const studentName = getStudentName(record);
            const studentImage = getStudentImage(record);
            const isPresent = record.status === 'present';
            const isLate = record.status === 'late';
            const timeStr = format(new Date(record.timestamp), 'hh:mm a');
            const classInfo = record.class && record.section ? `${record.class}-${record.section}` : record.category;

            return (
              <motion.div
                key={record.id}
                initial={{ opacity: 0, y: -12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.25, delay: index * 0.02 }}
                className={`group relative overflow-hidden flex items-center justify-between p-2.5 rounded-2xl border transition-all duration-300 ${
                  isPresent
                    ? 'bg-gradient-to-r from-emerald-50/90 via-white to-white dark:from-emerald-950/20 dark:via-card/80 dark:to-card/60 border-emerald-300/80 dark:border-emerald-500/20 hover:border-emerald-500/50 hover:shadow-md dark:hover:shadow-emerald-950/20'
                    : isLate
                    ? 'bg-gradient-to-r from-amber-50/90 via-white to-white dark:from-amber-950/20 dark:via-card/80 dark:to-card/60 border-amber-300/80 dark:border-amber-500/20 hover:border-amber-500/50 hover:shadow-md dark:hover:shadow-amber-950/20'
                    : 'bg-gradient-to-r from-rose-50/90 via-white to-white dark:from-rose-950/20 dark:via-card/80 dark:to-card/60 border-rose-300/80 dark:border-rose-500/20'
                }`}
              >
                {/* Student Info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative">
                    <Avatar className={`h-10 w-10 rounded-xl border ${isPresent ? 'border-emerald-500/40 shadow-sm shadow-emerald-500/20' : 'border-amber-500/40'}`}>
                      {studentImage ? (
                        <AvatarImage src={studentImage} alt={studentName} className="object-cover" />
                      ) : null}
                      <AvatarFallback className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-xs font-bold rounded-xl">
                        {studentName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-background flex items-center justify-center ${
                      isPresent ? 'bg-emerald-500 text-white' : isLate ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'
                    }`}>
                      <CheckCircle2 className="h-2.5 w-2.5" />
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-xs sm:text-sm text-foreground truncate max-w-[130px] sm:max-w-[160px]">
                        {studentName}
                      </p>
                      {record.confidence && record.confidence > 0.85 && (
                        <Zap className="h-3 w-3 text-amber-400 shrink-0" title={`${Math.round(record.confidence * 100)}% confidence`} />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="h-3 w-3 text-muted-foreground/70" />
                        {timeStr}
                      </span>
                      {classInfo && (
                        <span className="px-1.5 py-0.2 rounded-md bg-muted/60 text-[10px] font-semibold text-foreground/80">
                          {classInfo}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Pill & Mode Indicator */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1.5">
                    {(() => {
                      const isGate =
                        record.device_info?.gate === true ||
                        record.device_info?.type === 'raspberry-pi-terminal' ||
                        record.device_info?.source === 'gate-mode' ||
                        record.device_info?.source === 'raspberry-pi-terminal' ||
                        record.device_info?.metadata?.capture_mode === 'gate-mode' ||
                        (record as any).source === 'gate-mode' ||
                        (record as any).capture_mode === 'gate-mode';

                      if (isGate) {
                        return (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 flex items-center gap-1">
                            🚪 Gate Mode
                          </span>
                        );
                      }
                      return null;
                    })()}
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase tracking-wider ${
                        isPresent
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                          : isLate
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                      }`}
                    >
                      {isPresent ? 'Present' : isLate ? 'Late' : 'Absent'}
                    </Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground/70 flex items-center gap-0.5">
                    <ShieldCheck className="h-2.5 w-2.5 text-blue-400" /> Face Verified
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {records.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center rounded-2xl border border-dashed border-border/60 bg-muted/10 p-4">
            <Activity className="h-8 w-8 text-muted-foreground/40 mb-2 animate-pulse" />
            <p className="text-xs font-semibold text-foreground">Waiting for check-ins</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Students recognized by the AI camera will appear here instantly.
            </p>
          </div>
        )}

        {records.length > visibleCount && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setVisibleCount(c => Math.min(c + 10, records.length))}
              className="w-full py-1.5 rounded-xl border border-border/60 bg-card/60 hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-all"
            >
              Load earlier check-ins ({records.length - visibleCount} more)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveAttendanceFeed;
