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
  "/register": "Register Student",
  "/attendance": "Attendance",
  "/gate": "Gate & Classroom Camera",
  "/gate-vision": "Gate Scanner",
  "/profile": "My Profile",
  "/admin": "School Admin",
  "/teacher": "Teacher Portal",
  "/features": "School Features",
  "/parent": "Parent Portal",
  "/contact": "Contact Us",
  "/portfolio": "About Team",
  "/login": "Sign In",
  "/signup": "Create Account",
  "/widgets": "Quick Tools",
  "/jarvis": "Jarvis Assistant",
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
        label: "Attendance",
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

  // 2. Normal User Dock Tabs
  const normalTabs = useMemo(() => {
    const canUseGate = isAdminOrPrincipal;
    const canUseAdmin = isAdminOrPrincipal || (isSignedIn && isRoleLoading);

    return [
      { key: "home", label: "Home", to: "/", icon: Home, show: true },
      { key: "register", label: "Register", to: "/register", icon: UserPlus, show: true },
      { key: "attendance", label: "Attendance", to: "/attendance", icon: ScanLine, show: true },
      { key: "gate", label: "Gate", to: "/gate", icon: ShieldCheck, show: canUseGate },
      { key: "admin", label: "Admin", to: "/admin", icon: LayoutDashboard, show: canUseAdmin },
      { key: "profile", label: isSignedIn ? "Profile" : "Login", to: isSignedIn ? "/profile" : "/login", icon: UserCircle, show: true },
    ].filter((item) => item.show);
  }, [isAdminOrPrincipal, isRoleLoading, isSignedIn]);

  if (!isMobile) return <>{children}</>;

  const path = location.pathname;

  // Fullscreen / Kiosk routes where external camera or turnstile takes 100% of viewport
  const isImmersiveRoute =
    path.startsWith('/gate') ||
    path.startsWith('/guard') ||
    path.startsWith('/gate-vision');

  // Routes that already provide their own customized, rich mobile header
  const hasCustomHeader =
    isImmersiveRoute ||
    path.startsWith('/parent') ||
    path.startsWith('/admin') ||
    path.startsWith('/teacher') ||
    path.startsWith('/register') ||
    path.startsWith('/login') ||
    path.startsWith('/signup');

  // Hide the global bottom dock on camera kiosks and guard consoles
  const hideGlobalBottomNav = isImmersiveRoute;
  const tabs = isTeacherUser ? teacherTabs : normalTabs;

  return (
    <div className="min-h-[100dvh] native-app-shell overflow-x-clip w-full">
      {/* Top Header Chrome (Hidden on routes with dedicated native headers to avoid duplicate header stacking) */}
      {!hasCustomHeader && (
        <header className="fixed inset-x-0 top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-2xl safe-area-top native-app-chrome">
          <div className="flex h-14 items-center justify-between px-3.5 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Logo size="sm" className="gap-1.5 [&>div>span:last-child]:hidden [&>div>span:first-child]:text-sm [&>img]:h-7 [&>img]:w-7 shrink-0" />
              <h1 className="text-sm font-bold tracking-tight text-foreground truncate">
                {routeTitles[path] ?? "Presences"}
              </h1>
            </div>
            <LiteModeToggle variant="badge" className="shrink-0 scale-90" />
          </div>
        </header>
      )}

      {/* Main Content Container with Contextual Padding */}
      <div
        className={cn(
          "w-full transition-all",
          isImmersiveRoute
            ? "p-0 min-h-[100dvh]"
            : cn(
                "px-2.5 sm:px-4",
                hasCustomHeader
                  ? "pt-0"
                  : "pt-[calc(56px+env(safe-area-inset-top)+8px)]",
                hideGlobalBottomNav
                  ? "pb-[calc(env(safe-area-inset-bottom)+12px)]"
                  : "pb-[calc(76px+env(safe-area-inset-bottom)+16px)]"
              )
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