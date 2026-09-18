import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, LayoutGroup } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Logo from './Logo';
import { useIsMobile } from '@/hooks/use-mobile';
import { 
  Sun, 
  Moon, 
  Home, 
  User, 
  UserPlus, 
  ScanLine, 
  DoorOpen, 
  LayoutDashboard, 
  GraduationCap, 
  BookOpen,
  LayoutGrid,
  QrCode
} from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/integrations/supabase/client';
import ProfileDropdown from './ProfileDropdown';
import { useUserRole } from '@/hooks/useUserRole';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import LiteModeToggle from './LiteModeToggle';

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const location = useLocation();
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();
  const { isAdminOrPrincipal, isTeacher, isGuard } = useUserRole();
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
    { text: 'Home', path: '/', icon: Home, show: !isAuthenticated || (!isTeacher || isAdminOrPrincipal) },
    { text: 'Parent Portal', path: '/parent', icon: GraduationCap, show: !isAuthenticated },
    { text: 'Teacher Portal', path: '/teacher', icon: BookOpen, show: isAuthenticated && (isTeacher || isAdminOrPrincipal) },
    { text: 'Guard Scanner', path: '/guard', icon: QrCode, show: isAuthenticated && (isGuard || isAdminOrPrincipal) },
    { text: 'Widgets', path: '/widgets', icon: LayoutGrid, show: true },
    { text: 'Profile', path: '/profile', icon: User, show: isAuthenticated },
    { text: 'Register', path: '/register', icon: UserPlus, show: isAuthenticated },
    { text: 'Attendance', path: '/attendance', icon: ScanLine, show: isAuthenticated },
    { text: 'Gate Mode', path: '/gate', icon: DoorOpen, show: isAdminOrPrincipal || isTeacher },
    { text: 'Admin', path: '/admin', icon: LayoutDashboard, show: isAdminOrPrincipal },
  ].filter((item) => item.show);

  return (
    <header 
      className={cn(
        "fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 md:px-8 py-3 transition-all duration-300",
        isScrolled 
          ? "backdrop-blur-xl bg-background/70 dark:bg-slate-950/70 shadow-sm border-b border-border/40 dark:border-white/10" 
          : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <Link
          to={isAuthenticated && isTeacher && !isAdminOrPrincipal ? "/teacher" : "/"}
          className="animate-ios-bounce shrink-0"
          onClick={() => haptic('selection')}
        >
          <Logo />
        </Link>
        
        {/* Desktop Navigation Dock with Apple Floating Capsule */}
        <LayoutGroup id="navbar-dock-tabs">
          <nav
            onMouseLeave={() => setHoveredPath(null)}
            className="hidden md:flex items-center gap-1 rounded-full p-1.5 backdrop-blur-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.45)] relative"
          >
            {/* Soft inner top specular highlight */}
            <span className="pointer-events-none absolute inset-x-6 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/70 dark:via-white/20 to-transparent" />

            {navLinks.map((item) => {
              const active = isActive(item.path);
              const hovered = hoveredPath === item.path;
              const Icon = item.icon;

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
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35, mass: 0.5 }}
                  className="relative select-none"
                >
                  <Link
                    to={item.path}
                    onClick={() => haptic('selection')}
                    className={cn(
                      "relative flex items-center gap-2 px-4 py-2 rounded-full text-[13.5px] font-medium transition-colors duration-200",
                      active
                        ? "text-white font-semibold"
                        : "text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                    )}
                  >
                    {/* Hover ghost highlight */}
                    {hovered && !active && (
                      <motion.div
                        layoutId="navbar-hover-pill"
                        className="absolute inset-0 rounded-full bg-slate-900/[0.05] dark:bg-white/[0.08] backdrop-blur-md border border-slate-900/[0.04] dark:border-white/[0.06]"
                        transition={{ type: "spring", stiffness: 500, damping: 35, mass: 0.5 }}
                      />
                    )}

                    {/* Apple iOS Fluid Active Sliding Pill */}
                    {active && (
                      <motion.div
                        layoutId="navbar-active-pill"
                        className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 shadow-md shadow-indigo-600/30 border border-white/25 dark:border-white/20"
                        transition={{
                          type: "spring",
                          stiffness: 450,
                          damping: 32,
                          mass: 0.6,
                        }}
                      >
                        {/* Soft inner specular reflection */}
                        <span className="pointer-events-none absolute inset-x-3 top-0 h-[1px] rounded-full bg-gradient-to-r from-transparent via-white/80 to-transparent" />
                      </motion.div>
                    )}

                    <span className="relative z-10 flex items-center gap-1.5">
                      <Icon className={cn("w-3.5 h-3.5 transition-transform duration-200", active ? "opacity-100" : "opacity-70")} />
                      <span>{item.text === 'Admin' && isTeacher && !isAdminOrPrincipal ? 'Teacher' : item.text}</span>
                    </span>
                  </Link>
                </motion.div>
              );
            })}
          </nav>
        </LayoutGroup>
        
        {/* Auth section - Only show on desktop */}
        <div className="hidden md:flex items-center gap-2.5 animate-fade-in shrink-0">
          <LiteModeToggle variant="badge" />
          <Toggle 
            pressed={theme === 'dark'} 
            onPressedChange={toggleTheme}
            aria-label="Toggle theme"
            className="relative w-10 h-10 rounded-full liquid-glass-surface hover:bg-accent/70 hover:scale-105 active:scale-95 border border-slate-200/80 dark:border-white/10"
            style={{ transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
          >
            {theme === 'dark' ? (
              <Moon className="h-4 w-4 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-ios-purple" />
            ) : (
              <Sun className="h-4 w-4 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-ios-orange animate-pulse-subtle" />
            )}
          </Toggle>
          {isAuthenticated ? (
            <ProfileDropdown />
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login" onClick={() => haptic('selection')}>
                <Button variant="ghost" size="sm" className="rounded-full px-4 text-xs font-medium">
                  Sign In
                </Button>
              </Link>
              <Link to="/signup" onClick={() => haptic('selection')}>
                <Button
                  size="sm"
                  className="rounded-full px-4 text-xs font-medium text-foreground liquid-glass-surface border-border/70 hover:brightness-105"
                  style={{
                    boxShadow: '0 8px 18px -10px hsl(var(--primary) / 0.5)'
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
