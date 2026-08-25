import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, LayoutGroup } from 'framer-motion';
import { Home, UserPlus, Clock, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { preloadRoute } from '@/lib/preloadRoute';

const navItems = [
  { path: '/', icon: Home, label: 'Home', color: 'ios-blue' },
  { path: '/register', icon: UserPlus, label: 'Register', color: 'ios-green' },
  { path: '/attendance', icon: Clock, label: 'Attend', color: 'ios-purple' },
  { path: '/profile', icon: User, label: 'Profile', color: 'ios-pink' },
];

const MobileNavBar: React.FC = () => {
  const location = useLocation();
  const isMobile = useIsMobile();
  const { trigger } = useHapticFeedback();

  if (!isMobile) return null;

  const isActive = (path: string) => location.pathname === path;
  const activeItem = navItems.find((i) => isActive(i.path)) ?? navItems[0];

  return (
    <motion.nav
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28, delay: 0.15 }}
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden safe-area-bottom"
    >
      {/* Outer frosted-glass shell */}
      <div
        className={cn(
          "mx-3 mb-2 rounded-[28px] overflow-hidden relative",
          "border border-white/25 dark:border-white/10",
          "bg-white/45 dark:bg-black/35",
          "backdrop-blur-3xl backdrop-saturate-[1.8]",
          "shadow-[0_8px_40px_-8px_rgba(0,0,0,0.18),inset_0_0.5px_0_rgba(255,255,255,0.35)]",
          "dark:shadow-[0_8px_40px_-8px_rgba(0,0,0,0.5),inset_0_0.5px_0_rgba(255,255,255,0.08)]"
        )}
      >
        {/* Subtle top-edge highlight */}
        <div className="absolute inset-x-0 top-0 h-[0.5px] bg-gradient-to-r from-transparent via-white/60 dark:via-white/15 to-transparent pointer-events-none" />

        <LayoutGroup>
          <div className="flex items-stretch justify-around px-1 py-1.5">
            {navItems.map((item) => {
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => trigger('light')}
                  onTouchStart={() => preloadRoute(item.path)}
                  onMouseEnter={() => preloadRoute(item.path)}
                  className="relative flex flex-col items-center justify-center flex-1 min-h-[56px]"
                >
                  {/* Shared sliding pill — one instance rides between active tabs */}
                  {active && (
                    <motion.div
                      layoutId="mobile-nav-pill"
                      className="absolute inset-x-2 inset-y-1 rounded-[20px]"
                      style={{
                        background: `linear-gradient(160deg, hsl(var(--${item.color}) / 0.22), hsl(var(--${item.color}) / 0.08))`,
                        boxShadow: `0 0 20px hsl(var(--${item.color}) / 0.2), inset 0 0.5px 0 rgba(255,255,255,0.3)`,
                        border: `0.5px solid hsl(var(--${item.color}) / 0.25)`,
                      }}
                      transition={{ type: 'spring', stiffness: 520, damping: 36, mass: 0.9 }}
                    />
                  )}

                  {/* Icon + Label */}
                  <motion.div
                    whileTap={{ scale: 0.88 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 26 }}
                    className="relative z-10 flex flex-col items-center gap-0.5"
                  >
                    <item.icon
                      className={cn(
                        "w-[22px] h-[22px]",
                        !active && "text-muted-foreground"
                      )}
                      strokeWidth={active ? 2.4 : 1.8}
                      style={{
                        color: active ? `hsl(var(--${item.color}))` : undefined,
                        transition: 'color 260ms cubic-bezier(0.4,0,0.2,1), stroke-width 260ms cubic-bezier(0.4,0,0.2,1)',
                      }}
                    />

                    <span
                      className={cn(
                        "text-[10px] font-semibold tracking-tight",
                        !active && "text-muted-foreground/70"
                      )}
                      style={{
                        color: active ? `hsl(var(--${activeItem.color}))` : undefined,
                        transition: 'color 260ms cubic-bezier(0.4,0,0.2,1)',
                      }}
                    >
                      {item.label}
                    </span>
                  </motion.div>
                </Link>
              );
            })}
          </div>
        </LayoutGroup>
      </div>
    </motion.nav>
  );
};

export default MobileNavBar;
