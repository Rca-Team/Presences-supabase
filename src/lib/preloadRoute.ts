// Route chunk preloader — shares promises with the React.lazy importers
// so hovering / touching a nav link warms the chunk before the click lands.

type Importer = () => Promise<unknown>;

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
  '/parent': () => import('@/pages/ParentPortal'),
  '/unsubscribe': () => import('@/pages/Unsubscribe'),
  '/data': () => import('@/pages/DataBackup'),
};

const inflight: Record<string, Promise<unknown> | undefined> = {};

function shouldSkip(): boolean {
  try {
    const nav: any = navigator;
    if (nav?.connection?.saveData) return true;
    if (nav?.connection?.effectiveType === 'slow-2g' || nav?.connection?.effectiveType === '2g') return true;
    if (!navigator.onLine) return true;
  } catch {
    // ignore
  }
  return false;
}

/** Preload a route's JS chunk. Safe to call many times — dedup'd. */
export function preloadRoute(path: string): void {
  if (shouldSkip()) return;
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
  if (shouldSkip()) return;
  const run = () => paths.forEach((p) => preloadRoute(p));
  const w: any = window;
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(run, { timeout: 2000 });
  } else {
    window.setTimeout(run, 800);
  }
}
