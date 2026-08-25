import React, { useState, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  Home,
  UserPlus,
  Clock,
  User,
  ShieldCheck,
  Sun,
  Moon,
  UserCircle,
  GraduationCap,
  LogOut,
  Scan,
  ChevronRight,
  Compass,
} from 'lucide-react';
import Logo from './Logo';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

const navColors: Record<string, string> = {
  Home: 'ios-blue',
  'Parent Portal': 'ios-green',
  Profile: 'ios-pink',
  Register: 'ios-green',
  Attendance: 'ios-purple',
  'Gate Mode': 'ios-orange',
  Admin: 'ios-red',
  Teacher: 'ios-orange',
};

const MobileSidebar = () => {
  const db = supabase as any;
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const { isAdminOrPrincipal, isTeacher } = useUserRole();
  const { toast } = useToast();
  const haptic = useHapticFeedback();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await db
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (!error && data) setProfile(data);
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      haptic.onSuccess();
      setOpen(false);
      toast({ title: 'Logged out', description: 'You have been successfully logged out.' });
      navigate('/');
    } catch {
      toast({ title: 'Error', description: 'Failed to log out.', variant: 'destructive' });
    }
  };

  const navigation = useMemo(() => {
    const items = [
      { name: 'Home', path: '/', icon: Home, show: true },
      { name: 'Parent Portal', path: '/parent', icon: GraduationCap, show: !user },
      { name: 'Profile', path: '/profile', icon: User, show: !!user },
      { name: 'Register', path: '/register', icon: UserPlus, show: !!user },
      { name: 'Attendance', path: '/attendance', icon: Clock, show: !!user },
      { name: 'Gate Mode', path: '/gate', icon: Scan, show: isAdminOrPrincipal || isTeacher },
      {
        name: isTeacher && !isAdminOrPrincipal ? 'Teacher' : 'Admin',
        path: '/admin',
        icon: isTeacher && !isAdminOrPrincipal ? GraduationCap : ShieldCheck,
        show: isAdminOrPrincipal || isTeacher,
      },
    ];
    return items.filter((i) => i.show);
  }, [isAdminOrPrincipal, isTeacher, user]);

  if (!isMobile) return null;

  const isActive = (path: string) => location.pathname === path;
  const toggleTheme = () => { haptic.onSelection(); setTheme(theme === 'dark' ? 'light' : 'dark'); };
  const displayName =
    profile?.display_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        {/* ── Floating glass FAB ── */}
        <SheetTrigger asChild>
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          >
            <button
              onClick={() => haptic.onButtonPress()}
              className={cn(
                'relative h-[58px] w-[58px] rounded-full',
                'flex items-center justify-center',
                'bg-white/50 dark:bg-white/[0.08]',
                'backdrop-blur-2xl backdrop-saturate-[1.8]',
                'border border-white/40 dark:border-white/[0.12]',
                'shadow-[0_4px_24px_-4px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.5)]',
                'dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)]',
                'active:scale-90 transition-transform duration-200'
              )}
            >
              <Compass className="h-6 w-6 text-foreground/80" strokeWidth={1.8} />

              {/* Subtle glow ring */}
              <span className="absolute inset-0 rounded-full animate-[pulse_3s_ease-in-out_infinite] border-2 border-primary/20" />
            </button>
          </motion.div>
        </SheetTrigger>

        {/* ── Bottom sheet ── */}
        <SheetContent
          side="bottom"
          className={cn(
            'rounded-t-[28px] max-h-[88vh] p-0 border-0',
            'bg-white/60 dark:bg-black/50',
            'backdrop-blur-3xl backdrop-saturate-[1.8]',
            'shadow-[0_-8px_40px_-8px_rgba(0,0,0,0.15)]',
            'dark:shadow-[0_-8px_40px_-8px_rgba(0,0,0,0.6)]'
          )}
        >
          {/* Top edge highlight */}
          <div className="absolute inset-x-0 top-0 h-px rounded-t-[28px] bg-gradient-to-r from-transparent via-white/60 dark:via-white/10 to-transparent" />

          {/* Handle */}
          <div className="flex justify-center pt-3 pb-2">
            <motion.div
              initial={{ width: 32 }}
              animate={{ width: open ? 40 : 32 }}
              className="h-[5px] rounded-full bg-foreground/15"
            />
          </div>

          <div className="flex flex-col max-h-[82vh] overflow-hidden">
            {/* ── Header ── */}
            <div className="px-5 pb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'w-10 h-10 rounded-2xl flex items-center justify-center',
                    'bg-primary/10 backdrop-blur-sm'
                  )}
                >
                  <Scan className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <Logo className="text-lg" />
                  
                </div>
              </div>

              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={toggleTheme}
                className={cn(
                  'w-10 h-10 rounded-2xl flex items-center justify-center',
                  'bg-white/50 dark:bg-white/[0.06]',
                  'border border-white/40 dark:border-white/10',
                  'backdrop-blur-xl'
                )}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={theme}
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0, rotate: 90 }}
                    transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
                  >
                    {theme === 'dark' ? (
                      <Moon className="h-[18px] w-[18px] text-foreground/70" />
                    ) : (
                      <Sun className="h-[18px] w-[18px] text-foreground/70" />
                    )}
                  </motion.div>
                </AnimatePresence>
              </motion.button>
            </div>

            {/* ── User card ── */}
            {user && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="mx-4 mb-3"
              >
                <Link
                  to="/profile"
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-2xl',
                    'bg-white/50 dark:bg-white/[0.05]',
                    'border border-white/30 dark:border-white/[0.08]',
                    'backdrop-blur-xl',
                    'active:scale-[0.98] transition-transform duration-200'
                  )}
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="h-11 w-11 rounded-full object-cover ring-2 ring-white/30 dark:ring-white/10"
                    />
                  ) : (
                    <div className="h-11 w-11 rounded-full bg-primary/15 flex items-center justify-center">
                      <UserCircle className="h-6 w-6 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{displayName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                </Link>
              </motion.div>
            )}

            {/* ── Navigation grid ── */}
            <nav className="flex-1 overflow-y-auto px-4 py-2">
              <div className="space-y-1">
                {navigation.map((item, index) => {
                  const active = isActive(item.path);
                  const color = navColors[item.name] || 'ios-blue';

                  return (
                    <motion.div
                      key={item.name}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: 0.04 * index,
                        type: 'spring',
                        stiffness: 350,
                        damping: 28,
                      }}
                    >
                      <Link
                        to={item.path}
                        onClick={() => haptic.onSelection()}
                        className={cn(
                          'group relative flex items-center gap-3 py-3 px-3 rounded-2xl',
                          'transition-all duration-300',
                          'active:scale-[0.97]',
                          active
                            ? ''
                            : 'hover:bg-white/30 dark:hover:bg-white/[0.04]'
                        )}
                      >
                        {/* Active background pill */}
                        {active && (
                          <motion.div
                            layoutId="sheet-active-pill"
                            className="absolute inset-0 rounded-2xl"
                            style={{
                              background: `linear-gradient(135deg, hsl(var(--${color}) / 0.15), hsl(var(--${color}) / 0.05))`,
                              border: `1px solid hsl(var(--${color}) / 0.2)`,
                              boxShadow: `0 2px 12px -2px hsl(var(--${color}) / 0.15)`,
                            }}
                            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                          />
                        )}

                        <div
                          className={cn(
                            'relative z-10 w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                            'transition-colors duration-300',
                            active
                              ? ''
                              : 'bg-muted/60'
                          )}
                          style={
                            active
                              ? {
                                  background: `hsl(var(--${color}) / 0.15)`,
                                }
                              : undefined
                          }
                        >
                          <item.icon
                            className="h-[18px] w-[18px] transition-colors duration-300"
                            strokeWidth={active ? 2.2 : 1.8}
                            style={
                              active
                                ? { color: `hsl(var(--${color}))` }
                                : { color: 'hsl(var(--muted-foreground))' }
                            }
                          />
                        </div>

                        <span
                          className={cn(
                            'relative z-10 font-medium text-[15px] transition-colors duration-300',
                            active ? 'text-foreground' : 'text-muted-foreground'
                          )}
                        >
                          {item.name}
                        </span>

                        {active && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="relative z-10 ml-auto w-[6px] h-[6px] rounded-full"
                            style={{
                              background: `hsl(var(--${color}))`,
                              boxShadow: `0 0 8px hsl(var(--${color}) / 0.5)`,
                            }}
                          />
                        )}
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </nav>

            {/* ── Bottom actions ── */}
            <div
              className={cn(
                'p-4 mt-auto',
                'border-t border-white/20 dark:border-white/[0.06]',
                'bg-white/30 dark:bg-white/[0.02] backdrop-blur-xl'
              )}
            >
              {user ? (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <Button
                    variant="outline"
                    onClick={handleLogout}
                    className={cn(
                      'w-full justify-start h-12 rounded-2xl',
                      'bg-white/40 dark:bg-white/[0.04]',
                      'border-destructive/20 text-destructive',
                      'backdrop-blur-sm',
                      'hover:bg-destructive/10 active:scale-[0.98] transition-all duration-200'
                    )}
                  >
                    <LogOut className="h-[18px] w-[18px] mr-3" />
                    Sign Out
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  <Link to="/login" className="block">
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start h-12 rounded-2xl',
                        'bg-white/40 dark:bg-white/[0.04]',
                        'backdrop-blur-sm',
                        'active:scale-[0.98] transition-all duration-200'
                      )}
                    >
                      <User className="h-[18px] w-[18px] mr-3" />
                      Sign In
                    </Button>
                  </Link>
                  <Link to="/signup" className="block">
                    <Button
                      className={cn(
                        'w-full justify-start h-12 rounded-2xl',
                        'bg-primary/90 backdrop-blur-sm',
                        'shadow-[0_4px_16px_-4px_hsl(var(--primary)/0.4)]',
                        'active:scale-[0.98] transition-all duration-200'
                      )}
                    >
                      <UserPlus className="h-[18px] w-[18px] mr-3" />
                      Get Started
                    </Button>
                  </Link>
                </motion.div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default MobileSidebar;
