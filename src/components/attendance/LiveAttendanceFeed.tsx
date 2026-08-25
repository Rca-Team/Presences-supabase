import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { format } from 'date-fns';
import {
  Activity,
  Clock,
  CheckCircle,
  AlertCircle,
  Zap
} from 'lucide-react';

const STORAGE_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/face-images/`;

interface AttendanceRecord {
  id: string;
  user_id: string | null;
  timestamp: string;
  status: string | null;
  confidence: number | null;
  category: string | null;
  image_url: string | null;
  device_info: any;
}

const LiveAttendanceFeed: React.FC = () => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [visibleCount, setVisibleCount] = useState(10);
  const [profileAvatarByUserId, setProfileAvatarByUserId] = useState<Record<string, string>>({});

  const visibleRecords = useMemo(() => records.slice(0, visibleCount), [records, visibleCount]);

  const getStudentName = (record: AttendanceRecord): string => {
    if (record.device_info?.metadata?.name) {
      return record.device_info.metadata.name;
    }
    return record.user_id?.slice(0, 8) || 'Unknown';
  };

  const getStudentImage = (record: AttendanceRecord): string | null => {
    // First check direct image_url
    if (record.image_url) {
      if (record.image_url.startsWith('data:') || record.image_url.startsWith('http')) {
        return record.image_url;
      }
      return `${STORAGE_BASE_URL}${record.image_url}`;
    }

    // Then check known metadata image fields
    const metadata = record.device_info?.metadata;
    if (metadata?.avatar_url && typeof metadata.avatar_url === 'string') {
      return metadata.avatar_url;
    }
    if (metadata?.photo_url && typeof metadata.photo_url === 'string') {
      return metadata.photo_url;
    }
    if (metadata?.image_url && typeof metadata.image_url === 'string') {
      if (metadata.image_url.startsWith('data:') || metadata.image_url.startsWith('http')) {
        return metadata.image_url;
      }
      return `${STORAGE_BASE_URL}${metadata.image_url}`;
    }

    // Check metadata for firebase_image_url
    if (metadata?.firebase_image_url) {
      return metadata.firebase_image_url;
    }

    // Final fallback: fetch from profiles table by user_id
    if (record.user_id && profileAvatarByUserId[record.user_id]) {
      return profileAvatarByUserId[record.user_id];
    }

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
        .limit(20);
      
      if (data) setRecords(data);
    };

    fetchRecords();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('attendance-live-feed')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'attendance_records'
        },
        (payload) => {
          const newRecord = payload.new as AttendanceRecord;
          // Only show actual attendance records, not registrations
          if (newRecord.status && ['present', 'late', 'absent'].includes(newRecord.status)) {
            setRecords(prev => [newRecord, ...prev.slice(0, 19)]);
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
      const userIds = Array.from(new Set(records
        .map((record) => record.user_id)
        .filter((id): id is string => Boolean(id))));

      if (!userIds.length) {
        setProfileAvatarByUserId({});
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, avatar_url')
        .in('id', userIds);

      if (error || !data) {
        return;
      }

      const nextMap: Record<string, string> = {};
      data.forEach((profile: any) => {
        const image = profile.avatar_url;
        if (profile.id && image) {
          nextMap[profile.id] = image;
        }
      });

      setProfileAvatarByUserId(nextMap);
    };

    void fetchProfileImages();
  }, [records]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Activity className="w-4 h-4 text-green-500" />
          </motion.div>
          <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">
            <span className="relative flex h-1.5 w-1.5 mr-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
            </span>
            Live
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">{records.filter(r => r.status === 'present').length} present today</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {visibleRecords.map((record, index) => {
              const studentName = getStudentName(record);
              const studentImage = getStudentImage(record);
              
              return (
                <motion.div
                  key={record.id}
                  initial={{ opacity: 0, x: -20, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 20, scale: 0.95 }}
                  transition={{ delay: index * 0.02 }}
                  className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
                    record.status === 'present' 
                      ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900'
                      : record.status === 'late'
                      ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900'
                      : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
                  }`}
                >
                  {/* Profile Photo */}
                  <Avatar className="h-10 w-10 border-2 border-white shadow-sm shrink-0">
                    {studentImage ? (
                      <AvatarImage src={studentImage} alt={studentName} className="object-cover" />
                    ) : (
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-cyan-500 text-white text-sm font-medium">
                        {studentName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm truncate">
                        {studentName}
                      </span>
                      {record.confidence && record.confidence > 90 && (
                        <Zap className="w-3 h-3 text-yellow-500 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {format(new Date(record.timestamp), 'HH:mm')}
                      {record.category && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                          {record.category}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    {record.status === 'present' ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : record.status === 'late' ? (
                      <AlertCircle className="w-5 h-5 text-orange-500" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-500" />
                    )}
                    <span className={`text-[10px] font-medium ${
                      record.status === 'present' ? 'text-green-600' :
                      record.status === 'late' ? 'text-orange-600' : 'text-red-600'
                    }`}>
                      {record.status?.charAt(0).toUpperCase()}{record.status?.slice(1)}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {records.length === 0 && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Activity className="w-10 h-10 text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">No attendance records today</p>
              <p className="text-[10px] text-muted-foreground/70">Records will appear here in real-time</p>
            </div>
          )}

          {records.length > visibleCount && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setVisibleCount((count) => Math.min(count + 10, records.length))}
                className="w-full rounded-md border border-border bg-background/70 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Show more
              </button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default LiveAttendanceFeed;
