import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { FaceInfo } from './utils/attendanceUtils';
import NotificationService from './NotificationService';
import { User, CheckCircle2, Clock, TrendingUp, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StudentInfoCardProps {
  selectedFace: FaceInfo | null;
  attendanceDays: Date[];
  lateAttendanceDays: Date[];
  absentDays?: Date[];
  workingDays?: Date[];
  reportControls?: React.ReactNode;
}

const StudentInfoCard: React.FC<StudentInfoCardProps> = ({ 
  selectedFace, 
  attendanceDays, 
  lateAttendanceDays,
  absentDays = [],
  workingDays = [],
  reportControls
}) => {
  const totalAttended = attendanceDays.length + lateAttendanceDays.length;
  // Calculate attendance rate: (present + late) / past working days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pastWorkingDays = workingDays.filter(d => { const dd = new Date(d); dd.setHours(0,0,0,0); return dd <= today; }).length;
  const attendanceRate = pastWorkingDays > 0 ? Math.round((totalAttended / pastWorkingDays) * 100) : 0;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Top section: Avatar + Name + Stats */}
        <div className="p-3 sm:p-4">
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Avatar */}
            <Avatar className="h-11 w-11 sm:h-14 sm:w-14 rounded-xl border-2 border-border shrink-0">
              <AvatarImage 
                src={selectedFace?.image_url && selectedFace.image_url.startsWith('data:') 
                  ? selectedFace.image_url 
                  : selectedFace?.image_url
                    ? `https://zovwmlqnrsionbolcpng.supabase.co/storage/v1/object/public/face-images/${selectedFace.image_url}`
                    : undefined
                } 
                alt={selectedFace?.name || 'Student'}
                className="object-cover"
              />
              <AvatarFallback className="rounded-xl text-base sm:text-lg font-bold">
                {selectedFace?.name?.charAt(0) || <User className="h-5 w-5 sm:h-6 sm:w-6" />}
              </AvatarFallback>
            </Avatar>

            {/* Name & badges */}
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-base sm:text-lg truncate">{selectedFace?.name || 'Student'}</h2>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap mt-0.5">
                <Badge variant="secondary" className="text-[9px] sm:text-[10px] font-normal px-1.5 py-0">
                  {selectedFace?.employee_id || 'N/A'}
                </Badge>
                {selectedFace?.department && (
                  <span className="text-[10px] sm:text-xs text-muted-foreground truncate max-w-[80px] sm:max-w-none">
                    {selectedFace.department}
                  </span>
                )}
                {selectedFace?.position && selectedFace.position !== 'Student' && (
                  <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1.5 py-0 hidden sm:inline-flex">{selectedFace.position}</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Stats row - always horizontal, compact on mobile */}
          <div className="flex items-center gap-1.5 sm:gap-2 mt-3 overflow-x-auto no-scrollbar">
            <StatChip icon={CheckCircle2} value={attendanceDays.length} label="Present" className="text-green-600 dark:text-green-400 bg-green-500/10" />
            <StatChip icon={Clock} value={lateAttendanceDays.length} label="Late" className="text-amber-600 dark:text-amber-400 bg-amber-500/10" />
            <StatChip icon={XCircle} value={absentDays.length} label="Absent" className="text-red-500 dark:text-red-400 bg-red-500/10" />
            {pastWorkingDays > 0 && (
              <StatChip icon={TrendingUp} value={`${attendanceRate}%`} label="Rate" className="text-primary bg-primary/10" />
            )}
          </div>
        </div>

        {/* Action bar */}
        <div className="border-t border-border/50 bg-muted/30 px-3 sm:px-4 py-2 flex items-center justify-between gap-2">
          <div onClick={(e) => e.stopPropagation()}>
            <NotificationService 
              studentId={selectedFace?.user_id || selectedFace?.recordId}
              studentName={selectedFace?.name}
              attendanceStatus="present"
            />
          </div>
          {reportControls}
        </div>
      </CardContent>
    </Card>
  );
};

const StatChip: React.FC<{ icon: React.ElementType; value: number | string; label: string; className?: string }> = ({ icon: Icon, value, label, className }) => (
  <div className={cn("flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-medium whitespace-nowrap shrink-0", className)}>
    <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
    <span className="font-bold tabular-nums">{value}</span>
    <span className="opacity-70">{label}</span>
  </div>
);

export default StudentInfoCard;
