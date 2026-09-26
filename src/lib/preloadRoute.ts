// Route chunk preloader — shares promises with the React.lazy importers
// so hovering / touching a nav link warms the chunk before the click lands.

type Importer = () => Promise<unknown>;

interface NavigatorWithConnection extends Navigator {
  connection?: {
    saveData?: boolean;
    effectiveType?: string;
  };
  deviceMemory?: number;
}

interface IdleWindow extends Window {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
}

const importers: Record<string, Importer> = {
  '/': () => import('@/pages/Index'),
  '/login': () => import('@/pages/Login'),
  '/signup': () => import('@/pages/Signup'),
  '/contact': () => import('@/pages/Contact'),
  '/register': () => import('@/pages/Register'),
  '/portfolio': () => import('@/pages/Portfolio'),
  '/attendance': () => import('@/pages/Attendance'),
  '/user': () => import('@/pages/Attendance'),
  '/admin': () => import('@/pages/Admin'),
  '/teacher': () => import('@/pages/TeacherPortal'),
  '/notifications': () => import('@/pages/NotificationDemo'),
  '/profile': () => import('@/pages/Profile'),
  '/features': () => import('@/pages/Features'),
  '/gate': () => import('@/pages/GateMode'),
  '/guard': () => import('@/pages/GuardScanner'),
  '/parent': () => import('@/pages/ParentPortal'),
  '/unsubscribe': () => import('@/pages/Unsubscribe'),
  '/data': () => import('@/pages/DataBackup'),
  '/jarvis': () => import('@/pages/Jarvis'),
};

const inflight: Record<string, Promise<unknown> | undefined> = {};

function shouldSkipIntent(): boolean {
  try {
    const nav = navigator as NavigatorWithConnection;
    if (nav?.connection?.saveData) return true;
    if (!navigator.onLine) return true;
    if (document.visibilityState !== 'visible') return true;
  } catch {
    // ignore
  }
  return false;
}

function shouldSkipBackgroundWarm(): boolean {
  if (shouldSkipIntent()) return true;
  try {
    const nav = navigator as NavigatorWithConnection;
    if (['slow-2g', '2g', '3g'].includes(nav?.connection?.effectiveType ?? '')) return true;
    // Preloading a face-recognition route can allocate hundreds of MB. Keep
    // interaction responsive on modest phones and shared classroom hardware.
    if (typeof nav?.deviceMemory === 'number' && nav.deviceMemory <= 4) return true;
    if (typeof nav?.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4) return true;
  } catch {
    // ignore
  }
  return false;
}

/** Preload a route's JS chunk. Safe to call many times — dedup'd. */
export function preloadRoute(path: string): void {
  if (shouldSkipIntent()) return;
  const key = path.split('?')[0].split('#')[0];
  const importer = importers[key];
  if (!importer) return;
  if (inflight[key]) return;
  try {
    inflight[key] = importer().catch(() => {
      // let it retry on next hover
      inflight[key] = undefined;
    });
  } catch {
    inflight[key] = undefined;
  }
}

/** Warm the most common routes when the browser is idle. */
export function warmCommonRoutes(paths: string[]): void {
  if (shouldSkipBackgroundWarm()) return;
  const queue = Array.from(new Set(paths)).slice(0, 3);
  const w = window as IdleWindow;

  const scheduleNext = () => {
    if (shouldSkipBackgroundWarm() || queue.length === 0) return;
    const run = () => {
      const next = queue.shift();
      if (next) preloadRoute(next);
      if (queue.length > 0) scheduleNext();
    };

    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(run, { timeout: 3500 });
    } else {
      window.setTimeout(run, 1400);
    }
  };

  scheduleNext();
}
