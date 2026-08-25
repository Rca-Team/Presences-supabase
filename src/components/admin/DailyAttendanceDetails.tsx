import React from 'react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserCheck, Clock, XCircle, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isWorkingDayForSchool } from '@/utils/workingDays';
import { motion, AnimatePresence } from 'framer-motion';

interface DailyAttendanceDetailsProps {
  selectedDate: Date | undefined;
  dailyAttendance: {
    id: string;
    timestamp: string;
    status: string;
    name?: string;
    image_url?: string;
    source?: string;
    capture_mode?: string;
    period_key?: string;
    class_name?: string;
    section?: string;
    subject?: string;
  }[];
  isDateInArray: (date: Date, dateArray: Date[]) => boolean;
  attendanceDays: Date[];
  lateAttendanceDays: Date[];
  absentDays: Date[];
  selectedFaceId?: string | null;
  selectedUserName?: string | null;
}

// Normalize status for comparison
function normalizeStatus(status: string | null | undefined): string {
  if (!status) return 'unknown';
  const s = status.toLowerCase().trim();
  if (s.includes('present')) return 'present';
  if (s.includes('late')) return 'late';
  if (s.includes('absent')) return 'absent';
  return s;
}

const DailyAttendanceDetails: React.FC<DailyAttendanceDetailsProps> = ({
  selectedDate,
  dailyAttendance,
  isDateInArray,
  attendanceDays = [],
  lateAttendanceDays = [],
  absentDays = [],
  selectedFaceId,
  selectedUserName
}) => {
  const formatTime = (dateString: string) => format(new Date(dateString), 'h:mm a');

  const isToday = (date: Date) => {
    const t = new Date();
    return date.getDate() === t.getDate() && date.getMonth() === t.getMonth() && date.getFullYear() === t.getFullYear();
  };

  const isFutureDate = (date: Date) => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d > t;
  };

  if (!selectedDate) {
    return (
      <Card className="h-full border-dashed">
        <CardContent className="h-full flex flex-col items-center justify-center py-8 sm:py-12 gap-2 sm:gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-muted flex items-center justify-center">
            <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground/50" />
          </div>
          <div className="text-center">
            <p className="text-xs sm:text-sm font-medium">Select a date</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Tap any day on the calendar</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isPresentDate = isDateInArray(selectedDate, attendanceDays);
  const isLateDate = isDateInArray(selectedDate, lateAttendanceDays);
  const isAbsentDate = isDateInArray(selectedDate, absentDays);
  
  // Normalize daily attendance records
  const records = dailyAttendance.map(r => ({
    ...r,
    status: normalizeStatus(r.status)
  }));

  const isGateRecord = (record: { source?: string; capture_mode?: string }) => {
    const source = String(record.source || '').toLowerCase();
    const captureMode = String(record.capture_mode || '').toLowerCase();
    return source.includes('gate') || captureMode.includes('gate');
  };

  // Determine overall status - prioritize: records > calendar arrays > absent
  let overallStatus: 'present' | 'late' | 'absent' | 'future' | 'no-data' = 'no-data';
  
  if (isFutureDate(selectedDate)) {
    overallStatus = 'future';
  } else if (records.some(r => r.status === 'present')) {
    overallStatus = 'present';
  } else if (isPresentDate) {
    overallStatus = 'present';
  } else if (records.some(r => r.status === 'late')) {
    overallStatus = 'late';
  } else if (isLateDate) {
    overallStatus = 'late';
  } else if (isAbsentDate) {
    overallStatus = 'absent';
  } else {
    // Check if it's a working day in the past - if so, absent; otherwise no-data
    const isPastWorkingDay = isWorkingDayForSchool(selectedDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selDate = new Date(selectedDate);
    selDate.setHours(0, 0, 0, 0);
    overallStatus = (isPastWorkingDay && selDate < today) ? 'absent' : 'no-data';
  }

  const statusConfig = {
    present: { icon: UserCheck, label: 'Present', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', dot: 'bg-green-500' },
    late: { icon: Clock, label: 'Late', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', dot: 'bg-amber-500' },
    absent: { icon: XCircle, label: 'Absent', color: 'text-red-500 dark:text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', dot: 'bg-red-400' },
    future: { icon: CalendarDays, label: 'Upcoming', color: 'text-muted-foreground', bg: 'bg-muted/50', border: 'border-border', dot: 'bg-muted-foreground' },
    'no-data': { icon: CalendarDays, label: 'No Data', color: 'text-muted-foreground', bg: 'bg-muted/50', border: 'border-border', dot: 'bg-muted-foreground' },
  };

  const config = statusConfig[overallStatus];
  const StatusIcon = config.icon;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={selectedDate.toISOString()}
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -12 }}
        transition={{ duration: 0.2 }}
      >
        <Card className={cn("h-full overflow-hidden border", config.border)}>
          <CardContent className="p-0">
            {/* Date header */}
            <div className={cn("px-3 sm:px-4 py-2.5 sm:py-3 border-b", config.bg)}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">{format(selectedDate, 'EEEE')}</p>
                  <p className="font-bold text-base sm:text-lg tabular-nums">{format(selectedDate, 'MMM d, yyyy')}</p>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {isToday(selectedDate) && (
                    <Badge variant="secondary" className="text-[9px] sm:text-[10px] px-1.5 py-0">Today</Badge>
                  )}
                  <div className={cn("w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center", config.bg)}>
                    <StatusIcon className={cn("w-4 h-4 sm:w-5 sm:h-5", config.color)} />
                  </div>
                </div>
              </div>
            </div>

            {/* Status banner */}
            <div className={cn("px-3 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-3", config.bg, "border-b", config.border)}>
              <span className={cn("w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shrink-0", config.dot)} />
              <span className={cn("text-xs sm:text-sm font-semibold", config.color)}>{config.label}</span>
              {records.length > 0 && records[0]?.timestamp && overallStatus !== 'future' && (
                <span className="text-[10px] sm:text-xs text-muted-foreground ml-auto">
                  {formatTime(records[0].timestamp)}
                </span>
              )}
            </div>

            {/* Records */}
            <div className="p-3 sm:p-4">
              {overallStatus === 'future' ? (
                <p className="text-xs sm:text-sm text-muted-foreground text-center py-3 sm:py-4">
                  This is a future date. Attendance data will appear after the day passes.
                </p>
              ) : records.length > 0 ? (
                <div className="space-y-1.5 sm:space-y-2">
                  <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 sm:mb-2">
                    Activity Log
                  </p>
                  {records.map((record, i) => (
                    <motion.div
                      key={record.id || i}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-lg bg-muted/40 active:bg-muted/60 sm:hover:bg-muted/60 transition-colors"
                    >
                      <div className={cn(
                        "w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0",
                        record.status === 'late' ? 'bg-amber-500/15' : 'bg-green-500/15'
                      )}>
                        {record.status === 'late' ? (
                          <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 dark:text-amber-400" />
                        ) : (
                          <UserCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600 dark:text-green-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-medium">{formatTime(record.timestamp)}</p>
                        {isGateRecord(record) && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            Gate{record.subject ? ` • ${record.subject}` : ''}
                            {record.class_name || record.section ? ` • ${record.class_name || ''}${record.section ? `-${record.section}` : ''}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isGateRecord(record) && (
                          <Badge
                            variant="outline"
                            className="text-[9px] sm:text-[10px] px-1.5 py-0 border-primary/30 text-primary"
                          >
                            Gate
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] sm:text-[10px] px-1.5 py-0",
                            record.status === 'late'
                              ? 'border-amber-500/30 text-amber-600 dark:text-amber-400'
                              : 'border-green-500/30 text-green-600 dark:text-green-400'
                          )}
                        >
                          {record.status === 'late' ? 'Late' : 'Present'}
                        </Badge>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 sm:py-6">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {overallStatus === 'absent' ? 'No attendance recorded for this day.' : 'No detailed records available.'}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
};

export default DailyAttendanceDetails;
