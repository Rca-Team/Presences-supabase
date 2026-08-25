import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '@/hooks/use-theme';

/**
 * Lumina is the DARK-mode design language (deep-space navy + cyan).
 * Light mode keeps the original theme untouched, so both UIs coexist:
 *   light  -> previous design
 *   dark   -> new Lumina design
 */
const LUMINA_PATHS = new Set<string>([
  '/',
  '/attendance',
  '/user',
  '/admin',
  '/gate',
  '/gate-vision',
  '/features',
  '/parent',
  '/teacher',
  '/profile',
  '/register',
  '/contact',
  '/portfolio',
  '/login',
  '/signup',
]);

export function isLuminaPath(pathname: string) {
  return LUMINA_PATHS.has(pathname);
}

export default function LuminaScope() {
  const { pathname } = useLocation();
  const { theme } = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    const active = theme === 'dark' && LUMINA_PATHS.has(pathname);

    root.classList.toggle('lumina', active);

    return () => {
      root.classList.remove('lumina');
    };
  }, [pathname, theme]);

  return null;
}
