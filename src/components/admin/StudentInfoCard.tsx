import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { FaceInfo } from './utils/attendanceUtils';
import NotificationService from './NotificationService';
import { User, CheckCircle2, Clock, TrendingUp, XCircle, Award } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudentCoverPhoto } from '@/utils/studentPhotoResolver';
import { format, isSameMonth } from 'date-fns';

interface StudentInfoCardProps {
  selectedFace: FaceInfo | null;
  attendanceDays: Date[];
  lateAttendanceDays: Date[];
  absentDays?: Date[];
  workingDays?: Date[];
  visibleMonth?: Date;
  reportControls?: React.ReactNode;
  onToggleDetails?: () => void;
  showDetailsPanel?: boolean;
}

const StudentInfoCard: React.FC<StudentInfoCardProps> = ({ 
  selectedFace, 
  attendanceDays, 
  lateAttendanceDays,
  absentDays = [],
  workingDays = [],
  visibleMonth = new Date(),
  reportControls,
  onToggleDetails,
  showDetailsPanel
}) => {
  // Use unified student cover photo resolver
  const { coverUrl } = useStudentCoverPhoto({
    id: selectedFace?.recordId,
    user_id: selectedFace?.user_id,
    name: selectedFace?.name,
    employee_id: selectedFace?.employee_id,
    image_url: selectedFace?.image_url,
  });

  const displayPhoto = coverUrl || selectedFace?.image_url;

  // Month-scoped Attendance Calculations
  const targetMonth = visibleMonth || new Date();
  const monthPresentDays = attendanceDays.filter(d => isSameMonth(new Date(d), targetMonth));
  const monthLateDays = lateAttendanceDays.filter(d => isSameMonth(new Date(d), targetMonth));
  const monthAttended = monthPresentDays.length + monthLateDays.length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Past working days in the active month
  const pastWorkingDaysInMonth = workingDays.filter(d => {
    const dd = new Date(d);
    dd.setHours(0, 0, 0, 0);
    return isSameMonth(dd, targetMonth) && dd <= today;
  }).length;

  // Accurate Rate: strictly capped between 0 and 100%
  const monthRate = pastWorkingDaysInMonth > 0
    ? Math.min(100, Math.round((monthAttended / pastWorkingDaysInMonth) * 100))
    : monthAttended > 0 ? 100 : 0;

  // All-time total sessions
  const totalAllTime = attendanceDays.length + lateAttendanceDays.length;

  // Derive readable Class & Section
  const classSectionLabel = selectedFace?.class && selectedFace?.section
    ? `Class ${selectedFace.class}-${selectedFace.section}`
    : selectedFace?.department && selectedFace.department !== 'N/A'
      ? `Class ${selectedFace.department}`
      : 'Student';

  // Today's status check
  const isTodayPresent = attendanceDays.some(d => {
    const dd = new Date(d);
    return dd.getFullYear() === today.getFullYear() && dd.getMonth() === today.getMonth() && dd.getDate() === today.getDate();
  });
  const isTodayLate = lateAttendanceDays.some(d => {
    const dd = new Date(d);
    return dd.getFullYear() === today.getFullYear() && dd.getMonth() === today.getMonth() && dd.getDate() === today.getDate();
  });

  const todayStatusRing = isTodayPresent 
    ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-background' 
    : isTodayLate 
      ? 'ring-2 ring-amber-500 ring-offset-2 ring-offset-background' 
      : 'ring-1 ring-border';

  return (
    <Card className="overflow-hidden border border-border/70 bg-card/95 shadow-md backdrop-blur-xl">
      <CardContent className="p-0">
        {/* Top profile banner */}
        <div className="p-3.5 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Avatar & Student Credentials */}
            <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
              <div className="relative shrink-0">
                <Avatar className={cn("h-14 w-14 sm:h-16 sm:w-16 rounded-2xl border border-white/20 shadow-sm object-cover", todayStatusRing)}>
                  {displayPhoto ? (
                    <AvatarImage 
                      src={displayPhoto} 
                      alt={selectedFace?.name || 'Student'}
                      className="object-cover h-full w-full"
                    />
                  ) : null}
                  <AvatarFallback className="rounded-2xl bg-gradient-to-br from-primary/20 to-sky-500/20 text-primary text-lg sm:text-xl font-black">
                    {selectedFace?.name?.charAt(0) || <User className="h-6 w-6" />}
                  </AvatarFallback>
                </Avatar>
                {isTodayPresent && (
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-background flex items-center justify-center text-[8px] text-white font-bold" title="Present Today">
                    ✓
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-extrabold text-base sm:text-lg tracking-tight text-foreground truncate">
                    {selectedFace?.name || 'Student'}
                  </h2>
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px] font-bold px-2 py-0.5">
                    {classSectionLabel}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 flex-wrap mt-1 text-xs text-muted-foreground">
                  <span className="font-mono bg-muted/60 px-2 py-0.5 rounded-md text-[11px] font-semibold text-foreground/80">
                    Roll: {selectedFace?.roll_number || selectedFace?.position || 'N/A'}
                  </span>
                  <span className="font-mono bg-muted/60 px-2 py-0.5 rounded-md text-[11px] font-semibold text-foreground/80">
                    Adm: {selectedFace?.admission_number || selectedFace?.employee_id || 'N/A'}
                  </span>
                  {selectedFace?.blood_group && (
                    <span className="bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold px-1.5 py-0.5 rounded-md text-[10px]">
                      {selectedFace.blood_group}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick action button for details if handler provided */}
            {onToggleDetails && (
              <div className="shrink-0 flex items-center gap-2 self-end sm:self-center">
                <button
                  type="button"
                  onClick={onToggleDetails}
                  className="text-xs px-3 py-1.5 rounded-xl border border-border/80 bg-background hover:bg-muted font-semibold transition-colors"
                >
                  {showDetailsPanel ? 'Hide Details' : 'View & Edit Details'}
                </button>
              </div>
            )}
          </div>

          {/* Stats Chips Row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4 pt-3 border-t border-border/50">
            <StatChip 
              icon={CheckCircle2} 
              value={monthPresentDays.length} 
              label="Present (Month)" 
              className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20" 
            />
            <StatChip 
              icon={Clock} 
              value={monthLateDays.length} 
              label="Late (Month)" 
              className="text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20" 
            />
            <StatChip 
              icon={XCircle} 
              value={absentDays.length} 
              label="Absent (Month)" 
              className="text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20" 
            />
            <StatChip 
              icon={TrendingUp} 
              value={`${monthRate}%`} 
              label={`Rate (${format(targetMonth, 'MMM')})`} 
              className="text-primary bg-primary/10 border border-primary/20" 
            />
            <StatChip 
              icon={Award} 
              value={totalAllTime} 
              label="All-Time Attended" 
              className="text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 col-span-2 sm:col-span-1" 
            />
          </div>
        </div>

        {/* Action bar */}
        <div className="border-t border-border/60 bg-muted/40 px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div onClick={(e) => e.stopPropagation()}>
            <NotificationService 
              studentId={selectedFace?.user_id || selectedFace?.employee_id || selectedFace?.recordId}
              studentName={selectedFace?.name}
              attendanceStatus={isTodayPresent ? 'present' : isTodayLate ? 'late' : 'absent'}
            />
          </div>
          <div className="flex items-center gap-2">
            {reportControls}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const StatChip: React.FC<{ 
  icon: React.ElementType; 
  value: number | string; 
  label: string; 
  className?: string;
}> = ({ icon: Icon, value, label, className }) => (
  <div className={cn("flex items-center gap-2 p-2.5 rounded-2xl text-xs font-semibold whitespace-nowrap min-w-0 transition-transform active:scale-95", className)}>
    <div className="p-1 rounded-lg bg-background/50 shrink-0">
      <Icon className="w-3.5 h-3.5" />
    </div>
    <div className="min-w-0 flex flex-col">
      <span className="font-extrabold text-sm tabular-nums leading-tight">{value}</span>
      <span className="text-[10px] opacity-75 truncate">{label}</span>
    </div>
  </div>
);

export default StudentInfoCard;
