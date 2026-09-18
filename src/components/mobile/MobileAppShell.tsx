import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BookOpen,
  User,
  UserPlus,
  ScanLine,
  DoorOpen,
  Home,
  ShieldCheck,
  UserCircle,
  LayoutDashboard,
} from "lucide-react";
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

  const isTeacherUser = isTeacher && !isAdminOrPrincipal;

  // 1. Teacher Dock Tabs
  const teacherTabs = useMemo(() => {
    return [
      {
        key: "teacher",
        label: "Teacher",
        to: "/teacher",
        icon: BookOpen,
        show: true,
      },
      {
        key: "profile",
        label: isSignedIn ? "Profile" : "Login",
        to: isSignedIn ? "/profile" : "/login",
        icon: UserCircle,
        show: true,
      },
      {
        key: "register",
        label: "Register",
        to: "/register",
        icon: UserPlus,
        show: true,
      },
      {
        key: "attendance",
        label: "Attend",
        to: "/attendance",
        icon: ScanLine,
        show: true,
      },
      {
        key: "gate",
        label: "Gate",
        to: "/gate",
        icon: DoorOpen,
        show: true,
      },
    ].filter((item) => item.show);
  }, [isSignedIn]);

  // 2. Normal User MacBook Dock Tabs (Previous design preserved)
  const normalTabs = useMemo(() => {
    const canUseGate = isAdminOrPrincipal;
    const canUseAdmin = isAdminOrPrincipal || (isSignedIn && isRoleLoading);

    return [
      { key: "home", label: "Home", to: "/", icon: Home, show: true },
      { key: "register", label: "Register", to: "/register", icon: UserPlus, show: isSignedIn },
      { key: "attendance", label: "Attend", to: "/attendance", icon: ScanLine, show: isSignedIn },
      { key: "gate", label: "Gate", to: "/gate", icon: ShieldCheck, show: canUseGate },
      { key: "admin", label: "Admin", to: "/admin", icon: LayoutDashboard, show: canUseAdmin },
      { key: "profile", label: isSignedIn ? "Profile" : "Login", to: isSignedIn ? "/profile" : "/login", icon: UserCircle, show: true },
    ].filter((item) => item.show);
  }, [isAdminOrPrincipal, isRoleLoading, isSignedIn]);

  if (!isMobile) return <>{children}</>;

  const isGuardRoute = location.pathname.startsWith('/guard');
  const tabs = isTeacherUser ? teacherTabs : normalTabs;

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
            : "pb-[calc(72px+env(safe-area-inset-bottom)+16px)]"
        )}
      >
        {children}
      </div>

      {!hideGlobalBottomNav && (
        <nav className="fixed inset-x-0 bottom-0 z-50 safe-area-bottom safe-area-left safe-area-right">
          <div
            className="macbook-dock mx-3 mb-2.5 grid gap-1.5 px-2 py-2"
            style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
          >
            {tabs.map((tab) => {
              const active =
                location.pathname === tab.to ||
                (tab.to === "/teacher" && location.pathname.startsWith("/teacher"));

              return (
                <Link
                  key={tab.key}
                  to={tab.to}
                  onTouchStart={() => preloadRoute(tab.to)}
                  onMouseEnter={() => preloadRoute(tab.to)}
                  className={cn(
                    "macbook-dock-item dock-item-pop group flex min-h-[56px] flex-col items-center justify-center rounded-2xl px-1 active:scale-90 transition-transform duration-200",
                    active ? "macbook-dock-item-active text-foreground" : "text-muted-foreground"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <tab.icon
                    className={cn(
                      "h-5 w-5 transition-all duration-300 ease-out",
                      active ? "scale-110 text-primary" : "scale-100 group-hover:scale-105"
                    )}
                    strokeWidth={active ? 2.3 : 1.9}
                  />
                  <span
                    className={cn(
                      "mt-1 text-[10px] font-medium leading-none tracking-normal whitespace-nowrap transition-colors duration-300",
                      active ? "text-foreground font-semibold" : "text-muted-foreground"
                    )}
                  >
                    {tab.label}
                  </span>
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