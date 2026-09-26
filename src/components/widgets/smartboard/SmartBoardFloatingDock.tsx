import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Mic,
  Shuffle,
  Timer,
  PenTool,
  Maximize2,
  Minimize2,
  X,
  Volume2,
  Sparkles,
  Zap,
  ChevronRight,
  Share2,
  MessageSquare,
  GraduationCap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ClassStudent, ClassAssignment } from '@/components/teacher/TeacherAdminWorkspace';
import { DecibelMeterWidget } from '../android/DecibelMeterWidget';
import { StudentPickerWidget } from '../android/StudentPickerWidget';
import { StopwatchWidget } from '../android/StopwatchWidget';
import { SmartBoardScratchpad } from './SmartBoardScratchpad';
import { useToast } from '@/hooks/use-toast';

interface SmartBoardFloatingDockProps {
  students: ClassStudent[];
  activeClass: ClassAssignment | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onSelectClass?: (c: ClassAssignment) => void;
  classList?: ClassAssignment[];
}

export const SmartBoardFloatingDock: React.FC<SmartBoardFloatingDockProps> = ({
  students,
  activeClass,
  onRefresh,
  isRefreshing,
  onSelectClass,
  classList = [],
}) => {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<'decibel' | 'picker' | 'timer' | 'scratchpad' | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Position: pinned on right edge by default
  const [dockSide, setDockSide] = useState<'right' | 'left'>('right');

  // Stats
  const stats = React.useMemo(() => {
    const total = students.length;
    let present = 0;
    let late = 0;
    let absent = 0;
    let unmarked = 0;

    students.forEach((s) => {
      const st = s.today_status;
      if (st === 'present') present++;
      else if (st === 'late') late++;
      else if (st === 'absent') absent++;
      else unmarked++;
    });

    const attended = present + late;
    const rate = total > 0 ? Math.round((attended / total) * 100) : 0;

    return { total, present, late, absent, unmarked, attended, rate };
  }, [students]);

  // Fullscreen Handler
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  return (
    <>
      {/* ── 1. Floating Assistive Touch Bubble ── */}
      <div
        className={cn(
          "fixed top-28 sm:top-24 z-[9990] transition-all select-none",
          dockSide === 'right' ? "right-3 sm:right-5" : "left-3 sm:left-5"
        )}
      >
        <motion.div
          drag
          dragMomentum={false}
          dragElastic={0.15}
          onDragEnd={(_e, info) => {
            if (info.point.x < window.innerWidth / 2) {
              setDockSide('left');
            } else {
              setDockSide('right');
            }
          }}
          className="relative group cursor-grab active:cursor-grabbing"
        >
          {/* Main Floating Trigger Pill */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 p-1.5 sm:p-2.5 rounded-full bg-slate-950/92 text-white border-2 border-blue-500/50 shadow-2xl backdrop-blur-2xl hover:scale-105 transition-all hover:border-blue-400 active:scale-95"
            title="Classroom Smart Board Tools"
          >
            {/* Live Pulse Glow */}
            <div className="relative flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-md shadow-blue-500/30">
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
            </div>

            <div className="flex flex-col items-start pr-2">
              <span className="text-[10px] sm:text-[11px] font-black tracking-tight text-white flex items-center gap-1">
                {activeClass ? `Class ${activeClass.class}-${activeClass.section}` : 'Smart Tools'}
              </span>
              <span className="text-[8.5px] sm:text-[9px] font-mono font-bold text-emerald-400">
                {stats.rate}% Present
              </span>
            </div>
          </button>
        </motion.div>
      </div>

      {/* ── 2. Expanded Floating HUD / Assistive Drawer ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className={cn(
              "fixed top-44 z-[9995] w-[calc(100vw-24px)] sm:w-96 max-w-sm rounded-3xl border border-white/20 bg-slate-950/95 text-white p-4 shadow-2xl backdrop-blur-3xl",
              dockSide === 'right' ? "right-3 sm:right-6" : "left-3 sm:left-6"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Zap className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Smart Board Assistant</h3>
                  <p className="text-[10px] text-slate-400">PM Shri KV NFC Vigyan Vihar</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Attendance TPA Glance Strip */}
            <div className="my-3 p-3 rounded-2xl bg-white/5 border border-white/10">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-300">Live Class Attendance</span>
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px] font-mono">
                  {stats.rate}% Rate
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-1.5 text-center">
                <div className="p-1.5 rounded-xl bg-slate-800/80">
                  <p className="text-[9px] text-slate-400 font-medium">Total</p>
                  <p className="text-sm font-black text-white font-mono">{stats.total}</p>
                </div>
                <div className="p-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
                  <p className="text-[9px] text-emerald-300 font-medium">Present</p>
                  <p className="text-sm font-black text-emerald-400 font-mono">{stats.present}</p>
                </div>
                <div className="p-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30">
                  <p className="text-[9px] text-amber-300 font-medium">Late</p>
                  <p className="text-sm font-black text-amber-400 font-mono">{stats.late}</p>
                </div>
                <div className="p-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30">
                  <p className="text-[9px] text-rose-300 font-medium">Absent</p>
                  <p className="text-sm font-black text-rose-400 font-mono">{stats.absent + stats.unmarked}</p>
                </div>
              </div>
            </div>

            {/* Quick Smart Board Tool Buttons */}
            <div className="grid grid-cols-2 gap-2 my-2">
              <Button
                variant="outline"
                onClick={() => {
                  setActiveModal('picker');
                  setIsOpen(false);
                }}
                className="h-14 rounded-2xl border-white/10 bg-white/5 hover:bg-white/15 text-white flex flex-col items-center justify-center gap-1 text-xs font-bold transition-all"
              >
                <Shuffle className="h-5 w-5 text-indigo-400" />
                <span>Student Picker</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  setActiveModal('decibel');
                  setIsOpen(false);
                }}
                className="h-14 rounded-2xl border-white/10 bg-white/5 hover:bg-white/15 text-white flex flex-col items-center justify-center gap-1 text-xs font-bold transition-all"
              >
                <Mic className="h-5 w-5 text-emerald-400" />
                <span>Noise Meter</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  setActiveModal('timer');
                  setIsOpen(false);
                }}
                className="h-14 rounded-2xl border-white/10 bg-white/5 hover:bg-white/15 text-white flex flex-col items-center justify-center gap-1 text-xs font-bold transition-all"
              >
                <Timer className="h-5 w-5 text-amber-400" />
                <span>Period Timer</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  setActiveModal('scratchpad');
                  setIsOpen(false);
                }}
                className="h-14 rounded-2xl border-white/10 bg-white/5 hover:bg-white/15 text-white flex flex-col items-center justify-center gap-1 text-xs font-bold transition-all"
              >
                <PenTool className="h-5 w-5 text-sky-400" />
                <span>Scratchpad</span>
              </Button>
            </div>

            {/* Footer Actions: Fullscreen & Class Switcher */}
            <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={toggleFullscreen}
                className="h-8 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 gap-1.5"
              >
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                <span>{isFullscreen ? 'Exit 4K Fullscreen' : '4K Fullscreen'}</span>
              </Button>

              {onRefresh && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  className="h-8 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 gap-1"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5 text-blue-400", isRefreshing && "animate-spin")} />
                  <span>Sync</span>
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 3. Modals for Smart Board Tools ── */}

      {/* Decibel Noise Meter Dialog */}
      <Dialog open={activeModal === 'decibel'} onOpenChange={(o) => !o && setActiveModal(null)}>
        <DialogContent className="max-w-md bg-slate-950 border-white/15 text-white rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-white font-black">
              <Mic className="h-5 w-5 text-emerald-400" /> Classroom Decibel Sound Meter
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            <DecibelMeterWidget size="2x2" palette="dynamic-emerald" />
          </div>
        </DialogContent>
      </Dialog>

      {/* Student Picker Dialog */}
      <Dialog open={activeModal === 'picker'} onOpenChange={(o) => !o && setActiveModal(null)}>
        <DialogContent className="max-w-md bg-slate-950 border-white/15 text-white rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-white font-black">
              <Shuffle className="h-5 w-5 text-indigo-400" /> Random Student Lucky Wheel
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            <StudentPickerWidget students={students} size="2x2" palette="dynamic-purple" />
          </div>
        </DialogContent>
      </Dialog>

      {/* Period Timer Dialog */}
      <Dialog open={activeModal === 'timer'} onOpenChange={(o) => !o && setActiveModal(null)}>
        <DialogContent className="max-w-md bg-slate-950 border-white/15 text-white rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-white font-black">
              <Timer className="h-5 w-5 text-amber-400" /> Period Countdown & Stopwatch
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            <StopwatchWidget size="2x2" palette="dynamic-amber" />
          </div>
        </DialogContent>
      </Dialog>

      {/* Smart Board Scratchpad Modal */}
      <Dialog open={activeModal === 'scratchpad'} onOpenChange={(o) => !o && setActiveModal(null)}>
        <DialogContent className="max-w-4xl h-[80vh] bg-slate-950 border-white/15 text-white rounded-3xl p-4 flex flex-col">
          <DialogHeader className="sr-only">
            <DialogTitle>Smart Board Whiteboard</DialogTitle>
          </DialogHeader>
          <div className="flex-1 w-full h-full min-h-0">
            <SmartBoardScratchpad onClose={() => setActiveModal(null)} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
