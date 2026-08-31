import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Users,
  ShieldCheck,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Shirt,
  Sparkles,
  UserCheck,
  History,
  Activity,
  Download,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  onManualCheckIn?: (studentName: string) => void;
  smartMonitoring?: {
    uniformCompliant: number;
    uniformNonCompliant: number;
    entryFlow: number;
    exitFlow: number;
    stationary?: number;
    people?: Array<{
      trackId: string;
      name: string;
      confidence: number;
      uniformStatus: 'compliant' | 'non-compliant' | 'unknown';
      hasLanyard?: boolean;
      heading: 'entry' | 'exit' | 'stationary';
    }>;
  };
}

const GateStatsOverlay: React.FC<GateStatsOverlayProps> = ({
  totalStudents,
  uniqueStudents,
  autoMarkedCount,
  totalPresentToday,
  lateCount,
  pendingCount,
  unknownCount,
  recentEntries,
  onManualCheckIn,
  smartMonitoring = {
    uniformCompliant: 0,
    uniformNonCompliant: 0,
    entryFlow: 0,
    exitFlow: 0,
  },
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'stream' | 'telemetry' | 'summary'>('stream');

  // Rate calculation
  const attendanceRate = totalStudents > 0 ? Math.round((totalPresentToday / totalStudents) * 100) : 0;
  const onTimeCount = Math.max(0, totalPresentToday - lateCount);

  // Filtered live entries
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return recentEntries;
    const q = searchQuery.toLowerCase().trim();
    return recentEntries.filter(
      (e) =>
        e.studentName.toLowerCase().includes(q) ||
        (e.studentId && e.studentId.toLowerCase().includes(q)) ||
        (e.className && e.className.toLowerCase().includes(q))
    );
  }, [recentEntries, searchQuery]);

  return (
    <div className="h-full flex flex-col bg-card/60 backdrop-blur-2xl border-l border-border/70 overflow-hidden select-none">
      {/* Top Header & Radial Progress */}
      <div className="p-4 border-b border-border/60 bg-card/40 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-primary/15 text-primary">
              <Activity className="h-4 w-4 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>
                Gate Intelligence
              </h3>
              <p className="text-[11px] text-muted-foreground">Live Telemetry & Logs</p>
            </div>
          </div>
          <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px] font-bold border-primary/30 text-primary bg-primary/10">
            {attendanceRate}% Present
          </Badge>
        </div>

        {/* Circular / Progress Metric Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-primary" /> Campus Inflow
            </span>
            <span className="font-bold text-foreground">
              {totalPresentToday} <span className="text-muted-foreground font-normal">/ {totalStudents || '—'}</span>
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-muted/60 overflow-hidden p-0.5 border border-border/40">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-primary transition-all duration-500 ease-out shadow-sm"
              style={{ width: `${Math.min(100, Math.max(5, attendanceRate))}%` }}
            />
          </div>
        </div>

        {/* 4 Core Metric Grid Cards */}
        <div className="grid grid-cols-4 gap-2 pt-1">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-center shadow-xs">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto mb-1" />
            <div className="text-base font-extrabold text-foreground">{onTimeCount}</div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">On Time</div>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2 text-center shadow-xs">
            <Clock className="h-4 w-4 text-amber-500 mx-auto mb-1" />
            <div className="text-base font-extrabold text-foreground">{lateCount}</div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Late</div>
          </div>

          <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-2 text-center shadow-xs">
            <ShieldCheck className="h-4 w-4 text-blue-500 mx-auto mb-1" />
            <div className="text-base font-extrabold text-foreground">{autoMarkedCount}</div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Auto AI</div>
          </div>

          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-2 text-center shadow-xs">
            <AlertTriangle className="h-4 w-4 text-red-500 mx-auto mb-1" />
            <div className="text-base font-extrabold text-foreground">{unknownCount}</div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">Stranger</div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="flex-1 flex flex-col min-h-0">
        <div className="px-3 pt-2">
          <TabsList className="grid grid-cols-3 w-full h-8 text-xs">
            <TabsTrigger value="stream" className="text-[11px] font-bold gap-1 py-1">
              <UserCheck className="h-3 w-3" /> Live Feed
            </TabsTrigger>
            <TabsTrigger value="telemetry" className="text-[11px] font-bold gap-1 py-1">
              <Sparkles className="h-3 w-3" /> AI Sensor
            </TabsTrigger>
            <TabsTrigger value="summary" className="text-[11px] font-bold gap-1 py-1">
              <History className="h-3 w-3" /> Traffic
            </TabsTrigger>
          </TabsList>
        </div>

        {/* TAB 1: LIVE FEED */}
        <TabsContent value="stream" className="flex-1 flex flex-col min-h-0 p-3 pt-2 space-y-2 mt-0">
          {/* Quick Search / Filter */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student, roll, or class..."
              className="h-8 pl-8 text-xs rounded-xl bg-background/50 border-border/60"
            />
          </div>

          {/* Timeline Stream */}
          <ScrollArea className="flex-1 rounded-xl border border-border/50 bg-background/30 p-2" data-lenis-prevent="true">
            <div className="space-y-2 pr-1">
              {filteredEntries.map((entry) => {
                const isRecognized = entry.isRecognized;
                const isLate = entry.isLate;

                return (
                  <div
                    key={entry.id}
                    className={`p-2.5 rounded-xl border transition-all flex items-center gap-2.5 ${
                      isRecognized
                        ? isLate
                          ? 'border-amber-500/40 bg-amber-500/5 hover:border-amber-500/60'
                          : 'border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60'
                        : 'border-red-500/40 bg-red-500/5 hover:border-red-500/60'
                    }`}
                  >
                    {/* Student Photo Thumbnail */}
                    <div className="relative h-10 w-10 rounded-xl overflow-hidden bg-muted/60 border border-border/50 flex-shrink-0 flex items-center justify-center">
                      {entry.photoUrl ? (
                        <img src={entry.photoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs font-black text-muted-foreground">
                          {entry.studentName.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <span
                        className={`absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full border border-background ${
                          isRecognized ? (isLate ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-red-500'
                        }`}
                      />
                    </div>

                    {/* Metadata */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-bold text-foreground truncate leading-tight">
                          {entry.studentName}
                        </p>
                        <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                          {new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                        {entry.className && (
                          <span className="font-semibold text-foreground/80">
                            Class {entry.className}{entry.section ? `-${entry.section}` : ''}
                          </span>
                        )}
                        {entry.confidence > 0 && (
                          <span className="font-mono text-emerald-500 font-bold">
                            {Math.round(entry.confidence * 100)}%
                          </span>
                        )}
                        <Badge
                          variant="outline"
                          className={`ml-auto text-[9px] px-1.5 py-0 rounded-full font-bold uppercase ${
                            isRecognized
                              ? isLate
                                ? 'border-amber-500/50 text-amber-500'
                                : 'border-emerald-500/50 text-emerald-500'
                              : 'border-red-500/50 text-red-500'
                          }`}
                        >
                          {isRecognized ? (isLate ? 'Late' : 'Present') : 'Unknown'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredEntries.length === 0 && (
                <div className="text-center py-12 text-muted-foreground space-y-1.5">
                  <UserCheck className="h-8 w-8 mx-auto opacity-30" />
                  <p className="text-xs font-bold">Waiting for Face Detections...</p>
                  <p className="text-[10px] opacity-70">Students detected at the camera will stream live here.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* TAB 2: AI TELEMETRY & UNIFORM SENSORS */}
        <TabsContent value="telemetry" className="flex-1 p-3 pt-2 space-y-3 mt-0 overflow-y-auto" data-lenis-prevent="true">
          <div className="rounded-2xl border border-border/60 bg-card/40 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-foreground">
              <span className="flex items-center gap-1.5 text-primary">
                <Shirt className="h-4 w-4" /> Uniform Compliance
              </span>
              <span className="font-mono">
                {smartMonitoring.uniformCompliant} / {smartMonitoring.uniformCompliant + smartMonitoring.uniformNonCompliant || 0}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{
                  width: `${
                    smartMonitoring.uniformCompliant + smartMonitoring.uniformNonCompliant > 0
                      ? Math.round(
                          (smartMonitoring.uniformCompliant /
                            (smartMonitoring.uniformCompliant + smartMonitoring.uniformNonCompliant)) *
                            100
                        )
                      : 100
                  }%`,
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span className="text-emerald-500 font-bold">{smartMonitoring.uniformCompliant} Compliant</span>
              <span className="text-rose-500 font-bold">{smartMonitoring.uniformNonCompliant} Mismatch</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-border/60 bg-card/40 p-3 text-center">
              <div className="flex items-center justify-center gap-1 text-emerald-500 text-xs font-bold mb-1">
                <ArrowDownRight className="h-4 w-4" /> Inflow Velocity
              </div>
              <div className="text-xl font-extrabold text-foreground">{smartMonitoring.entryFlow}</div>
              <div className="text-[10px] text-muted-foreground">Students / min</div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card/40 p-3 text-center">
              <div className="flex items-center justify-center gap-1 text-amber-500 text-xs font-bold mb-1">
                <ArrowUpRight className="h-4 w-4" /> Outflow Velocity
              </div>
              <div className="text-xl font-extrabold text-foreground">{smartMonitoring.exitFlow}</div>
              <div className="text-[10px] text-muted-foreground">Students / min</div>
            </div>
          </div>

          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
              <Sparkles className="h-4 w-4" /> Live AI Engine
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Multi-person face descriptor vectors and liveness metrics are indexed at 60 FPS. Verification occurs in sub-50ms with Euclidean distance threshold of 0.55.
            </p>
          </div>
        </TabsContent>

        {/* TAB 3: TRAFFIC & EXPORTS */}
        <TabsContent value="summary" className="flex-1 p-3 pt-2 space-y-3 mt-0 overflow-y-auto" data-lenis-prevent="true">
          <div className="rounded-2xl border border-border/60 bg-card/40 p-3 space-y-2.5">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-foreground">
              Session Traffic Breakdown
            </h4>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Total Verified Entries</span>
                <span className="font-bold text-foreground">{recentEntries.filter((e) => e.isRecognized).length}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">On-Time Arrivals</span>
                <span className="font-bold text-emerald-500">{onTimeCount}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Late Arrivals</span>
                <span className="font-bold text-amber-500">{lateCount}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Unregistered / Strangers</span>
                <span className="font-bold text-rose-500">{unknownCount}</span>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GateStatsOverlay;

