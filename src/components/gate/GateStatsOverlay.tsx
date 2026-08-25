import React from 'react';
import { AlertTriangle, Clock, CheckCircle2, UserCheck, ShieldCheck } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { GateEntry } from '@/pages/GateMode';

interface GateStatsOverlayProps {
  totalStudents: number;
  uniqueStudents: number;
  autoMarkedCount: number;
  totalPresentToday: number;
  lateCount: number;
  pendingCount: number;
  unknownCount: number;
  recentEntries: GateEntry[];
}

const GateStatsOverlay = ({
  totalStudents,
  uniqueStudents,
  autoMarkedCount,
  totalPresentToday,
  lateCount,
  pendingCount,
  unknownCount,
  recentEntries,
}: GateStatsOverlayProps) => {
  return (
    <div className="h-full flex flex-col bg-card/50 backdrop-blur">
      {/* Big counter */}
      <div className="p-6 text-center border-b border-border">
        <div className="text-5xl font-black text-primary tabular-nums">
          {uniqueStudents}
          <span className="text-2xl text-muted-foreground">/{totalStudents}</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Entered / Registered</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-px bg-border">
        <div className="bg-card p-3 text-center">
          <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto mb-1" />
          <div className="text-xl font-bold text-foreground">{totalPresentToday}</div>
          <div className="text-xs text-muted-foreground">Present Today</div>
        </div>
        <div className="bg-card p-3 text-center">
          <Clock className="h-5 w-5 text-yellow-500 mx-auto mb-1" />
          <div className="text-xl font-bold text-foreground">{lateCount}</div>
          <div className="text-xs text-muted-foreground">Late</div>
        </div>
        <div className="bg-card p-3 text-center">
          <ShieldCheck className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
          <div className="text-xl font-bold text-foreground">{autoMarkedCount}</div>
          <div className="text-xs text-muted-foreground">Auto-Marked</div>
        </div>
        <div className="bg-card p-3 text-center">
          <AlertTriangle className="h-5 w-5 text-destructive mx-auto mb-1" />
          <div className="text-xl font-bold text-foreground">{pendingCount + unknownCount}</div>
          <div className="text-xs text-muted-foreground">Pending / Unknown</div>
        </div>
      </div>

      {/* Recent entries */}
      <div className="flex-1 border-t border-border">
        <div className="px-4 py-2 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Recent Entries</h3>
        </div>
        <ScrollArea className="flex-1 h-[calc(100%-40px)]">
          <div className="p-2 space-y-1">
            {recentEntries.map(entry => (
              <div key={entry.id} className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
                entry.isRecognized ? 'bg-green-500/5' : 'bg-destructive/5'
              }`}>
                <div className={`h-2 w-2 rounded-full flex-shrink-0 ${
                  entry.isRecognized 
                    ? entry.isLate ? 'bg-yellow-500' : 'bg-green-500'
                    : 'bg-destructive'
                }`} />
                <span className="truncate font-medium text-foreground">{entry.studentName}</span>
                <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                  {entry.time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
            {recentEntries.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">
                Waiting for entries...
              </p>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default GateStatsOverlay;
