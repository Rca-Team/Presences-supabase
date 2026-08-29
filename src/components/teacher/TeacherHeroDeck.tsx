import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  GraduationCap, 
  Clock, 
  Calendar, 
  RefreshCw, 
  ShieldCheck, 
  CheckCircle2, 
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { motion } from 'framer-motion';

interface TeacherHeroDeckProps {
  teacherName: string;
  teacherEmail: string;
  avatarUrl?: string;
  activeClass: { class: string; section: string; category: string } | null;
  assignments: Array<{ class: string; section: string; category: string }>;
  onSelectClass: (c: { class: string; section: string; category: string }) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  totalStudents: number;
}

const SCHOOL_PERIODS = [
  { num: 1, start: '08:00', end: '08:45', name: 'Assembly & Homeroom' },
  { num: 2, start: '08:45', end: '09:30', name: 'Period 1' },
  { num: 3, start: '09:30', end: '10:15', name: 'Period 2' },
  { num: 4, start: '10:15', end: '10:35', name: 'Recess Break' },
  { num: 5, start: '10:35', end: '11:20', name: 'Period 3' },
  { num: 6, start: '11:20', end: '12:05', name: 'Period 4' },
  { num: 7, start: '12:05', end: '12:50', name: 'Period 5' },
  { num: 8, start: '12:50', end: '01:30', name: 'Period 6' },
];

export const TeacherHeroDeck: React.FC<TeacherHeroDeckProps> = ({
  teacherName,
  teacherEmail,
  avatarUrl,
  activeClass,
  assignments,
  onSelectClass,
  onRefresh,
  isRefreshing,
  totalStudents,
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const currentPeriod = React.useMemo(() => {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    const currentMin = hours * 60 + minutes;

    for (const p of SCHOOL_PERIODS) {
      const [sh, sm] = p.start.split(':').map(Number);
      const [eh, em] = p.end.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;

      if (currentMin >= startMin && currentMin < endMin) {
        return p;
      }
    }
    return null;
  }, [currentTime]);

  const formattedDate = currentTime.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const formattedTime = currentTime.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-card/90 via-card/60 to-primary/5 p-5 md:p-6 shadow-xl backdrop-blur-2xl">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar className="h-16 w-16 md:h-20 md:w-20 rounded-2xl border-2 border-primary/40 shadow-lg ring-4 ring-primary/10">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={teacherName} /> : null}
              <AvatarFallback className="text-lg md:text-xl font-black bg-gradient-to-br from-primary to-blue-600 text-white">
                {teacherName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-background text-[10px]">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </span>
          </div>

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>
                {teacherName}
              </h1>
              <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] font-bold px-2 py-0.5 rounded-lg">
                <GraduationCap className="h-3 w-3 mr-1" />
                Faculty In-Charge
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground truncate">
              {teacherEmail || 'School Authorized Faculty'} · PM Shri Kendriya Vidyalaya
            </p>

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              {activeClass && (
                <Badge variant="outline" className="text-[11px] font-bold border-primary/40 bg-primary/10 text-primary rounded-lg py-0.5">
                  <BookOpen className="h-3 w-3 mr-1" />
                  Primary Class: {activeClass.category} ({totalStudents} Students)
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px] font-medium border-border/70 text-muted-foreground rounded-lg py-0.5">
                <ShieldCheck className="h-3 w-3 mr-1 text-emerald-500" />
                CBSE Attendance Scoped
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 p-3 rounded-2xl border border-border/60 bg-background/50 backdrop-blur-md shadow-xs">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
              <Clock className="h-5 w-5" />
            </div>
            <div className="text-right sm:text-left">
              <p className="text-xs font-bold text-foreground font-mono">{formattedTime}</p>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Calendar className="h-2.5 w-2.5" />
                {formattedDate}
              </p>
              {currentPeriod ? (
                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                  Live: {currentPeriod.name} ({currentPeriod.start} - {currentPeriod.end})
                </span>
              ) : (
                <span className="text-[9px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                  School Shift Active
                </span>
              )}
            </div>
          </div>

          <Button
            size="icon"
            variant="outline"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-10 w-10 rounded-2xl border-border/70 shrink-0"
            title="Refresh class data"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {assignments.length > 1 && (
        <div className="mt-4 pt-3.5 border-t border-border/40 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-muted-foreground mr-1">Assigned Classes:</span>
            {assignments.map((a) => {
              const isSelected = activeClass?.category === a.category;
              return (
                <motion.button
                  key={a.category}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onSelectClass(a)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                    isSelected
                      ? 'bg-primary text-white shadow-md shadow-primary/25 ring-2 ring-primary/40'
                      : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60'
                  }`}
                >
                  Class {a.class}–{a.section}
                </motion.button>
              );
            })}
          </div>

          <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-primary" />
            <span>Attendance & Admin Mode Active</span>
          </div>
        </div>
      )}
    </div>
  );
};
export default TeacherHeroDeck;
