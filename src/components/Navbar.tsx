
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
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

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const location = useLocation();
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();
  const { isAdminOrPrincipal, isTeacher, isLoading: isRoleLoading } = useUserRole();
  
  useEffect(() => {
    const handleScroll = () => {
      const offset = window.scrollY;
      setIsScrolled(offset > 10);
    };
    
    window.addEventListener('scroll', handleScroll);
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
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header 
      className={cn(
        "fixed top-0 left-0 right-0 z-50 px-6 md:px-8 py-4",
        isScrolled 
          ? "premium-glass-navbar backdrop-blur-3xl shadow-lg border-b" 
          : "bg-transparent backdrop-blur-sm"
      )}
      style={{ transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link to="/" className="animate-ios-bounce">
          <Logo />
        </Link>
        
        {/* Desktop Navigation - Hidden on Mobile */}
        <LayoutGroup>
          <nav className="hidden md:flex items-center gap-1 animate-fade-in macbook-dock rounded-full p-1.5">
            {[
              { text: 'Home', path: '/', show: true },
              { text: 'Parent Portal', path: '/parent', show: !isAuthenticated },
              { text: 'Profile', path: '/profile', show: isAuthenticated },
              { text: 'Register', path: '/register', show: isAuthenticated },
              { text: 'Attendance', path: '/attendance', show: isAuthenticated },
              { text: 'Gate Mode', path: '/gate', show: isAdminOrPrincipal || isTeacher },
              { text: 'Admin', path: '/admin', show: isAdminOrPrincipal || isTeacher },
            ].filter(item => item.show).map((item) => (
              <motion.div
                key={item.path}
                whileHover={{ y: -1, scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.7 }}
                className="relative"
              >
                <Link
                  to={item.path}
                  onMouseEnter={() => import('@/lib/preloadRoute').then(m => m.preloadRoute(item.path)).catch(() => undefined)}
                  onFocus={() => import('@/lib/preloadRoute').then(m => m.preloadRoute(item.path)).catch(() => undefined)}
                  className={cn(
                    "relative block px-5 py-2.5 rounded-full text-sm font-medium mobile-touch-target",
                    isActive(item.path)
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  style={{ transition: 'color 0.28s cubic-bezier(0.4,0,0.2,1)' }}
                >
                  {isActive(item.path) && (
                      <motion.div
                      layoutId="navbar-active-pill"
                        className="absolute inset-0 rounded-full"
                        style={{
                          background: 'linear-gradient(150deg, hsl(var(--card) / 0.8), hsl(var(--card) / 0.45))',
                          border: '1px solid hsl(var(--primary) / 0.22)',
                          boxShadow: '0 10px 20px -14px hsl(var(--primary) / 0.55), inset 0 1px 0 hsl(var(--foreground) / 0.14)'
                        }}
                      transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.9 }}
                    />
                  )}
                  <span className="relative z-10">
                    {item.text === 'Admin' && isTeacher && !isAdminOrPrincipal ? 'Teacher' : item.text}
                  </span>
                </Link>
              </motion.div>
            ))}

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
              <Link to="/login">
                <Button variant="ghost" size="sm" className="rounded-full px-5">
                  Sign In
                </Button>
              </Link>
              <Link to="/signup">
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
