import React, { Suspense, lazy, useState } from 'react';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import { Button } from '@/components/ui/button';
import { Feather, CalendarDays, Users, Download, Settings, Loader2 } from 'lucide-react';

const AttendanceCalendar = lazy(() => import('@/components/admin/AttendanceCalendar'));
const StudentDetailsTable = lazy(() => import('@/components/admin/StudentDetailsTable'));
const AttendanceExport = lazy(() => import('@/components/admin/AttendanceExport'));
const AttendanceCutoffSetting = lazy(() => import('@/components/admin/AttendanceCutoffSetting'));

type LiteTab = 'records' | 'students' | 'export' | 'settings';

const TABS: { id: LiteTab; label: string; icon: React.ElementType }[] = [
  { id: 'records', label: 'Records', icon: CalendarDays },
  { id: 'students', label: 'Students', icon: Users },
  { id: 'export', label: 'Export', icon: Download },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface Props {
  stats?: { totalFaces: number; presentToday: number; lateToday: number; todayAttendance: number };
}

/**
 * LiteAdmin
 * ---------
 * Minimal admin surface for the Lite app: four essential sections, lazy-loaded
 * one at a time, no sidebar animations, no dashboards or charts.
 */
const LiteAdmin: React.FC<Props> = ({ stats }) => {
  const { setPreference } = usePerformanceMode();
  const [tab, setTab] = useState<LiteTab>('records');

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="max-w-4xl mx-auto px-3 py-4 space-y-3">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">Admin</h1>
            <p className="text-xs text-muted-foreground">Lite mode · essentials only</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">
            <Feather className="w-3 h-3" /> Lite
          </span>
        </header>

        {stats && (
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Students', value: stats.totalFaces },
              { label: 'Present', value: stats.presentToday },
              { label: 'Late', value: stats.lateToday },
              { label: 'Marked', value: stats.todayAttendance },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-card p-2 text-center">
                <div className="text-base font-bold text-foreground">{s.value}</div>
                <div className="text-[10px] text-muted-foreground uppercase">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-4 gap-1 rounded-xl border border-border bg-card p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[11px] ${
                tab === t.id ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        <Suspense
          fallback={
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…
            </div>
          }
        >
          {tab === 'records' && <AttendanceCalendar selectedFaceId={null} />}
          {tab === 'students' && <StudentDetailsTable />}
          {tab === 'export' && <AttendanceExport />}
          {tab === 'settings' && <AttendanceCutoffSetting />}
        </Suspense>

        <Button variant="outline" size="sm" className="w-full" onClick={() => setPreference('off')}>
          Switch to full admin
        </Button>
      </div>
    </div>
  );
};

export default LiteAdmin;
