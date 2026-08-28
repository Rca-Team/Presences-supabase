import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, LayoutGroup } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Logo from './Logo';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sun, Moon } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/integrations/supabase/client';
import ProfileDropdown from './ProfileDropdown';
import { useUserRole } from '@/hooks/useUserRole';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const location = useLocation();
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();
  const { isAdminOrPrincipal, isTeacher } = useUserRole();
  const { trigger: haptic } = useHapticFeedback();
  
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const offset = window.scrollY;
          setIsScrolled((prev) => {
            const next = offset > 14;
            return prev !== next ? next : prev;
          });
          ticking = false;
        });
        ticking = true;
      }
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const isActive = (path: string) => location.pathname === path;

  const toggleTheme = () => {
    haptic('selection');
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const navLinks = [
    { text: 'Home', path: '/', show: true },
    { text: 'Parent Portal', path: '/parent', show: !isAuthenticated },
    { text: 'Profile', path: '/profile', show: isAuthenticated },
    { text: 'Register', path: '/register', show: isAuthenticated },
    { text: 'Attendance', path: '/attendance', show: isAuthenticated },
    { text: 'Gate Mode', path: '/gate', show: isAdminOrPrincipal || isTeacher },
    { text: 'Admin', path: '/admin', show: isAdminOrPrincipal || isTeacher },
  ].filter((item) => item.show);

  return (
    <header 
      className={cn(
        "fixed top-0 left-0 right-0 z-50 px-6 md:px-8 py-4",
        isScrolled 
          ? "premium-glass-navbar backdrop-blur-3xl shadow-lg border-b" 
          : "bg-transparent backdrop-blur-sm"
      )}
      style={{ transition: 'background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease, backdrop-filter 0.3s ease' }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link to="/" className="animate-ios-bounce" onClick={() => haptic('selection')}>
          <Logo />
        </Link>
        
        {/* Desktop Navigation Dock with Royal Neon Sliding Tabs */}
        <LayoutGroup id="navbar-dock-tabs">
          <nav
            onMouseLeave={() => setHoveredPath(null)}
            className="hidden md:flex items-center gap-1.5 animate-fade-in royal-neon-dock rounded-full p-1.5 shadow-2xl"
          >
            {navLinks.map((item) => {
              const active = isActive(item.path);
              const hovered = hoveredPath === item.path;

              return (
                <motion.div
                  key={item.path}
                  onMouseEnter={() => {
                    setHoveredPath(item.path);
                    import('@/lib/preloadRoute').then((m) => m.preloadRoute(item.path)).catch(() => undefined);
                  }}
                  onFocus={() => {
                    setHoveredPath(item.path);
                    import('@/lib/preloadRoute').then((m) => m.preloadRoute(item.path)).catch(() => undefined);
                  }}
                  whileHover={{ y: -1, scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.6 }}
                  className="relative select-none"
                >
                  <Link
                    to={item.path}
                    onClick={() => haptic('selection')}
                    className={cn(
                      "relative block px-5 py-2 rounded-full text-sm font-medium mobile-touch-target transition-colors duration-200",
                      active
                        ? "text-slate-900 dark:text-white font-bold"
                        : "text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                    )}
                  >
                    {/* Hover ghost highlight */}
                    {hovered && !active && (
                      <motion.div
                        layoutId="navbar-hover-pill"
                        className="absolute inset-0 rounded-full bg-slate-900/[0.05] dark:bg-white/[0.06] backdrop-blur-md border border-slate-900/[0.06] dark:border-white/[0.08]"
                        transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.5 }}
                      />
                    )}

                    {/* Minimal Clean Active Sliding Pill */}
                    {active && (
                      <motion.div
                        layoutId="navbar-active-pill"
                        className="absolute inset-0 rounded-full royal-neon-active-pill"
                        transition={{
                          type: "spring",
                          stiffness: 380,
                          damping: 30,
                          mass: 0.7,
                        }}
                      >
                        {/* Soft inner top reflection */}
                        <span className="pointer-events-none absolute inset-x-2.5 top-0 h-[1px] rounded-full bg-gradient-to-r from-transparent via-white/80 dark:via-white/50 to-transparent" />
                      </motion.div>
                    )}

                    <span className="relative z-10 flex items-center gap-1.5">
                      {item.text === 'Admin' && isTeacher && !isAdminOrPrincipal ? 'Teacher' : item.text}
                    </span>
                  </Link>
                </motion.div>
              );
            })}
          </nav>
        </LayoutGroup>
        
        {/* Auth section - Only show on desktop */}
        <div className="hidden md:flex items-center gap-3 animate-fade-in">
          <Toggle 
            pressed={theme === 'dark'} 
            onPressedChange={toggleTheme}
            aria-label="Toggle theme"
            className="relative w-11 h-11 rounded-full liquid-glass-surface hover:bg-accent/70 hover:scale-110 active:scale-95"
            style={{ transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
          >
            {theme === 'dark' ? (
              <Moon className="h-5 w-5 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-ios-purple" />
            ) : (
              <Sun className="h-5 w-5 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-ios-orange animate-pulse-subtle" />
            )}
          </Toggle>
          {isAuthenticated ? (
            <ProfileDropdown />
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login" onClick={() => haptic('selection')}>
                <Button variant="ghost" size="sm" className="rounded-full px-5">
                  Sign In
                </Button>
              </Link>
              <Link to="/signup" onClick={() => haptic('selection')}>
                <Button
                  size="sm"
                  className="rounded-full px-5 text-foreground liquid-glass-surface border-border/70 hover:brightness-105"
                  style={{
                    boxShadow: '0 10px 20px -14px hsl(var(--primary) / 0.55)'
                  }}
                >
                  Get Started
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
