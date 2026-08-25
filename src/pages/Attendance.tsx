import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { useSearchParams } from 'react-router-dom';
import PageLayout from '@/components/layouts/PageLayout';
import PageTransition from '@/components/PageTransition';
import AttendanceInstructions from '@/components/attendance/AttendanceInstructions';
import AttendanceStats from '@/components/attendance/AttendanceStats';
import FuturisticFaceScanner from '@/components/attendance/FuturisticFaceScanner';
import QRCodeScanner from '@/components/attendance/QRCodeScanner';
import LoopFaceScanMode from '@/components/attendance/LoopFaceScanMode';
import NeuralConsole from '@/components/attendance/NeuralConsole';
import LiveAttendanceFeed from '@/components/attendance/LiveAttendanceFeed';
import QuickStatsPanel from '@/components/attendance/QuickStatsPanel';
import VoiceCommands from '@/components/attendance/VoiceCommands';
import AttendanceMethodToggle from '@/components/attendance/AttendanceMethodToggle';
import { BarChart3, Info, Scan, Sparkles, Zap, Activity, QrCode, Feather } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import LiteAttendanceMode from '@/components/attendance/LiteAttendanceMode';
import { useTheme } from '@/hooks/use-theme';

/** Lumina NeuralConsole is a dark-mode experience; light mode keeps the classic layout. */
const ScanShell: React.FC<React.ComponentProps<typeof NeuralConsole>> = ({ children, ...props }) => {
  const { theme } = useTheme();
  if (theme === 'dark') return <NeuralConsole {...props}>{children}</NeuralConsole>;

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-3 lg:gap-5 lg:space-y-0">
      <div className="lg:col-span-2 bg-card/80 backdrop-blur-xl rounded-2xl sm:rounded-3xl border border-border/50 shadow-lg overflow-hidden">
        <div
          className="p-3 sm:p-4 flex items-center gap-3"
          style={{ background: 'linear-gradient(135deg, hsl(var(--ios-blue)), hsl(var(--neon-violet)))' }}
        >
          <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Scan className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-white text-sm sm:text-base truncate">{props.title}</h3>
            <p className="text-xs text-white/70 truncate">{props.subtitle}</p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-white">Live</span>
          </div>
        </div>
        <div className="p-2 sm:p-4">{children}</div>
        <div className="border-t border-border/50 px-3 py-2 sm:px-4">
          <span className="text-[11px] text-muted-foreground">
            Status: <span className="font-semibold text-primary">{props.statusText}</span>
          </span>
        </div>
      </div>
      <div className="rounded-2xl sm:rounded-3xl border border-border/50 bg-card/80 backdrop-blur-xl shadow-lg overflow-hidden">
        <div
          className="p-2.5 sm:p-3 flex items-center gap-2"
          style={{ background: 'linear-gradient(135deg, hsl(var(--ios-green)), hsl(var(--emerald)))' }}
        >
          <Activity className="w-4 h-4 text-white" />
          <span className="text-sm font-semibold text-white">Live Feed</span>
        </div>
        <div className="p-2.5 sm:p-3 max-h-[420px] overflow-auto">
          <LiveAttendanceFeed />
        </div>
      </div>
    </div>
  );
};


const AttendanceLoadingSkeleton = ({ isMobile }: { isMobile: boolean }) => (
  <div className="space-y-4 sm:space-y-6 animate-fade-in">
    <div className="premium-skeleton h-8 w-52 sm:w-72 mx-auto" />
    <div className="premium-skeleton h-10 w-full rounded-2xl" />
    <div className="premium-skeleton h-20 w-full rounded-2xl" />
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 premium-skeleton rounded-3xl h-[360px] sm:h-[420px]" />
      <div className="premium-skeleton rounded-3xl h-[260px] sm:h-[420px]" />
    </div>
    {isMobile && <div className="premium-skeleton h-16 rounded-2xl" />}
  </div>
);

const Attendance = () => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('single');
  const [tabDir, setTabDir] = useState(1);
  const [attendanceMethod, setAttendanceMethod] = useState<'face' | 'qr' | 'loop'>('face');
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const prefersReducedMotion = useReducedMotion();
  const { liteMode, preference, setPreference, signals } = usePerformanceMode();
  const minimizeMotion = isMobile || prefersReducedMotion || liteMode;


  useEffect(() => {
    const timer = window.setTimeout(() => setIsInitialLoading(false), 520);
    return () => window.clearTimeout(timer);
  }, []);

  const isQRKioskMode = searchParams.get('mode') === 'qr' && searchParams.get('autostart') === '1';

  useEffect(() => {
    if (!isQRKioskMode) return;
    setActiveTab('single');
    setAttendanceMethod('qr');
  }, [isQRKioskMode]);

  const tabConfig = [
    { value: 'single', label: 'AI Scanner', shortLabel: 'Scan', icon: Scan },
    { value: 'stats', label: 'Analytics', shortLabel: 'Stats', icon: BarChart3 },
    { value: 'help', label: 'Help', shortLabel: 'Help', icon: Info },
  ];

  const switchTab = (next: string) => {
    const order = ['single', 'stats', 'help'];
    setTabDir(order.indexOf(next) >= order.indexOf(activeTab) ? 1 : -1);
    setActiveTab(next);
  };

  const slide = {
    initial: { opacity: 0, x: tabDir * 42 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: tabDir * -42 },
    transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const },
  };

  const handleVoiceCommand = (command: string) => {
    const tabMap: Record<string, string> = {
      'scan': 'single', 'stats': 'stats', 'help': 'help'
    };
    if (tabMap[command]) switchTab(tabMap[command]);
  };

  const ModeToggle = () => (
    <div className="flex items-center justify-center">
      <div className="inline-flex rounded-xl border border-border overflow-hidden text-xs">
        <button
          onClick={() => setPreference('off')}
          className={`px-3 py-1.5 font-medium ${!liteMode ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
        >
          Original mode
        </button>
        <button
          onClick={() => setPreference('on')}
          className={`px-3 py-1.5 font-medium inline-flex items-center gap-1 ${liteMode ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
        >
          <Feather className="w-3 h-3" /> Lite mode
        </button>
      </div>
    </div>
  );

  if (liteMode) {
    return (
      <PageTransition>
        <PageLayout className="min-h-[100dvh] bg-background">
          <div className="relative px-3 sm:px-4 py-4 max-w-3xl mx-auto space-y-3">
            <div className="text-center">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">Attendance</h1>
              <p className="text-xs text-muted-foreground">Simple mode · optimized for this device</p>
            </div>
            <ModeToggle />
            <LiteAttendanceMode />
          </div>
        </PageLayout>
      </PageTransition>
    );
  }


  return (
    <PageTransition>
      <PageLayout className="min-h-[100dvh] bg-background">

        {/* Soft animated background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          {minimizeMotion ? (
            <>
              <div
                className="absolute -top-20 -right-20 w-60 sm:w-[28rem] h-60 sm:h-[28rem] rounded-full blur-[100px]"
                style={{ background: 'hsl(var(--ios-blue) / 0.16)' }}
              />
              <div
                className="absolute -bottom-20 -left-20 w-60 sm:w-[28rem] h-60 sm:h-[28rem] rounded-full blur-[100px]"
                style={{ background: 'hsl(var(--ios-purple) / 0.14)' }}
              />
            </>
          ) : (
            <>
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.12, 0.25, 0.12] }}
                transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute -top-20 -right-20 w-60 sm:w-[28rem] h-60 sm:h-[28rem] rounded-full blur-[100px]"
                style={{ background: 'hsl(var(--ios-blue) / 0.2)' }}
              />
              <motion.div
                animate={{ scale: [1.2, 1, 1.2], opacity: [0.1, 0.2, 0.1] }}
                transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                className="absolute -bottom-20 -left-20 w-60 sm:w-[28rem] h-60 sm:h-[28rem] rounded-full blur-[100px]"
                style={{ background: 'hsl(var(--ios-purple) / 0.15)' }}
              />
            </>
          )}
        </div>

        <div className="relative px-4 sm:px-4 md:px-6 py-4 sm:py-8 max-w-7xl mx-auto">
          {/* Header - Compact on mobile */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-3 sm:mb-6"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-2 sm:mb-4"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'hsl(var(--ios-green))' }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: 'hsl(var(--ios-green))' }} />
              </span>
              <span className="text-xs font-medium text-primary">Recognition Active</span>
            </motion.div>

            <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold mb-1 sm:mb-3 text-foreground">
              Smart Attendance
            </h1>
            <p className="text-muted-foreground text-xs sm:text-base max-w-lg mx-auto">
              AI-powered face recognition & QR code attendance
            </p>

            <div className="mt-3">
              <ModeToggle />
            </div>

            {(signals.slowNetwork || signals.lowMemory || signals.saveData) && preference !== 'off' && (
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs">
                <Feather className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-amber-700 dark:text-amber-400 font-medium">Slow device / network detected</span>
                <button
                  onClick={() => setPreference('on')}
                  className="ml-1 font-semibold text-primary underline underline-offset-2"
                >
                  Switch to Lite
                </button>
              </div>
            )}



            {/* Feature pills */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-wrap justify-center gap-1.5 sm:gap-3 mt-2 sm:mt-5"
            >
              {[
                { icon: Zap, text: '<1-2s', color: '--ios-orange' },
                { icon: Sparkles, text: '99.8%', color: '--ios-blue' },
                { icon: Activity, text: 'Live', color: '--ios-green' },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-card/80 backdrop-blur-sm border border-border/50 shadow-sm"
                >
                  <item.icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" style={{ color: `hsl(var(${item.color}))` }} />
                  <span className="text-[10px] sm:text-xs font-semibold" style={{ color: `hsl(var(${item.color}))` }}>{item.text}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* Tab Bar - MOVED ABOVE Quick Stats for mobile accessibility */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mb-3 sm:mb-5"
          >
            <div className="flex gap-1 p-1 bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl shadow-sm">
              {tabConfig.map((tab) => {
                const isActive = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => switchTab(tab.value)}
                    className={`relative flex items-center justify-center gap-1.5 flex-1 px-2 py-3 rounded-xl text-xs sm:text-sm font-medium transition-all duration-300 active:scale-95 ${
                      isActive
                        ? 'text-primary-foreground shadow-md'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeAttendanceTab"
                        className="absolute inset-0 bg-primary rounded-xl"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                      />
                    )}
                    <span className="relative flex items-center gap-1.5">
                      <tab.icon className="w-4 h-4" />
                      <span className="hidden sm:inline">{tab.label}</span>
                      <span className="sm:hidden">{tab.shortLabel}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* Quick Stats - now below tab bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mb-4 sm:mb-6"
          >
            <QuickStatsPanel />
          </motion.div>

          {/* Tab Content */}
          {isInitialLoading ? (
            <AttendanceLoadingSkeleton isMobile={isMobile} />
          ) : (
          <AnimatePresence mode="wait">
            {activeTab === 'single' && (
              <motion.div
                key="single"
                {...slide}
                className="space-y-4"
              >
                {/* Method toggle */}
                <div className="rounded-2xl sm:rounded-3xl border border-primary/10 bg-card/55 p-3 backdrop-blur-xl shadow-[0_24px_70px_-30px_hsl(230_50%_3%/0.8)]">
                  <AttendanceMethodToggle method={attendanceMethod} onChange={setAttendanceMethod} />
                </div>

                <AnimatePresence mode="wait">
                  {attendanceMethod === 'face' ? (
                    <motion.div key="face" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
                      <ScanShell
                        title="Recognition"
                        subtitle="Live neural inference"
                        cameraLabel="CAM-01 · FACE STATION"
                        statusText="Analyzing…"
                        badge="REC · FACE ID"
                      >
                        <FuturisticFaceScanner />
                      </ScanShell>
                    </motion.div>
                  ) : attendanceMethod === 'loop' ? (
                    <motion.div key="loop" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
                      <ScanShell
                        title="Loop inference"
                        subtitle="Batch capture · deferred matching"
                        cameraLabel="CAM-02 · LOOP STATION"
                        statusText="Capturing best shots"
                        badge="REC · LOOP"
                      >
                        <LoopFaceScanMode />
                      </ScanShell>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="qr"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="space-y-4 lg:grid lg:grid-cols-3 lg:gap-5 lg:space-y-0"
                    >
                      <div className="lg:col-span-2 rounded-2xl sm:rounded-3xl border border-primary/10 bg-card/55 p-2 backdrop-blur-xl sm:p-4">
                        <QRCodeScanner autoStart={isQRKioskMode} hideManualControls={isQRKioskMode} />
                      </div>
                      <div className="rounded-2xl sm:rounded-3xl border border-primary/10 bg-card/55 p-3 backdrop-blur-xl">
                        <div className="mb-2 flex items-center gap-2">
                          <Activity className="h-4 w-4 text-primary" />
                          <span className="text-sm font-semibold text-foreground">Live feed</span>
                        </div>
                        <div className="max-h-[420px] overflow-auto">
                          <LiveAttendanceFeed />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Voice Commands */}
                <div className="hidden sm:block">
                  <VoiceCommands
                    onCommand={handleVoiceCommand}
                    onStartScan={() => toast({ title: 'Starting Scan', description: 'Voice command activated face scanning' })}
                    onStopScan={() => toast({ title: 'Scan Stopped', description: 'Voice command stopped the scanner' })}
                    onConfirmAttendance={() => toast({ title: 'Attendance Confirmed', description: 'Voice command confirmed attendance' })}
                  />
                </div>
              </motion.div>
            )}


            {activeTab === 'stats' && (
              <motion.div key="stats" {...slide}
                className="space-y-4 lg:grid lg:grid-cols-3 lg:gap-5 lg:space-y-0"
              >
                <div className="lg:col-span-2">
                  <div className="bg-card/80 backdrop-blur-xl rounded-2xl sm:rounded-3xl border border-border/50 shadow-lg overflow-hidden">
                    <div className="p-3 sm:p-4 flex items-center gap-3" style={{ background: 'linear-gradient(135deg, hsl(var(--ios-green)), hsl(var(--emerald)))' }}>
                      <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white text-sm sm:text-base">Analytics Dashboard</h3>
                        <p className="text-xs text-white/70">Insights and metrics</p>
                      </div>
                    </div>
                    <div className="p-3 sm:p-5">
                      <AttendanceStats />
                    </div>
                  </div>
                </div>
                <div>
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-card/80 backdrop-blur-xl rounded-2xl sm:rounded-3xl border border-border/50 shadow-lg overflow-hidden h-72 sm:h-80"
                  >
                    <div className="p-2.5 sm:p-3 flex items-center gap-2" style={{ background: 'linear-gradient(135deg, hsl(var(--ios-green)), hsl(var(--emerald)))' }}>
                      <Activity className="w-4 h-4 text-white" />
                      <span className="text-sm font-semibold text-white">Live Feed</span>
                    </div>
                    <div className="p-2.5 sm:p-3 h-[calc(100%-40px)] sm:h-[calc(100%-44px)]">
                      <LiveAttendanceFeed />
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            )}

            {activeTab === 'help' && (
              <motion.div key="help" {...slide}>
                <div className="bg-card/80 backdrop-blur-xl rounded-2xl sm:rounded-3xl border border-border/50 shadow-lg overflow-hidden">
                  <div className="p-3 sm:p-4 flex items-center gap-3" style={{ background: 'linear-gradient(135deg, hsl(var(--ios-orange)), hsl(var(--ios-red)))' }}>
                    <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                      <Info className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-sm sm:text-base">Help & Instructions</h3>
                      <p className="text-xs text-white/70">How to use the system</p>
                    </div>
                  </div>
                  <div className="p-3 sm:p-5">
                    <AttendanceInstructions />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          )}
        </div>
      </PageLayout>
    </PageTransition>
  );
};

export default Attendance;
