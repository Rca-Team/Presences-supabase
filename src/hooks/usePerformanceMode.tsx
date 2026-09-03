import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { playModeSwitchSound } from '@/utils/audioFeedback';
import ModeSwitchTransitionHUD from '@/components/ModeSwitchTransitionHUD';

type LitePref = 'auto' | 'on' | 'off';
const STORAGE_KEY = 'presences:lite-mode';

interface PerfSignals {
  saveData: boolean;
  slowNetwork: boolean;
  effectiveType: string;
  downlink: number;
  lowMemory: boolean;
  lowCPU: boolean;
  reducedMotion: boolean;
}

interface PerformanceModeContextValue {
  liteMode: boolean;
  preference: LitePref;
  signals: PerfSignals;
  isTransitioning: boolean;
  targetMode: 'lite' | 'standard' | null;
  setPreference: (p: LitePref) => void;
  toggleLite: () => void;
  dismissTransition: () => void;
}

const defaultSignals: PerfSignals = {
  saveData: false,
  slowNetwork: false,
  effectiveType: '4g',
  downlink: 10,
  lowMemory: false,
  lowCPU: false,
  reducedMotion: false,
};

const PerformanceModeContext = createContext<PerformanceModeContextValue>({
  liteMode: false,
  preference: 'auto',
  signals: defaultSignals,
  isTransitioning: false,
  targetMode: null,
  setPreference: () => undefined,
  toggleLite: () => undefined,
  dismissTransition: () => undefined,
});

function readSignals(): PerfSignals {
  if (typeof window === 'undefined') return defaultSignals;
  const nav = navigator as any;
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  const effectiveType: string = conn?.effectiveType ?? '4g';
  const downlink: number = typeof conn?.downlink === 'number' ? conn.downlink : 10;
  const saveData: boolean = !!conn?.saveData;
  const slowNetwork = saveData || effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g' || downlink < 1.5;
  const deviceMemory: number = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 8;
  const cpu: number = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 8;
  const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    saveData,
    slowNetwork,
    effectiveType,
    downlink,
    lowMemory: deviceMemory <= 2,
    lowCPU: cpu <= 4,
    reducedMotion,
  };
}

function shouldAutoEnable(s: PerfSignals): boolean {
  return s.saveData || s.slowNetwork || s.lowMemory || (s.lowCPU && s.reducedMotion);
}

export const PerformanceModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPrefState] = useState<LitePref>(() => {
    if (typeof window === 'undefined') return 'auto';
    try {
      // Lite app shortcut / installed Lite PWA launches with ?lite=1
      const param = new URLSearchParams(window.location.search).get('lite');
      if (param === '1' || param === 'true') {
        localStorage.setItem(STORAGE_KEY, 'on');
        return 'on';
      }
      if (param === '0' || param === 'false') {
        localStorage.setItem(STORAGE_KEY, 'off');
        return 'off';
      }
      const stored = localStorage.getItem(STORAGE_KEY) as LitePref | null;
      if (stored === 'on' || stored === 'off' || stored === 'auto') return stored;
    } catch {}
    return 'auto';
  });
  const [signals, setSignals] = useState<PerfSignals>(() => readSignals());

  useEffect(() => {
    const update = () => setSignals(readSignals());
    const nav = navigator as any;
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    conn?.addEventListener?.('change', update);
    const mm = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    mm?.addEventListener?.('change', update);
    return () => {
      conn?.removeEventListener?.('change', update);
      mm?.removeEventListener?.('change', update);
    };
  }, []);

  const liteMode = useMemo(() => {
    if (preference === 'on') return true;
    if (preference === 'off') return false;
    return shouldAutoEnable(signals);
  }, [preference, signals]);

  useEffect(() => {
    const root = document.documentElement;
    if (liteMode) root.classList.add('lite-mode');
    else root.classList.remove('lite-mode');
  }, [liteMode]);

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [targetMode, setTargetMode] = useState<'lite' | 'standard' | null>(null);

  const dismissTransition = useCallback(() => {
    setIsTransitioning(false);
  }, []);

  const setPreference = useCallback((p: LitePref) => {
    setPrefState(p);
    try { localStorage.setItem(STORAGE_KEY, p); } catch {}

    const nextIsLite = p === 'on' || (p === 'auto' && shouldAutoEnable(signals));
    const nextTarget: 'lite' | 'standard' = nextIsLite ? 'lite' : 'standard';

    setTargetMode(nextTarget);
    setIsTransitioning(true);
    playModeSwitchSound(nextTarget);
  }, [signals]);

  const toggleLite = useCallback(() => {
    const nextMode = liteMode ? 'off' : 'on';
    setPreference(nextMode);
  }, [liteMode, setPreference]);

  const value = useMemo(
    () => ({
      liteMode,
      preference,
      signals,
      isTransitioning,
      targetMode,
      setPreference,
      toggleLite,
      dismissTransition,
    }),
    [liteMode, preference, signals, isTransitioning, targetMode, setPreference, toggleLite, dismissTransition],
  );

  return (
    <PerformanceModeContext.Provider value={value}>
      {children}
      <ModeSwitchTransitionHUD
        show={isTransitioning}
        targetMode={targetMode}
        onDismiss={dismissTransition}
      />
    </PerformanceModeContext.Provider>
  );
};

export function usePerformanceMode() {
  return useContext(PerformanceModeContext);
}
