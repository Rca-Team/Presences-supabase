import { Suspense, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Helmet, HelmetProvider } from "react-helmet-async";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import RouteFallback from "@/components/RouteFallback";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";
import { warmCommonRoutes } from "@/lib/preloadRoute";
import { isRecoverableChunkOrNetworkError, performAppRecovery } from "@/utils/errorHandler";


const Index = lazyWithRetry(() => import("./pages/Index"), "index");
const Register = lazyWithRetry(() => import("./pages/Register"), "register");
const Attendance = lazyWithRetry(() => import("./pages/Attendance"), "attendance");
const Login = lazyWithRetry(() => import("./pages/Login"), "login");
const Signup = lazyWithRetry(() => import("./pages/Signup"), "signup");
const NotFound = lazyWithRetry(() => import("./pages/NotFound"), "not-found");
const Admin = lazyWithRetry(() => import("./pages/Admin"), "admin");
const Contact = lazyWithRetry(() => import('./pages/Contact'), 'contact');
const NotificationDemo = lazyWithRetry(() => import('./pages/NotificationDemo'), 'notification-demo');
const Profile = lazyWithRetry(() => import('./pages/Profile'), 'profile');
const Features = lazyWithRetry(() => import('./pages/Features'), 'features');
const GateMode = lazyWithRetry(() => import('./pages/GateMode'), 'gate-mode');
const GateVisionMode = lazyWithRetry(() => import('./pages/GateVisionMode'), 'gate-vision-mode');
const ParentPortal = lazyWithRetry(() => import('./pages/ParentPortal'), 'parent-portal');
const Unsubscribe = lazyWithRetry(() => import('./pages/Unsubscribe'), 'unsubscribe');
const Backup = lazyWithRetry(() => import('./pages/Backup'), 'backup');
const FaceModelValidator = lazyWithRetry(() => import('./pages/FaceModelValidator'), 'face-model-validator');
const TeacherPortal = lazyWithRetry(() => import('./pages/TeacherPortal'), 'teacher-portal');
const Portfolio = lazyWithRetry(() => import('./pages/Portfolio'), 'portfolio');
const Jarvis = lazyWithRetry(() => import("./pages/Jarvis"), "jarvis");
const Widgets = lazyWithRetry(() => import("./pages/Widgets"), "widgets");
const SmartBoardMode = lazyWithRetry(() => import("./pages/SmartBoardMode"), "smartboard");
const GuardScanner = lazyWithRetry(() => import("./pages/GuardScanner"), "guard-scanner");

import { AttendanceProvider } from './contexts/AttendanceContext';
import { ThemeProvider } from './hooks/use-theme';
import { PerformanceModeProvider } from './hooks/usePerformanceMode';


import MobileAppShell from "./components/mobile/MobileAppShell";
import { ProtectedRoute } from './components/ProtectedRoute';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import EmergencyAlertListener from './components/EmergencyAlertListener';
import RealtimeNotificationListener from './components/RealtimeNotificationListener';
import AppExperienceLayer from './components/AppExperienceLayer';
import SplashAnimation from './components/SplashAnimation';
// NOTE: ModelService is imported dynamically inside the prefetch effect below.
// A static import would pull face-api.js + tfjs into the entry chunk.

import NotificationPermissionGate from './components/NotificationPermissionGate';
import LuminaScope from './components/LuminaScope';
import RoyalScrollProvider from './components/RoyalScrollProvider';
import DesktopSlideProvider from './components/DesktopSlideProvider';
import GlobalTelemetryTracker from './components/telemetry/GlobalTelemetryTracker';


const queryClient = new QueryClient();

queryClient.setDefaultOptions({
  queries: {
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  },
});

const SITE_URL = "https://presences.dev";

const ROUTE_SEO: Record<string, { title: string; description: string }> = {
  "/": {
    title: "Presences | Smart School System",
    description:
      "Easy school attendance, entry gate security, parent updates, and class schedules using smart face recognition.",
  },
  "/contact": {
    title: "Contact Us | Presences",
    description:
      "Get in touch with the Presences team for help, questions, or setting up your school.",
  },
  "/features": {
    title: "Features | Presences Smart School",
    description:
      "See how Presences helps with attendance, gate checks, parent updates, timetables, and alerts.",
  },
  "/login": {
    title: "Sign In | Presences",
    description:
      "Log into your school account to view attendance, manage classes, and check updates.",
  },
  "/signup": {
    title: "Create Account | Presences",
    description:
      "Sign up for Presences to manage your school attendance and parent updates easily.",
  },
  "/parent": {
    title: "Parent Portal | Presences",
    description:
      "Check your child's daily attendance, class timetable, and school entry updates.",
  },
  "/guard": {
    title: "Gate Pass Scanner | Presences",
    description:
      "Easy QR code scanner for school security guards to verify student gate passes and exit slips.",
  },
  "/widgets": {
    title: "School Widgets | Presences",
    description:
      "Handy tools including attendance stats, class period countdowns, noise meter, and stopwatch.",
  },
  "/smartboard": {
    title: "Smart Board Mode | Presences",
    description:
      "Interactive classroom display with whiteboard, lucky wheel, noise meter, and period gong.",
  },
  "/register": {
    title: "Student Registration | Presences",
    description:
      "Register new students easily by saving their details and taking a photo.",
  },
  "/portfolio": {
    title: "Creator Portfolio | Presences",
    description:
      "Learn more about the creator of Presences, achievements, and project highlights.",
  },
  "/unsubscribe": {
    title: "Unsubscribe | Presences",
    description:
      "Manage your email notification settings for school updates.",
  },
  "/backup": {
    title: "Data Backup & Recovery | Presences",
    description:
      "Save a safe backup of your school records, student photos, and accounts with one simple click.",
  },
  "/data": {
    title: "Data Backup | Presences",
    description:
      "Backup and restore student data, accounts, and photo files safely.",
  },
  "/jarvis": {
    title: "Jarvis AI Assistant | Presences",
    description:
      "Your smart voice assistant that checks school records, finds missing info, and answers your questions.",
  },
};

const getRouteSeo = (pathname: string) => {
  return (
    ROUTE_SEO[pathname] ?? {
      title: "Presences | Smart School Automation",
      description:
        "AI-powered school automation platform for attendance, security, and parent communication.",
    }
  );
};

function SeoHead() {
  const location = useLocation();
  const { title, description } = getRouteSeo(location.pathname);
  const canonical = `${SITE_URL}${location.pathname}`;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content="website" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {location.pathname === "/" && (
        <script type="application/ld+json">
          {JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Presences",
              url: SITE_URL,
              description:
                "AI-powered smart school automation platform for attendance, gate management, and parent communication.",
            },
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Presences",
              url: SITE_URL,
              logo: `${SITE_URL}/logo.png`,
              sameAs: [SITE_URL, `${SITE_URL.replace('https://', 'https://www.')}`],
            },
            {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "Presences",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              url: SITE_URL,
              description:
                "School automation software for face recognition attendance, gate security, timetable management, and parent portal updates.",
            },
          ])}
        </script>
      )}
    </Helmet>
  );
}

// Optimized declarative router with seamless concurrent transitions & zero chunk glitching
function AnimatedRoutes() {
  const location = useLocation();
  const [renderedLocation, setRenderedLocation] = useState(location);
  const [, startTransition] = useTransition();

  useEffect(() => {
    // Keep current page steady on screen while next chunk loads, preventing flash/glitch
    startTransition(() => {
      setRenderedLocation(location);
    });
  }, [location]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [renderedLocation.pathname]);

  const bound = (element: React.ReactNode, title?: string) => (
    <RouteErrorBoundary pageTitle={title}>{element}</RouteErrorBoundary>
  );

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes location={renderedLocation}>
        <Route path="/" element={bound(<Index />, "Home")} />
        <Route path="/features" element={bound(<Features />, "Features")} />
        <Route path="/contact" element={bound(<Contact />, "Contact")} />
        <Route path="/login" element={bound(<Login />, "Login")} />
        <Route path="/signup" element={bound(<Signup />, "Sign Up")} />
        <Route path="/register" element={bound(<Register />, "Add Student")} />
        <Route path="/profile" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher", "user"]}>
            {bound(<Profile />, "Profile")}
          </ProtectedRoute>
        } />
        <Route path="/attendance" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher", "user"]}>
            {bound(<Attendance />, "Attendance")}
          </ProtectedRoute>
        } />
        <Route path="/user" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher", "user"]}>
            {bound(<Attendance />, "Attendance")}
          </ProtectedRoute>
        } />
        <Route path="/gate" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher"]}>
            {bound(<GateMode />, "Gate & Campus")}
          </ProtectedRoute>
        } />
        <Route path="/gate/vision" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher"]}>
            {bound(<GateVisionMode />, "Gate Vision")}
          </ProtectedRoute>
        } />
        <Route path="/guard" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher", "guard", "security"]}>
            {bound(<GuardScanner />, "Gate Scanner")}
          </ProtectedRoute>
        } />
        <Route path="/gate/scanner" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher", "guard", "security"]}>
            {bound(<GuardScanner />, "Gate Scanner")}
          </ProtectedRoute>
        } />
        <Route path="/parent" element={bound(<ParentPortal />, "Parent Portal")} />
        <Route path="/teacher" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher"]}>
            {bound(<TeacherPortal />, "Teacher Portal")}
          </ProtectedRoute>
        } />
        <Route path="/teacher/:classId" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher"]}>
            {bound(<TeacherPortal />, "Teacher Portal")}
          </ProtectedRoute>
        } />
        <Route path="/class" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher"]}>
            {bound(<TeacherPortal />, "Class Teacher")}
          </ProtectedRoute>
        } />
        <Route path="/class/:classId" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher"]}>
            {bound(<TeacherPortal />, "Class Teacher")}
          </ProtectedRoute>
        } />
        <Route path="/admin" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher"]}>
            {bound(<Admin />, "Admin Center")}
          </ProtectedRoute>
        } />
        <Route path="/notifications" element={
          <ProtectedRoute requireRoles={["admin", "principal"]}>
            {bound(<NotificationDemo />, "Notifications")}
          </ProtectedRoute>
        } />
        <Route path="/portfolio" element={bound(<Portfolio />, "Portfolio")} />
        <Route path="/unsubscribe" element={bound(<Unsubscribe />, "Unsubscribe")} />
        <Route path="/backup" element={
          <ProtectedRoute requireRoles={["admin", "principal"]}>
            {bound(<Backup />, "Backup & Recovery")}
          </ProtectedRoute>
        } />
        <Route path="/data" element={
          <ProtectedRoute requireRoles={["admin", "principal"]}>
            {bound(<Backup />, "Backup & Recovery")}
          </ProtectedRoute>
        } />
        <Route path="/__admin/face-model-validator" element={
          <ProtectedRoute requireRoles={["admin"]}>
            {bound(<FaceModelValidator />, "Model Validator")}
          </ProtectedRoute>
        } />
        <Route path="/jarvis" element={
          <ProtectedRoute requireRoles={["admin"]}>
            {bound(<Jarvis />, "Jarvis Assistant")}
          </ProtectedRoute>
        } />
        <Route path="/widgets" element={bound(<Widgets />, "Quick Tools")} />
        <Route path="/smartboard" element={bound(<SmartBoardMode />, "Smart Board")} />
        <Route path="*" element={bound(<NotFound />, "Page Not Found")} />
      </Routes>
    </Suspense>
  );
}


function App() {
  const [mountNonCritical, setMountNonCritical] = useState(false);
  const [showSplash, setShowSplash] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      if (sessionStorage.getItem('presence:splash-seen')) return false;
      const isStandalone =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      if (isStandalone) return false;
    } catch {
      return false;
    }
    return true;
  });
  const chunkRecoveryKey = "presence:chunk-recovery";


  useEffect(() => {
    const handleChunkError = (err: any) => {
      if (isRecoverableChunkOrNetworkError(err)) {
        const lastReload = Number(sessionStorage.getItem('presence:chunk_reload_ts') || '0');
        const now = Date.now();
        if (!lastReload || now - lastReload > 12000) {
          sessionStorage.setItem('presence:chunk_reload_ts', String(now));
          void performAppRecovery(false);
        }
      }
    };

    const onPreloadError = (event: Event) => {
      event.preventDefault();
      handleChunkError('vite:preloadError');
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      handleChunkError(event.reason);
    };

    window.addEventListener('vite:preloadError', onPreloadError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('vite:preloadError', onPreloadError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);


  useEffect(() => {
    const browser = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const mount = () => setMountNonCritical(true);
    const idleId = browser.requestIdleCallback?.(mount, { timeout: 1800 });
    const timeoutId = idleId === undefined ? window.setTimeout(mount, 1200) : undefined;

    // Warm only lightweight, common destinations. Feature-heavy routes still
    // preload on intent (hover/focus), avoiding a large post-load CPU spike.
    warmCommonRoutes(['/login', '/attendance', '/features']);
    return () => {
      if (idleId !== undefined) browser.cancelIdleCallback?.(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  const handleSplashComplete = () => {
    sessionStorage.setItem('presence:splash-seen', '1');
    setShowSplash(false);
  };

  return (
    <ThemeProvider defaultTheme="light">
      <PerformanceModeProvider>
      <AttendanceProvider>

        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            
            <HelmetProvider>
              <div className="premium-glass-app">
                <BrowserRouter>
                  <GlobalTelemetryTracker />
                  {showSplash && (
                    <SplashAnimation onComplete={handleSplashComplete} duration={1800} />
                  )}
                  <RoyalScrollProvider>
                    <DesktopSlideProvider>
                      <NotificationPermissionGate>
                        <MobileAppShell>
                          <SeoHead />
                          <LuminaScope />
                          <AppErrorBoundary><AnimatedRoutes /></AppErrorBoundary>
                        </MobileAppShell>
                        {mountNonCritical && (
                          <>
                            <AppExperienceLayer />
                            <PWAInstallPrompt />
                          </>
                        )}
                        <EmergencyAlertListener />
                        <RealtimeNotificationListener />
                      </NotificationPermissionGate>
                    </DesktopSlideProvider>
                  </RoyalScrollProvider>
                </BrowserRouter>
              </div>
            </HelmetProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </AttendanceProvider>
      </PerformanceModeProvider>
    </ThemeProvider>

  );
}

export default App;
