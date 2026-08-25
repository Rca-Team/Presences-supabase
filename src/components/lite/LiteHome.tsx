import React from 'react';
import { Link } from 'react-router-dom';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import { Button } from '@/components/ui/button';
import {
  Scan, QrCode, DoorOpen, BarChart3, Users, Shield,
  Feather, ArrowRight, Zap,
} from 'lucide-react';

/**
 * LiteHome
 * --------
 * Text-first home screen for the Lite app: no hero animations, no blur layers,
 * no images. Loads instantly on 2G/3G and low-RAM Android devices.
 */
const quickLinks = [
  { to: '/attendance', icon: Scan, label: 'Take Attendance', desc: 'Face or QR — non-stop mode' },
  { to: '/attendance', icon: QrCode, label: 'QR Scanner', desc: 'Fastest on slow devices' },
  { to: '/gate-mode', icon: DoorOpen, label: 'Gate Mode', desc: 'Entry & exit logging' },
  { to: '/admin', icon: BarChart3, label: 'Admin & Reports', desc: 'Records, exports, settings' },
  { to: '/register', icon: Users, label: 'Register Student', desc: 'Add a new face profile' },
  { to: '/profile', icon: Shield, label: 'My Profile', desc: 'Account & preferences' },
];

const LiteHome: React.FC = () => {
  const { setPreference, signals } = usePerformanceMode();

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Presences AI</h1>
            <p className="text-xs text-muted-foreground">Lite app · fast on any device</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">
            <Feather className="w-3 h-3" /> Lite
          </span>
        </header>

        <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <Zap className="w-3.5 h-3.5 text-primary" /> Optimized view
          </span>
          <span className="ml-1">
            Animations and heavy graphics are off
            {signals.slowNetwork ? ` (network: ${signals.effectiveType})` : ''}.
          </span>
        </div>

        <nav className="grid gap-2">
          {quickLinks.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 active:bg-muted"
            >
              <span className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <l.icon className="w-4.5 h-4.5 text-primary" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-foreground">{l.label}</span>
                <span className="block text-[11px] text-muted-foreground truncate">{l.desc}</span>
              </span>
              <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </Link>
          ))}
        </nav>

        <div className="pt-2">
          <Button variant="outline" size="sm" className="w-full" onClick={() => setPreference('off')}>
            Switch to full app
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LiteHome;
