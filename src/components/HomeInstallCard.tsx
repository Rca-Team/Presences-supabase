import React, { useMemo, useState } from 'react';
import { Download, Feather, Share, Plus, Check, Smartphone, Apple, Monitor, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';

type Platform = 'ios' | 'android' | 'desktop';

/**
 * HomeInstallCard
 * ---------------
 * One-click app download straight from the home page. Detects the visitor's
 * platform (iOS / Android / desktop), pre-selects it, and offers both the full
 * experience and the low-graphics Lite app for each platform. The Lite choice
 * pins the performance preference before the browser install prompt appears, so
 * the installed app opens in Lite mode.
 */
const HomeInstallCard: React.FC = () => {
  const { install, isInstalled, isIOS, isInstallable } = usePWAInstall();
  const { setPreference } = usePerformanceMode();

  const detected: Platform = useMemo(() => {
    const ua = navigator.userAgent;
    if (isIOS || /iPad|iPhone|iPod/.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'desktop';
  }, [isIOS]);

  const [platform, setPlatform] = useState<Platform>(detected);
  const [done, setDone] = useState<'full' | 'lite' | null>(null);
  const [showManual, setShowManual] = useState(false);

  const handle = async (mode: 'full' | 'lite') => {
    setPreference(mode === 'lite' ? 'on' : 'off');
    setDone(null);
    if (platform === 'ios' || !isInstallable) {
      setShowManual(true);
      return;
    }
    const ok = await install();
    if (ok) setDone(mode);
    else setShowManual(true);
  };

  if (isInstalled) return null;

  const platforms: { key: Platform; label: string; icon: React.ElementType }[] = [
    { key: 'ios', label: 'iPhone / iPad', icon: Apple },
    { key: 'android', label: 'Android', icon: Smartphone },
    { key: 'desktop', label: 'Desktop', icon: Monitor },
  ];

  const manualSteps =
    platform === 'ios'
      ? [
          { icon: Share, text: 'Tap Share in Safari' },
          { icon: Plus, text: 'Choose “Add to Home Screen”' },
        ]
      : platform === 'android'
        ? [
            { icon: MoreVertical, text: 'Open the Chrome menu (⋮)' },
            { icon: Plus, text: 'Tap “Install app” / “Add to Home screen”' },
          ]
        : [
            { icon: Download, text: 'Click the install icon in the address bar' },
            { icon: Plus, text: 'Confirm “Install Presences”' },
          ];

  return (
    <section className="pb-14">
      <div className="liquid-glass-surface rounded-3xl p-6 md:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Download className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>
              Download the app
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Install Presences in one click on iPhone, Android or desktop. Pick the full app, or
              the Lite app built for slow networks, low-end phones and smart boards.
            </p>
          </div>
        </div>

        {/* Platform picker */}
        <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-md">
          {platforms.map((p) => {
            const active = platform === p.key;
            return (
              <button
                key={p.key}
                onClick={() => {
                  setPlatform(p.key);
                  setShowManual(false);
                  setDone(null);
                }}
                className={`rounded-xl border px-3 py-2 text-center text-xs font-medium transition-colors ${
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                <p.icon className="mx-auto mb-1 h-4 w-4" />
                {p.label}
                {p.key === detected && <span className="block text-[10px] opacity-70">your device</span>}
              </button>
            );
          })}
        </div>

        {/* Install actions */}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => void handle('full')} className="gap-2">
            {done === 'full' ? <Check className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            {done === 'full' ? 'Installed' : 'Install full app'}
          </Button>
          <Button variant="outline" onClick={() => void handle('lite')} className="gap-2">
            {done === 'lite' ? <Check className="h-4 w-4" /> : <Feather className="h-4 w-4" />}
            {done === 'lite' ? 'Lite installed' : 'Install Lite app'}
          </Button>
        </div>

        {showManual && !done && (
          <div className="mt-5 rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              Finish installing on {platforms.find((p) => p.key === platform)?.label}
            </p>
            <ol className="mt-2 space-y-1.5">
              {manualSteps.map((step, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span className="flex items-center gap-1">
                    <step.icon className="h-4 w-4 text-primary" /> {step.text}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs">Your app-mode choice is already saved for the installed app.</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default HomeInstallCard;
