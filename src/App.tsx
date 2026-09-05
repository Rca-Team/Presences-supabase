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
import { warmCommonRoutes } from "@/lib/preloadRoute";


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
    title: "Presences | Smart School Automation Platform",
    description:
      "Automate school attendance, gate security, parent updates, and timetable management with real-time face recognition.",
  },
  "/contact": {
    title: "Contact Presences | School Automation Support",
    description:
      "Contact the Presences team for school onboarding, technical support, and product demos.",
  },
  "/features": {
    title: "Features | Presences Smart School System",
    description:
      "Explore face attendance, gate mode, parent portal, timetable, alerts, analytics, and automation features in Presences.",
  },
  "/login": {
    title: "Login | Presences",
    description:
      "Sign in to Presences to manage attendance, gate operations, and school workflows securely.",
  },
  "/signup": {
    title: "Create Account | Presences",
    description:
      "Create your Presences account to set up smart attendance, classroom tools, and parent communication.",
  },
  "/parent": {
    title: "Parent Portal | Presences",
    description:
      "Track student attendance, receive notifications, and stay connected with school updates in the Presences Parent Portal.",
  },
  "/register": {
    title: "Student Registration | Presences",
    description:
      "Register students quickly with face data capture and profile setup in the Presences platform.",
  },
  "/portfolio": {
    title: "Gaurav Portfolio Studio | Presences",
    description:
      "Secure portfolio studio with PIN access for editing Gaurav's profile, achievements, gallery, and project highlights.",
  },
  "/unsubscribe": {
    title: "Unsubscribe | Presences Notifications",
    description:
      "Manage and unsubscribe from Presences school notification emails.",
  },
  "/backup": {
    title: "Cloud Backup & Restore | Presences",
    description:
      "1-Click full cloud backup and restore engine for Database tables, Auth accounts, and Storage files in a standalone ZIP package.",
  },
  "/data": {
    title: "Data Backup | Presences",
    description:
      "1-Click full cloud backup and restore engine for Database tables, Auth accounts, and Storage files.",
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

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes location={renderedLocation}>
        <Route path="/" element={<Index />} />
        <Route path="/features" element={<Features />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/register" element={<Register />} />
        <Route path="/profile" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher", "user"]}>
            <Profile />
          </ProtectedRoute>
        } />
        <Route path="/attendance" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher", "user"]}>
            <Attendance />
          </ProtectedRoute>
        } />
        <Route path="/user" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher", "user"]}>
            <Attendance />
          </ProtectedRoute>
        } />
        <Route path="/gate" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher"]}>
            <GateMode />
          </ProtectedRoute>
        } />
        <Route path="/gate/vision" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher"]}>
            <GateVisionMode />
          </ProtectedRoute>
        } />
        <Route path="/parent" element={<ParentPortal />} />
        <Route path="/teacher" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher"]}>
            <TeacherPortal />
          </ProtectedRoute>
        } />
        <Route path="/admin" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher"]}>
            <Admin />
          </ProtectedRoute>
        } />
        <Route path="/notifications" element={
          <ProtectedRoute requireRoles={["admin", "principal"]}>
            <NotificationDemo />
          </ProtectedRoute>
        } />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/unsubscribe" element={<Unsubscribe />} />
        <Route path="/backup" element={
          <ProtectedRoute requireRoles={["admin", "principal"]}>
            <Backup />
          </ProtectedRoute>
        } />
        <Route path="/data" element={
          <ProtectedRoute requireRoles={["admin", "principal"]}>
            <Backup />
          </ProtectedRoute>
        } />
        <Route path="/__admin/face-model-validator" element={
          <ProtectedRoute requireRoles={["admin"]}>
            <FaceModelValidator />
          </ProtectedRoute>
        } />
        <Route path="*" element={<NotFound />} />
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
      const errorMsg = String(err?.message || err?.reason?.message || err || '').toLowerCase();
      const isChunkError =
        errorMsg.includes('dynamically imported module') ||
        errorMsg.includes('loading chunk') ||
        errorMsg.includes('mime type') ||
        errorMsg.includes('failed to fetch') ||
        errorMsg.includes('importing a module script failed') ||
        errorMsg.includes('expected a javascript-or-wasm');

      if (isChunkError) {
        const lastReload = Number(sessionStorage.getItem('presence:chunk_reload_ts') || '0');
        const now = Date.now();
        if (!lastReload || now - lastReload > 12000) {
          sessionStorage.setItem('presence:chunk_reload_ts', String(now));
          void (async () => {
            try {
              if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((r) => r.unregister()));
              }
              if ('caches' in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
              }
            } catch (_) {}
            window.location.reload();
          })();
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
    const schedule = window.setTimeout(() => setMountNonCritical(true), 800);
    // Pre-warm primary route chunks in the background to eliminate chunk load pauses & blinking
    warmCommonRoutes(['/', '/attendance', '/admin', '/gate', '/register', '/profile', '/features', '/contact', '/parent', '/teacher']);
    return () => {
      window.clearTimeout(schedule);
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
                  {showSplash && (
                    <SplashAnimation onComplete={handleSplashComplete} duration={1800} />
                  )}
                  <RoyalScrollProvider>
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
