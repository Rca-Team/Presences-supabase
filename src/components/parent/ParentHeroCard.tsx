import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  CheckCircle2,
  Clock,
  UserX,
  Flame,
  GraduationCap,
  Calendar,
  Sparkles,
  PhoneCall,
  FileText,
  DoorOpen,
  TrendingUp,
  AlertTriangle,
  Award,
  Users,
  Sun,
  ShieldCheck,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { ChildProfile, ParentSummaryStats } from '@/hooks/useParentPortal';
import { format } from 'date-fns';
import { useStudentCoverPhoto } from '@/utils/studentPhotoResolver';
import studentCampusBanner from '@/assets/student-campus-banner.jpg';

interface ParentHeroCardProps {
  child: ChildProfile;
  summary: ParentSummaryStats;
  isLive: boolean;
  onOpenLeaveModal: () => void;
  onOpenTimetableTab: () => void;
  onOpenReportModal: () => void;
  onOpenPassModal: () => void;
  savedChildren: ChildProfile[];
  onSelectSibling: (sibling: ChildProfile) => void;
  onLogout: () => void;
}

export const ParentHeroCard: React.FC<ParentHeroCardProps> = ({
  child,
  summary,
  isLive,
  onOpenLeaveModal,
  onOpenTimetableTab,
  onOpenReportModal,
  onOpenPassModal,
  savedChildren,
  onSelectSibling,
  onLogout,
}) => {
  const statusConfig = {
    present: {
      title: 'Present in School',
      subtitle: summary.todayCheckinTime
        ? `Arrived at ${format(new Date(summary.todayCheckinTime), 'hh:mm a')}`
        : 'Checked in today',
      badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
      dotClass: 'bg-emerald-500',
      icon: CheckCircle2,
      borderGlow: 'border-emerald-500/30 shadow-emerald-500/5',
    },
    late: {
      title: 'Marked Late',
      subtitle: summary.todayCheckinTime
        ? `Arrived at ${format(new Date(summary.todayCheckinTime), 'hh:mm a')} (after 07:30 AM cutoff)`
        : 'Arrived after cutoff',
      badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
      dotClass: 'bg-amber-500',
      icon: Clock,
      borderGlow: 'border-amber-500/30 shadow-amber-500/5',
    },
    absent: {
      title: 'Absent Today',
      subtitle: 'Not recognized at gate yet for today',
      badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
      dotClass: 'bg-rose-500',
      icon: UserX,
      borderGlow: 'border-rose-500/30 shadow-rose-500/5',
    },
    weekend: {
      title: 'School Closed',
      subtitle: 'Weekend / Holiday',
      badgeClass: 'bg-muted text-muted-foreground border-border',
      dotClass: 'bg-muted-foreground',
      icon: Sun,
      borderGlow: 'border-border',
    },
  }[summary.todayStatus] || {
    title: 'Absent Today',
    subtitle: 'Not marked yet',
    badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
    dotClass: 'bg-rose-500',
    icon: UserX,
    borderGlow: 'border-border',
  };

  const StatusIcon = statusConfig.icon;
  const { coverUrl } = useStudentCoverPhoto(child);
  const displayPhoto = coverUrl || child.image_url;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="w-full space-y-4"
    >
      {/* Top Switcher Bar if multiple siblings */}
      {savedChildren.length > 1 && (
        <div className="flex items-center justify-between bg-card/60 backdrop-blur-xl border border-border/80 px-4 py-2.5 rounded-2xl">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground flex items-center gap-1">
              <Users className="h-3.5 w-3.5 text-primary" /> Active Child:
            </span>
            <div className="flex gap-1.5 overflow-x-auto">
              {savedChildren.map((sibling) => (
                <button
                  key={sibling.employee_id}
                  type="button"
                  onClick={() => onSelectSibling(sibling)}
                  className={`text-xs px-2.5 py-1 rounded-xl font-bold transition-all ${
                    sibling.employee_id === child.employee_id
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                  }`}
                >
                  {sibling.name}
                </button>
              ))}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout} className="text-xs h-7 text-muted-foreground">
            Switch
          </Button>
        </div>
      )}

      {/* Main Hero Card */}
      <Card
        className={`rounded-3xl border bg-card/95 backdrop-blur-2xl shadow-xl overflow-hidden relative ${statusConfig.borderGlow}`}
      >
        {/* Cinematic Smart Campus Background Banner */}
        <div className="relative h-28 sm:h-36 md:h-44 w-full overflow-hidden bg-gradient-to-r from-primary/30 via-sky-500/20 to-indigo-500/25">
          <img
            src={studentCampusBanner}
            alt="PM Shri KV NFC Vigyan Vihar Campus"
            className="h-full w-full object-cover object-center filter brightness-90 contrast-105 transition-transform duration-700 hover:scale-105"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-black/25" />
          <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-md px-3 py-1 text-[10px] sm:text-xs font-bold text-white border border-white/20 shadow-md">
            <Sparkles className="h-3 w-3 text-amber-400" />
            <span>PM Shri KV NFC Vigyan Vihar</span>
          </div>
        </div>

        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

        <CardContent className="p-5 sm:p-7 relative -mt-10 sm:-mt-14 z-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
            {/* Child Profile & Live Presence */}
            <div className="flex items-end gap-4 sm:gap-5">
              <div className="relative shrink-0">
                <Avatar className="h-20 w-20 sm:h-24 sm:w-24 rounded-3xl border-4 border-card bg-card shadow-2xl shrink-0 ring-2 ring-border/80">
                  <AvatarImage src={displayPhoto} className="object-cover" />
                  <AvatarFallback className="text-2xl font-black bg-primary/20 text-primary">
                    {child.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={`absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-2 border-card flex items-center justify-center ${statusConfig.badgeClass} shadow-md`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${statusConfig.dotClass} animate-pulse`} />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                    {child.name}
                  </h2>
                  <Badge className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${statusConfig.badgeClass}`}>
                    <StatusIcon className="h-3.5 w-3.5 mr-1 inline-block" /> {statusConfig.title}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                  {statusConfig.subtitle}
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <Badge variant="secondary" className="text-xs font-semibold rounded-xl gap-1">
                    <GraduationCap className="h-3 w-3" /> Class {child.category}
                  </Badge>
                  <Badge variant="outline" className="text-xs font-mono text-muted-foreground rounded-xl">
                    ID: {child.employee_id}
                  </Badge>
                  {summary.streak >= 2 && (
                    <Badge variant="outline" className="text-xs border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-bold rounded-xl gap-1">
                      <Flame className="h-3 w-3 text-amber-500 fill-amber-500" /> {summary.streak}-Day Streak
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Action Buttons for Parents */}
            <div className="flex flex-wrap md:flex-col items-stretch gap-2 shrink-0">
              <Button
                onClick={onOpenLeaveModal}
                size="sm"
                className="rounded-2xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white shadow-md shadow-blue-500/25 text-xs h-10 px-4 flex-1 md:flex-initial border-0"
              >
                <Calendar className="mr-1.5 h-4 w-4 text-white" /> Apply for Leave
              </Button>
              <div className="flex gap-2 flex-1 md:flex-initial">
                <Button
                  onClick={onOpenTimetableTab}
                  variant="outline"
                  size="sm"
                  className="rounded-2xl text-xs font-semibold h-10 flex-1 border-border/80 text-foreground hover:text-primary"
                >
                  <Clock className="mr-1 h-3.5 w-3.5 text-primary" /> Classes
                </Button>
                <Button
                  onClick={onOpenPassModal}
                  variant="outline"
                  size="sm"
                  className="rounded-2xl text-xs font-semibold h-10 flex-1 border-border/80 text-foreground hover:text-primary"
                  title="Generate Digital Early Exit Gate Pass"
                >
                  <DoorOpen className="mr-1 h-3.5 w-3.5 text-emerald-500" /> Gate Pass
                </Button>
                <Button
                  onClick={onOpenReportModal}
                  variant="outline"
                  size="sm"
                  className="rounded-2xl text-xs font-semibold h-10 flex-1 border-border/80 text-foreground hover:text-primary"
                >
                  <FileText className="mr-1 h-3.5 w-3.5 text-amber-500" /> PDF
                </Button>
              </div>
            </div>
          </div>

          {/* Quick Metrics Ribbon (3 Key Stats) */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 mt-6 pt-5 border-t border-border/60">
            {/* Attendance Rate */}
            <div className="rounded-2xl border border-border/70 bg-background/60 p-3 sm:p-3.5 text-center">
              <p className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Monthly Rate
              </p>
              <p className="text-lg sm:text-2xl font-black text-primary mt-0.5">
                {summary.attendanceRate}%
              </p>
              <p className="text-[10px] text-muted-foreground font-medium">
                {summary.attendanceRate >= 75 ? '✅ CBSE Safe' : '⚠️ Below 75%'}
              </p>
            </div>

            {/* Present Days */}
            <div className="rounded-2xl border border-border/70 bg-background/60 p-3 sm:p-3.5 text-center">
              <p className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Present Days
              </p>
              <p className="text-lg sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                {summary.presentDays} <span className="text-xs font-normal text-muted-foreground">/ {summary.workingDays}</span>
              </p>
              <p className="text-[10px] text-muted-foreground font-medium">
                This month
              </p>
            </div>

            {/* School Timing */}
            <div className="rounded-2xl border border-border/70 bg-background/60 p-3 sm:p-3.5 text-center">
              <p className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider">
                School Hours
              </p>
              <p className="text-xs sm:text-base font-black text-foreground mt-1">
                07:20 – 12:15
              </p>
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                Lunch 09:40–10:00
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
