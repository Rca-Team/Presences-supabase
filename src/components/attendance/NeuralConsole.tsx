import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, XCircle, ScanFace, Sparkles, User, Loader2 } from 'lucide-react';
import LiveAttendanceFeed from './LiveAttendanceFeed';
import { useScanTelemetry } from '@/services/face-recognition/ScanTelemetry';

/**
 * NeuralConsole — cinematic dark scan console (Presences AI "Lumina" language).
 * Wraps the face / loop scanners: camera stage on the left, live neural
 * inference column on the right. Dark-mode only by design (Lumina routes).
 */

interface LiveRecord {
  id: string;
  user_id: string | null;
  timestamp: string;
  status: string | null;
  confidence: number | null;
  image_url: string | null;
  device_info: any;
}

const nameOf = (r: LiveRecord) =>
  r.device_info?.metadata?.name || r.user_id?.slice(0, 8) || 'Unknown subject';

const confOf = (r: LiveRecord) => {
  const c = r.confidence ?? 0;
  const pct = c > 1 ? c : c * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
};

function useLiveRecognition() {
  const [records, setRecords] = useState<LiveRecord[]>([]);
  const [todayCount, setTodayCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    (async () => {
      const [{ data }, { count }] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('id,user_id,timestamp,status,confidence,image_url,device_info')
          .gte('timestamp', start.toISOString())
          .in('status', ['present', 'late', 'absent'])
          .order('timestamp', { ascending: false })
          .limit(12),
        supabase
          .from('attendance_records')
          .select('id', { count: 'exact', head: true })
          .gte('timestamp', start.toISOString())
          .in('status', ['present', 'late']),
      ]);
      if (!alive) return;
      if (data) setRecords(data as LiveRecord[]);
      setTodayCount(count ?? 0);
    })();

    const channel = supabase
      .channel('neural-console-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'attendance_records' },
        (payload) => {
          const rec = payload.new as LiveRecord;
          if (rec.status && ['present', 'late', 'absent'].includes(rec.status)) {
            setRecords((prev) => [rec, ...prev].slice(0, 12));
            if (rec.status !== 'absent') setTodayCount((c) => c + 1);
          }
        },
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const latest = records[0] ?? null;
  const avgConf = useMemo(() => {
    const vals = records.map(confOf).filter((v) => v > 0);
    if (!vals.length) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [records]);

  return { records, latest, avgConf, todayCount };
}


const ConfidenceRing: React.FC<{ value: number; active: boolean }> = ({ value, active }) => {
  const R = 74;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative mx-auto flex h-[186px] w-[186px] items-center justify-center">
      <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
        <circle cx="90" cy="90" r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" opacity="0.55" />
        <motion.circle
          cx="90"
          cy="90"
          r={R}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C - (C * value) / 100 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: 'drop-shadow(0 0 10px hsl(var(--primary) / 0.6))' }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="flex items-end justify-center gap-0.5">
          <span className="text-4xl font-bold tabular-nums text-foreground">{value}</span>
          <span className="mb-1.5 text-sm text-muted-foreground">%</span>
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Confidence
        </p>
      </div>
      {active && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-3 rounded-full border border-primary/25"
          animate={{ opacity: [0.15, 0.5, 0.15], scale: [0.98, 1.02, 0.98] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </div>
  );
};

const Panel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div
    className={`rounded-3xl border border-primary/10 bg-card/55 backdrop-blur-xl shadow-[0_24px_70px_-30px_hsl(230_50%_3%/0.8)] ${className}`}
  >
    {children}
  </div>
);

export interface NeuralConsoleProps {
  title: string;
  subtitle: string;
  cameraLabel?: string;
  statusText?: string;
  badge?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const NeuralConsole: React.FC<NeuralConsoleProps> = ({
  title,
  subtitle,
  cameraLabel = 'CAM · SCAN STATION',
  statusText = 'Analyzing…',
  badge = 'REC · LIVE',
  children,
  footer,
}) => {
  const { records, latest, avgConf, todayCount } = useLiveRecognition();
  const live = useScanTelemetry();
  const confidence = live.confidence || (latest ? confOf(latest) : 0);
  const liveStatus = live.phase === 'idle' ? statusText : live.statusText;
  const subjectName = live.subjectName ?? (latest ? nameOf(latest) : undefined);
  const subjectMeta =
    live.subjectMeta ??
    (latest
      ? `${latest.device_info?.metadata?.class ?? 'Student'} · ${new Date(latest.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : undefined);
  const subjectImage = live.subjectImage ?? (latest?.image_url ?? undefined);


  return (
    <div className="grid gap-4 lg:grid-cols-[1.65fr_1fr]">
      {/* ---------- Camera stage ---------- */}
      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-primary/10 px-4 py-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1">
            <motion.span
              className="h-1.5 w-1.5 rounded-full bg-destructive"
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              {badge}
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {cameraLabel}
          </span>
        </div>

        <div className="relative p-3 sm:p-4">
          {/* corner brackets */}
          {[
            'left-5 top-5 border-l-2 border-t-2 rounded-tl-xl',
            'right-5 top-5 border-r-2 border-t-2 rounded-tr-xl',
            'left-5 bottom-5 border-l-2 border-b-2 rounded-bl-xl',
            'right-5 bottom-5 border-r-2 border-b-2 rounded-br-xl',
          ].map((cls) => (
            <span
              key={cls}
              aria-hidden
              className={`pointer-events-none absolute z-20 h-7 w-7 border-primary/60 ${cls}`}
            />
          ))}
          <div className="relative z-10 overflow-hidden rounded-2xl">{children}</div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-primary/10 px-4 py-3">
          <div className="inline-flex items-center gap-2 rounded-xl border border-primary/15 bg-background/40 px-3 py-1.5">
            <ScanFace className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] text-muted-foreground">
              Status: <span className="font-semibold text-primary">{liveStatus}</span>
              {live.facesInFrame > 0 && (
                <span className="ml-2 text-primary/80">· {live.facesInFrame} in frame</span>
              )}

            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            engine v3.1 · anti-spoof on
          </span>
        </div>
        {footer && <div className="border-t border-primary/10 px-4 py-3">{footer}</div>}
      </Panel>

      {/* ---------- Neural inference column ---------- */}
      <div className="space-y-4">
        <Panel className="p-4">
          <div className="mb-2 flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              <p className="text-[11px] text-muted-foreground">{subtitle}</p>
            </div>
            <ScanFace className="h-4 w-4 text-primary/70" />
          </div>
          <ConfidenceRing value={confidence} active={live.phase === 'analyzing' || live.phase === 'searching'} />
          <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-primary/10 bg-background/40 px-3 py-2.5">
            {live.phase === 'matched' || (live.phase === 'idle' && latest) ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                <span className="text-[11px] text-muted-foreground">
                  {live.phase === 'matched' ? liveStatus : 'Last inference locked'}
                </span>
              </>
            ) : live.phase === 'unknown' ? (
              <>
                <XCircle className="h-3.5 w-3.5 text-destructive" />
                <span className="text-[11px] text-muted-foreground">No identity match — hold still</span>
              </>
            ) : (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span className="text-[11px] text-muted-foreground">{liveStatus}</span>
              </>
            )}
          </div>
        </Panel>


        <Panel className="p-4">
          <p className="mb-3 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            <User className="h-3 w-3" /> Identity
          </p>
          <AnimatePresence mode="wait">
            <motion.div
              key={subjectName ?? 'idle'}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 overflow-hidden rounded-full border border-primary/25 bg-primary/15">
                  {subjectImage?.startsWith('http') || subjectImage?.startsWith('data:') ? (
                    <img src={subjectImage} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {subjectName ?? (live.phase === 'unknown' ? 'Unrecognised face' : 'Awaiting subject')}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {subjectMeta ?? (live.facesInFrame > 0 ? 'Face in frame — matching' : 'No identity in frame')}
                  </p>
                  {subjectName && (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-success">
                      <CheckCircle2 className="h-3 w-3" />
                      {live.phase === 'matched' ? 'Identity locked' : latest?.status === 'late' ? 'Marked late' : 'Cleared for entry'}
                    </p>
                  )}
                </div>
              </div>

            </motion.div>
          </AnimatePresence>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { v: todayCount ? `${todayCount}` : '—', l: 'Scans today' },
              { v: avgConf ? `${avgConf}%` : '—', l: 'Avg conf' },
              { v: `${live.sessionCount}`, l: 'Session' },

            ].map((s) => (
              <div
                key={s.l}
                className="rounded-2xl border border-primary/10 bg-background/40 px-2 py-2 text-center"
              >
                <p className="text-sm font-bold text-primary tabular-nums">{s.v}</p>
                <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{s.l}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-4 max-h-[380px] overflow-hidden">
          <LiveAttendanceFeed />
        </Panel>
      </div>
    </div>
  );
};

export default NeuralConsole;
