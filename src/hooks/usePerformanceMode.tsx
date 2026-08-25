import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

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
  setPreference: (p: LitePref) => void;
  toggleLite: () => void;
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
  setPreference: () => undefined,
  toggleLite: () => undefined,
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

  const setPreference = useCallback((p: LitePref) => {
    setPrefState(p);
    try { localStorage.setItem(STORAGE_KEY, p); } catch {}
  }, []);

  const toggleLite = useCallback(() => {
    setPreference(liteMode ? 'off' : 'on');
  }, [liteMode, setPreference]);

  const value = useMemo(
    () => ({ liteMode, preference, signals, setPreference, toggleLite }),
    [liteMode, preference, signals, setPreference, toggleLite],
  );

  return <PerformanceModeContext.Provider value={value}>{children}</PerformanceModeContext.Provider>;
};

export function usePerformanceMode() {
  return useContext(PerformanceModeContext);
}
