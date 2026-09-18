import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BookOpen, User, UserPlus, ScanLine, DoorOpen, Home, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import Logo from "@/components/Logo";
import LiteModeToggle from "@/components/LiteModeToggle";
import { preloadRoute } from "@/lib/preloadRoute";

type MobileAppShellProps = {
  children: React.ReactNode;
};

const routeTitles: Record<string, string> = {
  "/": "Home",
  "/register": "Student Register",
  "/attendance": "Attendance",
  "/gate": "Gate Control",
  "/profile": "Profile",
  "/admin": "Admin",
  "/teacher": "Teacher",
  "/features": "Features",
  "/parent": "Parent Portal",
};

const MobileAppShell: React.FC<MobileAppShellProps> = ({ children }) => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const { isAdminOrPrincipal, isTeacher, isLoading: isRoleLoading } = useUserRole();
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsSignedIn(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(Boolean(session));
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const tabs = useMemo(() => {
    const isTeacherUser = isTeacher && !isAdminOrPrincipal;
    const canUseGate = isAdminOrPrincipal || isTeacher;

    return [
      {
        key: "primary",
        label: isTeacherUser ? "Teacher Portal" : isAdminOrPrincipal ? "Admin Portal" : "Home",
        to: isTeacherUser ? "/teacher" : isAdminOrPrincipal ? "/admin" : "/",
        icon: isTeacherUser ? BookOpen : isAdminOrPrincipal ? LayoutDashboard : Home,
        show: true,
      },
      {
        key: "profile",
        label: "Profile",
        to: isSignedIn ? "/profile" : "/login",
        icon: User,
        show: true,
      },
      {
        key: "register",
        label: "Register",
        to: "/register",
        icon: UserPlus,
        show: isSignedIn,
      },
      {
        key: "attendance",
        label: "Attendance",
        to: "/attendance",
        icon: ScanLine,
        show: isSignedIn,
      },
      {
        key: "gate",
        label: "Gate Mode",
        to: "/gate",
        icon: DoorOpen,
        show: canUseGate,
      },
    ].filter((item) => item.show);
  }, [isAdminOrPrincipal, isSignedIn, isTeacher]);

  if (!isMobile) return <>{children}</>;

  const isGuardRoute = location.pathname.startsWith('/guard');
  const hideGlobalBottomNav = isGuardRoute;

  return (
    <div className="min-h-[100dvh] native-app-shell">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-2xl safe-area-top native-app-chrome">
        <div className="flex h-14 items-center justify-between px-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Logo size="sm" className="gap-1.5 [&>div>span:last-child]:hidden [&>div>span:first-child]:text-sm [&>img]:h-7 [&>img]:w-7 shrink-0" />
            <h1 className="text-sm font-semibold tracking-tight text-foreground truncate">
              {routeTitles[location.pathname] ?? "Workspace"}
            </h1>
          </div>
          <LiteModeToggle variant="badge" className="shrink-0 scale-90" />
        </div>
      </header>

      <div
        className={cn(
          "px-3 pt-[calc(56px+env(safe-area-inset-top)+12px)]",
          hideGlobalBottomNav
            ? "pb-[calc(env(safe-area-inset-bottom)+16px)]"
            : "pb-[calc(76px+env(safe-area-inset-bottom)+16px)]"
        )}
      >
        {children}
      </div>

      {!hideGlobalBottomNav && (
        <nav className="fixed inset-x-0 bottom-0 z-50 safe-area-bottom pb-2.5 sm:pb-3.5 px-2.5 pointer-events-none flex justify-center">
          <div
            className={cn(
              "pointer-events-auto max-w-full overflow-x-auto no-scrollbar",
              "rounded-full bg-[#0b0f19]/95 dark:bg-[#070a12]/95 backdrop-blur-2xl",
              "border border-white/10 dark:border-white/15",
              "shadow-[0_12px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.15)]",
              "p-1.5 flex items-center gap-1"
            )}
          >
            {tabs.map((tab) => {
              const active =
                location.pathname === tab.to ||
                (tab.to === "/teacher" && location.pathname.startsWith("/teacher")) ||
                (tab.to === "/admin" && location.pathname.startsWith("/admin"));

              return (
                <Link
                  key={tab.key}
                  to={tab.to}
                  onTouchStart={() => preloadRoute(tab.to)}
                  onMouseEnter={() => preloadRoute(tab.to)}
                  className={cn(
                    "relative flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold whitespace-nowrap transition-all duration-200 shrink-0 select-none",
                    active
                      ? "bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25 ring-1 ring-white/20"
                      : "text-slate-300 hover:text-white hover:bg-white/5 active:scale-95"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <tab.icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform duration-200",
                      active ? "text-white" : "text-slate-300"
                    )}
                    strokeWidth={active ? 2.3 : 1.9}
                  />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
};

export default MobileAppShell;