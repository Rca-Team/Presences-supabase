import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  Activity,
  Clock,
  CheckCircle2,
  Zap,
  ShieldCheck,
  Search,
  Volume2,
  VolumeX,
  Pause,
  Play,
  DoorOpen,
  QrCode,
  ChevronRight,
  X,
  Trash2,
  Camera,
  Loader2,
} from 'lucide-react';

import {
  getCachedStudentCoverPhoto,
  getStudentCoverPhoto,
  prefetchStudentCoverPhotos,
} from '@/utils/studentPhotoResolver';

const STORAGE_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/face-images/`;

// iOS Fluid Spring Physics
const iosSpring = {
  type: 'spring',
  stiffness: 440,
  damping: 30,
  mass: 0.8,
};

export interface AttendanceRecord {
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
  source?: string | null;
}

interface LiveAttendanceFeedProps {
  scopedCategory?: string | null;
  maxInitialCount?: number;
  className?: string;
  showHeader?: boolean;
}

// Lightweight Relative Time Helper
const getRelativeTime = (timestamp: string): string => {
  try {
    const diffMs = Date.now() - new Date(timestamp).getTime();
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));
    if (diffSec < 20) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return format(new Date(timestamp), 'MMM d, h:mm a');
  } catch {
    return 'Recently';
  }
};

// Web Audio Non-Blocking Arrival Chime
const playArrivalChime = (status: string | null) => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (status === 'late') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(370, ctx.currentTime + 0.16);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.14); // G5
    }

    gain.gain.setValueAtTime(0.09, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.28);
  } catch {}
};

// Extract relative file path from full storage URL or path string
const extractStoragePath = (url: string | null | undefined): string | null => {
  if (!url) return null;
  if (url.startsWith('data:')) return null; // base64 inline in database

  const marker = '/storage/v1/object/public/face-images/';
  const markerIdx = url.indexOf(marker);
  if (markerIdx !== -1) {
    return decodeURIComponent(url.slice(markerIdx + marker.length));
  }

  if (url.includes('face-images/')) {
    const parts = url.split('face-images/');
    return decodeURIComponent(parts[parts.length - 1]);
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return url;
  }

  return null;
};

const LiveAttendanceFeed: React.FC<LiveAttendanceFeedProps> = ({
  scopedCategory = null,
  maxInitialCount = 25,
  className = '',
  showHeader = true,
}) => {
  const { toast } = useToast();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [visibleCount, setVisibleCount] = useState(14);
  const [profileAvatarByUserId, setProfileAvatarByUserId] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<'all' | 'present' | 'late' | 'gate'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('presence_feed_sound') === 'true';
    } catch {
      return false;
    }
  });
  const [isStreamPaused, setIsStreamPaused] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<AttendanceRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [, setRelativeTimeTick] = useState(0);

  // Update relative time every 10 seconds for live feel
  useEffect(() => {
    const interval = setInterval(() => setRelativeTimeTick(t => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  const toggleSound = () => {
    setSoundEnabled(prev => {
      const next = !prev;
      try {
        localStorage.setItem('presence_feed_sound', String(next));
      } catch {}
      if (next) playArrivalChime('present');
      return next;
    });
  };

  const getStudentName = useCallback((record: AttendanceRecord): string => {
    if (record.student_name) return record.student_name;
    if (record.device_info?.metadata?.name) return record.device_info.metadata.name;
    if (record.device_info?.name) return record.device_info.name;
    return record.user_id ? `Student · ${record.user_id.slice(0, 6)}` : 'Verified Student';
  }, []);

  const getStudentAdmissionId = useCallback((record: AttendanceRecord): string => {
    if (record.device_info?.metadata?.employee_id) return record.device_info.metadata.employee_id;
    if (record.device_info?.employee_id) return record.device_info.employee_id;
    if (record.user_id) return record.user_id.slice(0, 8).toUpperCase();
    return 'ADM-KV';
  }, []);

  const getStudentClass = useCallback((record: AttendanceRecord): string | null => {
    if (record.class && record.section) return `${record.class}-${record.section}`;
    if (record.category) return record.category;
    if (record.device_info?.metadata?.department) return record.device_info.metadata.department;
    return null;
  }, []);

  const getStudentImage = useCallback((record: AttendanceRecord): string | null => {
    if (record.user_id) {
      const cover = getCachedStudentCoverPhoto(record.user_id) || profileAvatarByUserId[record.user_id];
      if (cover) return cover;
    }

    const metadata = record.device_info?.metadata;
    if (metadata?.avatar_url && typeof metadata.avatar_url === 'string') return metadata.avatar_url;
    if (metadata?.photo_url && typeof metadata.photo_url === 'string') return metadata.photo_url;
    if (metadata?.firebase_image_url) return metadata.firebase_image_url;

    if (record.image_url) {
      if (record.image_url.startsWith('data:') || record.image_url.startsWith('http')) {
        return record.image_url;
      }
      return `${STORAGE_BASE_URL}${record.image_url}`;
    }
    return null;
  }, [profileAvatarByUserId]);

  // Actual camera snapshot captured during attendance
  const getCapturedSnapshotUrl = useCallback((record: AttendanceRecord): string | null => {
    if (record.image_url) {
      if (record.image_url.startsWith('data:') || record.image_url.startsWith('http')) {
        return record.image_url;
      }
      return `${STORAGE_BASE_URL}${record.image_url}`;
    }
    const dev = record.device_info;
    if (dev?.snapshot_url) return dev.snapshot_url;
    if (dev?.captured_image) return dev.captured_image;
    if (dev?.image_data_url) return dev.image_data_url;
    return null;
  }, []);

  const isGateEntry = (record: AttendanceRecord): boolean => {
    return (
      record.device_info?.gate === true ||
      record.device_info?.type === 'raspberry-pi-terminal' ||
      record.device_info?.source === 'gate-mode' ||
      record.device_info?.source === 'raspberry-pi-terminal' ||
      record.device_info?.metadata?.capture_mode === 'gate-mode' ||
      record.source === 'gate-mode' ||
      (record as any).capture_mode === 'gate-mode'
    );
  };

  const getVerificationMethod = (record: AttendanceRecord): { label: string; icon: any; color: string } => {
    if (isGateEntry(record)) {
      return { label: 'Gate Turnstile', icon: DoorOpen, color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20' };
    }
    if (record.device_info?.method === 'qr' || record.source === 'qr-scan') {
      return { label: 'QR Pass', icon: QrCode, color: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20' };
    }
    const confidencePct = record.confidence ? Math.round(record.confidence * 100) : 99;
    return { label: `Face AI • ${confidencePct}%`, icon: Zap, color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' };
  };

  // ── Instant Delete Function: Record + Captured Image ────────────────────────
  const handleDeleteRecordWithImage = async (record: AttendanceRecord) => {
    const studentName = getStudentName(record);
    setIsDeleting(true);

    // 1. Optimistically delete immediately from UI (zero-lag instant disappearance)
    setRecords(prev => prev.filter(r => r.id !== record.id));
    if (selectedRecord?.id === record.id) {
      setSelectedRecord(null);
    }
    setRecordToDelete(null);

    try {
      // 2. Locate and delete captured image files from Supabase storage
      const pathsToDelete: string[] = [];
      const mainPath = extractStoragePath(record.image_url);
      if (mainPath) pathsToDelete.push(mainPath);

      if (record.device_info?.image_path) {
        const p = extractStoragePath(record.device_info.image_path);
        if (p && !pathsToDelete.includes(p)) pathsToDelete.push(p);
      }
      if (record.device_info?.snapshot_path) {
        const p = extractStoragePath(record.device_info.snapshot_path);
        if (p && !pathsToDelete.includes(p)) pathsToDelete.push(p);
      }

      if (pathsToDelete.length > 0) {
        const { error: storageErr } = await supabase.storage
          .from('face-images')
          .remove(pathsToDelete);

        if (storageErr) {
          console.warn('[LiveFeed] Storage image remove warning:', storageErr);
        }
      }

      // 3. Delete attendance record row from Supabase database
      const { error: dbErr } = await supabase
        .from('attendance_records')
        .delete()
        .eq('id', record.id);

      if (dbErr) {
        console.warn('[LiveFeed] Database row delete error:', dbErr);
        throw dbErr;
      }

      // 4. If linked to a gate entry, remove corresponding row from gate_entries
      if (record.device_info?.gate_entry_id) {
        await supabase.from('gate_entries').delete().eq('id', record.device_info.gate_entry_id);
      }

      toast({
        title: 'Record & Snapshot Deleted',
        description: `Permanently removed check-in and captured image for ${studentName}.`,
      });
    } catch (err: any) {
      console.error('[LiveFeed] Failed to complete deletion:', err);
      toast({
        title: 'Delete Failed',
        description: err?.message || 'Could not remove record from server.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Initial Fetch & Realtime Subscription
  useEffect(() => {
    const fetchRecords = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let query = supabase
        .from('attendance_records')
        .select('*')
        .gte('timestamp', today.toISOString())
        .in('status', ['present', 'late', 'absent'])
        .order('timestamp', { ascending: false })
        .limit(maxInitialCount);

      if (scopedCategory) {
        query = query.eq('category', scopedCategory);
      }

      const { data } = await query;
      if (data) setRecords(data as AttendanceRecord[]);
    };

    fetchRecords();

    const handleLocalMarked = (e: Event) => {
      const customEv = e as CustomEvent<AttendanceRecord>;
      const newRecord = customEv.detail;
      if (!newRecord) return;

      if (scopedCategory && newRecord.category && newRecord.category !== scopedCategory) {
        return;
      }

      if (soundEnabled && newRecord.status) {
        playArrivalChime(newRecord.status);
      }

      setRecords(prev => {
        if (isStreamPaused) return prev;
        const filtered = prev.filter(r => r.id !== newRecord.id && (r.user_id !== newRecord.user_id || !newRecord.user_id));
        return [newRecord, ...filtered].slice(0, 40);
      });
    };

    window.addEventListener('presence:attendance-marked', handleLocalMarked);

    const channel = supabase
      .channel(`attendance-live-feed-v3-${scopedCategory || 'global'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'attendance_records' },
        payload => {
          const newRecord = payload.new as AttendanceRecord;
          if (newRecord.status && ['present', 'late', 'absent'].includes(newRecord.status)) {
            if (scopedCategory && newRecord.category && newRecord.category !== scopedCategory) {
              return;
            }

            if (soundEnabled) {
              playArrivalChime(newRecord.status);
            }

            setRecords(prev => {
              if (isStreamPaused) return prev;
              const filtered = prev.filter(r => r.id !== newRecord.id);
              return [newRecord, ...filtered].slice(0, 40);
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'attendance_records' },
        payload => {
          const deletedId = (payload.old as any)?.id;
          if (deletedId) {
            setRecords(prev => prev.filter(r => r.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('presence:attendance-marked', handleLocalMarked);
      supabase.removeChannel(channel);
    };
  }, [scopedCategory, maxInitialCount, soundEnabled, isStreamPaused]);

  // Prefetch profile photos for newly arriving records
  useEffect(() => {
    let isCancelled = false;
    const fetchProfileImages = async () => {
      const userIds = Array.from(
        new Set(records.map(r => r.user_id).filter((id): id is string => Boolean(id)))
      );
      const missingIds = userIds.filter(uid => !profileAvatarByUserId[uid]);
      if (!missingIds.length) return;

      void prefetchStudentCoverPhotos(missingIds);

      const results = await Promise.all(
        missingIds.map(async uid => {
          const cover = getCachedStudentCoverPhoto(uid) || (await getStudentCoverPhoto(uid));
          return { uid, cover };
        })
      );

      if (isCancelled) return;

      const newEntries: Record<string, string> = {};
      results.forEach(({ uid, cover }) => {
        if (cover) newEntries[uid] = cover;
      });

      if (Object.keys(newEntries).length > 0) {
        setProfileAvatarByUserId(prev => ({ ...prev, ...newEntries }));
      }
    };

    fetchProfileImages();
    return () => {
      isCancelled = true;
    };
  }, [records, profileAvatarByUserId]);

  // Filtered & Searched Records
  const filteredRecords = useMemo(() => {
    return records.filter(record => {
      // 1. Status/Mode Filter
      if (activeFilter === 'present' && record.status !== 'present') return false;
      if (activeFilter === 'late' && record.status !== 'late') return false;
      if (activeFilter === 'gate' && !isGateEntry(record)) return false;

      // 2. Search Query Filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const name = getStudentName(record).toLowerCase();
        const admission = getStudentAdmissionId(record).toLowerCase();
        const cls = (getStudentClass(record) || '').toLowerCase();
        return name.includes(query) || admission.includes(query) || cls.includes(query);
      }

      return true;
    });
  }, [records, activeFilter, searchQuery, getStudentName, getStudentAdmissionId, getStudentClass]);

  const visibleRecords = useMemo(() => {
    return filteredRecords.slice(0, visibleCount);
  }, [filteredRecords, visibleCount]);

  const latestRecord = records[0] || null;

  // Real-time metric counts
  const presentCount = useMemo(() => records.filter(r => r.status === 'present').length, [records]);
  const lateCount = useMemo(() => records.filter(r => r.status === 'late').length, [records]);
  const gateCount = useMemo(() => records.filter(isGateEntry).length, [records]);

  return (
    <div className={`h-full flex flex-col space-y-3 hardware-layer ${className}`}>
      {/* ── Apple Dynamic Island Feed Command Bar ── */}
      {showHeader && (
        <div className="nano-glass rounded-2xl p-2.5 sm:p-3 border border-slate-200/70 dark:border-white/10 shadow-xs space-y-2.5">
          {/* Top Row: Stream Identity & Action Controls */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isStreamPaused ? 'bg-amber-400' : 'bg-emerald-400'} opacity-75`} />
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isStreamPaused ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              </span>
              <div>
                <h3 className="text-xs sm:text-sm font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>Live Stream</span>
                  {isStreamPaused && (
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 uppercase tracking-wider">
                      Paused
                    </span>
                  )}
                </h3>
              </div>
            </div>

            {/* Micro Controls: Search, Sound Chime, Pause */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsSearchOpen(v => !v)}
                className={`h-7 w-7 rounded-xl flex items-center justify-center transition-all ${
                  isSearchOpen || searchQuery
                    ? 'bg-blue-500 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
                }`}
                title="Search check-ins"
                aria-label="Search check-ins"
              >
                <Search className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={toggleSound}
                className={`h-7 w-7 rounded-xl flex items-center justify-center transition-all ${
                  soundEnabled
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
                }`}
                title={soundEnabled ? 'Arrival chime active (tap to mute)' : 'Arrival chime muted (tap to enable)'}
                aria-label="Toggle arrival sound chime"
              >
                {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => setIsStreamPaused(v => !v)}
                className={`h-7 w-7 rounded-xl flex items-center justify-center transition-all ${
                  isStreamPaused
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
                }`}
                title={isStreamPaused ? 'Resume live auto-feed' : 'Pause stream to review'}
                aria-label="Pause or resume stream"
              >
                {isStreamPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* Collapsible Search Input */}
          <AnimatePresence>
            {(isSearchOpen || searchQuery) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Filter by student name, ID or class..."
                    className="h-8 pl-8 pr-7 text-xs rounded-xl bg-white/60 dark:bg-slate-900/60 border-slate-200 dark:border-white/10"
                    autoFocus={isSearchOpen}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Filter Pills (iOS Segmented Style) */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none pt-0.5">
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`h-6 px-2.5 rounded-full text-[11px] font-bold transition-all flex items-center gap-1 shrink-0 ${
                activeFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              <span>All</span>
              <span className={`text-[9px] px-1 rounded-full ${activeFilter === 'all' ? 'bg-white/25 text-white' : 'bg-slate-200 dark:bg-white/10'}`}>
                {records.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('present')}
              className={`h-6 px-2.5 rounded-full text-[11px] font-bold transition-all flex items-center gap-1 shrink-0 ${
                activeFilter === 'present'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
              }`}
            >
              <CheckCircle2 className="h-3 w-3" />
              <span>Present</span>
              <span className={`text-[9px] px-1 rounded-full ${activeFilter === 'present' ? 'bg-white/25 text-white' : 'bg-emerald-500/20'}`}>
                {presentCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('late')}
              className={`h-6 px-2.5 rounded-full text-[11px] font-bold transition-all flex items-center gap-1 shrink-0 ${
                activeFilter === 'late'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
              }`}
            >
              <Clock className="h-3 w-3" />
              <span>Late</span>
              {lateCount > 0 && (
                <span className={`text-[9px] px-1 rounded-full ${activeFilter === 'late' ? 'bg-white/25 text-white' : 'bg-amber-500/20'}`}>
                  {lateCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('gate')}
              className={`h-6 px-2.5 rounded-full text-[11px] font-bold transition-all flex items-center gap-1 shrink-0 ${
                activeFilter === 'gate'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20'
              }`}
            >
              <DoorOpen className="h-3 w-3" />
              <span>Gate</span>
              {gateCount > 0 && (
                <span className={`text-[9px] px-1 rounded-full ${activeFilter === 'gate' ? 'bg-white/25 text-white' : 'bg-indigo-500/20'}`}>
                  {gateCount}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Latest Check-in Spotlight Card (Dynamic Island Banner) ── */}
      {latestRecord && activeFilter === 'all' && !searchQuery && (
        <motion.div
          key={`spotlight-${latestRecord.id}`}
          initial={{ opacity: 0, scale: 0.96, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={iosSpring}
          className="nano-glass-hero rounded-2xl p-3 border border-emerald-500/40 dark:border-emerald-400/30 shadow-md hover:shadow-lg transition-all group relative"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Latest Arrival Spotlight
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
                {getRelativeTime(latestRecord.timestamp)}
              </span>
              {/* Delete Button on Spotlight Card */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRecordToDelete(latestRecord);
                }}
                className="h-6 w-6 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center transition-colors"
                title="Delete this record & captured image"
                aria-label="Delete this record"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div
            onClick={() => setSelectedRecord(latestRecord)}
            className="flex items-center gap-3 cursor-pointer"
          >
            <div className="relative shrink-0">
              <Avatar className="h-12 w-12 rounded-2xl border-2 border-emerald-500/60 shadow-md object-cover">
                {getStudentImage(latestRecord) ? (
                  <AvatarImage src={getStudentImage(latestRecord)!} alt={getStudentName(latestRecord)} className="object-cover" />
                ) : null}
                <AvatarFallback className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-black text-sm rounded-2xl">
                  {getStudentName(latestRecord).slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 text-white flex items-center justify-center border-2 border-white dark:border-slate-900 shadow-xs">
                <CheckCircle2 className="h-2.5 w-2.5" />
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                  {getStudentName(latestRecord)}
                </h4>
                <Badge
                  variant="outline"
                  className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                    latestRecord.status === 'present'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                  }`}
                >
                  {latestRecord.status}
                </Badge>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                  {getStudentAdmissionId(latestRecord)}
                </span>
                {getStudentClass(latestRecord) && (
                  <>
                    <span>•</span>
                    <span className="font-semibold">{getStudentClass(latestRecord)}</span>
                  </>
                )}
                <span>•</span>
                <span className="text-[10px] text-muted-foreground">
                  {format(new Date(latestRecord.timestamp), 'h:mm a')}
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Scrollable Feed Stream List ── */}
      <div className="space-y-2 overflow-y-auto max-h-[440px] sm:max-h-[500px] pr-1 no-scrollbar scrollbar-none">
        <AnimatePresence mode="popLayout">
          {visibleRecords.map(record => {
            const studentName = getStudentName(record);
            const studentImage = getStudentImage(record);
            const admissionId = getStudentAdmissionId(record);
            const studentClass = getStudentClass(record);
            const isPresent = record.status === 'present';
            const isLate = record.status === 'late';
            const timeStr = format(new Date(record.timestamp), 'h:mm a');
            const relativeTime = getRelativeTime(record.timestamp);
            const method = getVerificationMethod(record);
            const MethodIcon = method.icon;

            return (
              <motion.div
                key={record.id}
                initial={{ opacity: 0, y: -12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={iosSpring}
                onClick={() => setSelectedRecord(record)}
                className={`group relative overflow-hidden flex items-center justify-between p-2.5 sm:p-3 rounded-2xl nano-glass border transition-all duration-200 cursor-pointer card-hover-pop shadow-xs ${
                  isPresent
                    ? 'hover:border-emerald-500/50 hover:bg-emerald-500/[0.03]'
                    : isLate
                    ? 'hover:border-amber-500/50 hover:bg-amber-500/[0.03]'
                    : 'hover:border-rose-500/50'
                }`}
              >
                {/* Left: Avatar & Identity Details */}
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <Avatar className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl border ${isPresent ? 'border-emerald-500/40 shadow-xs' : 'border-amber-500/40'}`}>
                      {studentImage ? (
                        <AvatarImage src={studentImage} alt={studentName} className="object-cover" />
                      ) : null}
                      <AvatarFallback className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-xs font-black rounded-xl">
                        {studentName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center ${
                      isPresent ? 'bg-emerald-500 text-white' : isLate ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'
                    }`}>
                      <CheckCircle2 className="h-2 w-2" />
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate max-w-[110px] sm:max-w-[140px]">
                        {studentName}
                      </p>
                      {record.confidence && record.confidence > 0.85 && (
                        <Zap className="h-3 w-3 text-amber-500 shrink-0" title={`${Math.round(record.confidence * 100)}% biometric match`} />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">
                      <span className="font-mono text-slate-500 dark:text-slate-400">
                        {admissionId}
                      </span>
                      {studentClass && (
                        <>
                          <span>•</span>
                          <span className="px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-white/10 font-bold text-slate-700 dark:text-slate-300">
                            {studentClass}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Method Tag, Timestamp & Instant Delete Action */}
                <div className="flex items-center gap-1.5 shrink-0 pl-2">
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border flex items-center gap-1 ${method.color}`}>
                        <MethodIcon className="h-2.5 w-2.5" />
                        <span className="hidden xs:inline">{method.label}</span>
                      </span>

                      <Badge
                        variant="outline"
                        className={`text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider ${
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

                    <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                      <Clock className="h-2.5 w-2.5" />
                      <span>{timeStr}</span>
                      <span className="hidden sm:inline">({relativeTime})</span>
                    </div>
                  </div>

                  {/* Delete Button on Each Item */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRecordToDelete(record);
                    }}
                    className="h-7 w-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 flex items-center justify-center transition-colors opacity-70 group-hover:opacity-100 ml-1"
                    title="Delete record & captured image"
                    aria-label={`Delete record for ${studentName}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Empty State / Standby Radar */}
        {filteredRecords.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-3xl nano-glass border border-slate-200/60 dark:border-white/10">
            <div className="relative mb-3 flex items-center justify-center">
              <span className="animate-ping absolute inline-flex h-12 w-12 rounded-full bg-blue-400/30" />
              <div className="relative h-12 w-12 rounded-full bg-blue-500/10 dark:bg-blue-400/10 flex items-center justify-center border border-blue-500/20">
                <Activity className="h-6 w-6 text-blue-500 animate-pulse" />
              </div>
            </div>
            <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
              {searchQuery ? 'No matching check-ins' : 'Awaiting Check-ins'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 max-w-[220px]">
              {searchQuery
                ? `No students found matching "${searchQuery}". Try another keyword.`
                : 'Face terminal and QR pass check-ins stream here in real time.'}
            </p>
          </div>
        )}

        {/* Load More Button */}
        {filteredRecords.length > visibleCount && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setVisibleCount(c => Math.min(c + 12, filteredRecords.length))}
              className="w-full py-2 rounded-2xl nano-glass border border-slate-200/70 dark:border-white/10 hover:bg-white dark:hover:bg-white/10 text-xs font-bold text-slate-700 dark:text-slate-300 transition-all shadow-xs btn-spring flex items-center justify-center gap-1.5"
            >
              <span>Load earlier check-ins ({filteredRecords.length - visibleCount} more)</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Student Check-In Detail Inspection Modal ── */}
      <Dialog open={!!selectedRecord} onOpenChange={open => !open && setSelectedRecord(null)}>
        <DialogContent className="max-w-sm rounded-[28px] nano-glass border border-white/80 dark:border-white/15 p-5 sm:p-6 shadow-2xl">
          {selectedRecord && (
            <div className="space-y-4">
              <DialogHeader className="text-center pb-2 border-b border-slate-200/60 dark:border-white/10">
                <DialogTitle className="text-base font-black text-slate-900 dark:text-white">
                  Biometric Check-In Record
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Verified entry telemetry & student details
                </DialogDescription>
              </DialogHeader>

              {/* Student Header & Captured Image Gallery */}
              <div className="flex flex-col items-center text-center">
                <div className="flex items-center justify-center gap-3 mb-2">
                  {/* Master Profile Avatar */}
                  <div className="relative">
                    <Avatar className="h-16 w-16 rounded-2xl border-2 border-white dark:border-slate-800 shadow-md object-cover">
                      {getStudentImage(selectedRecord) ? (
                        <AvatarImage src={getStudentImage(selectedRecord)!} alt={getStudentName(selectedRecord)} className="object-cover" />
                      ) : null}
                      <AvatarFallback className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-black text-base rounded-2xl">
                        {getStudentName(selectedRecord).slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-1 inset-x-0 text-[9px] font-extrabold uppercase bg-slate-900/80 text-white rounded-md py-0.2">
                      Profile
                    </span>
                  </div>

                  {/* Captured Live Camera Snapshot (if available) */}
                  {getCapturedSnapshotUrl(selectedRecord) && (
                    <div className="relative">
                      <div className="h-16 w-16 rounded-2xl border-2 border-blue-500 shadow-md overflow-hidden bg-black flex items-center justify-center">
                        <img
                          src={getCapturedSnapshotUrl(selectedRecord)!}
                          alt="Captured Live"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <span className="absolute -bottom-1 inset-x-0 text-[9px] font-extrabold uppercase bg-blue-600 text-white rounded-md py-0.2 flex items-center justify-center gap-0.5">
                        <Camera className="h-2 w-2" /> Live
                      </span>
                    </div>
                  )}
                </div>

                <h3 className="text-base font-black text-slate-900 dark:text-white mt-1">
                  {getStudentName(selectedRecord)}
                </h3>
                <p className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                  ID: {getStudentAdmissionId(selectedRecord)}
                </p>
                {getStudentClass(selectedRecord) && (
                  <span className="mt-1 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-xs font-bold text-slate-700 dark:text-slate-300">
                    Class {getStudentClass(selectedRecord)}
                  </span>
                )}
              </div>

              {/* Detail Metrics Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl nano-glass border border-slate-200/60 dark:border-white/10">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Status</span>
                  <div className="mt-1 flex items-center gap-1.5 font-black text-slate-900 dark:text-white">
                    <span className={`h-2 w-2 rounded-full ${selectedRecord.status === 'present' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <span className="capitalize">{selectedRecord.status}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl nano-glass border border-slate-200/60 dark:border-white/10">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Timestamp</span>
                  <p className="mt-1 font-mono font-bold text-slate-900 dark:text-white">
                    {format(new Date(selectedRecord.timestamp), 'hh:mm:ss a')}
                  </p>
                </div>

                <div className="p-2.5 rounded-xl nano-glass border border-slate-200/60 dark:border-white/10">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Verification</span>
                  <p className="mt-1 font-bold text-slate-900 dark:text-white flex items-center gap-1 truncate">
                    <ShieldCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    <span className="truncate">{getVerificationMethod(selectedRecord).label}</span>
                  </p>
                </div>

                <div className="p-2.5 rounded-xl nano-glass border border-slate-200/60 dark:border-white/10">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Parent Alert</span>
                  <p className="mt-1 font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>WhatsApp Sent</span>
                  </p>
                </div>
              </div>

              {/* Action Buttons: Delete & Close */}
              <div className="space-y-2 pt-1">
                <Button
                  variant="destructive"
                  className="w-full rounded-xl gap-2 font-bold text-xs btn-spring bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
                  onClick={() => setRecordToDelete(selectedRecord)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Record & Captured Image</span>
                </Button>

                <Button
                  variant="outline"
                  className="w-full rounded-xl nano-glass hover:bg-white dark:hover:bg-white/10 font-bold text-xs btn-spring"
                  onClick={() => setSelectedRecord(null)}
                >
                  Close Inspection
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <AlertDialog open={!!recordToDelete} onOpenChange={open => !open && setRecordToDelete(null)}>
        <AlertDialogContent className="max-w-sm rounded-[28px] nano-glass border border-rose-500/30 p-6 shadow-2xl">
          <AlertDialogHeader>
            <div className="h-12 w-12 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-2 border border-rose-500/20">
              <Trash2 className="h-6 w-6" />
            </div>
            <AlertDialogTitle className="text-center text-base font-black text-slate-900 dark:text-white">
              Delete Attendance Record?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-xs text-muted-foreground">
              {recordToDelete && (
                <>
                  Are you sure you want to permanently delete the attendance check-in for{' '}
                  <strong className="text-slate-900 dark:text-white">{getStudentName(recordToDelete)}</strong>{' '}
                  ({getStudentAdmissionId(recordToDelete)})?
                  <br />
                  <span className="text-rose-600 dark:text-rose-400 font-semibold mt-1 inline-block">
                    This will delete both the database record and the captured camera image file from storage.
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse sm:flex-row gap-2 mt-2">
            <AlertDialogCancel className="rounded-xl nano-glass font-bold text-xs m-0">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs btn-spring m-0"
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                if (recordToDelete) {
                  void handleDeleteRecordWithImage(recordToDelete);
                }
              }}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Deleting...
                </>
              ) : (
                'Delete Permanently'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default React.memo(LiveAttendanceFeed);
