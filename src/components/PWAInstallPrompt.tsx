import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Download, Share, Plus, Smartphone, Feather, Sparkles, LayoutGrid, Zap, ShieldCheck } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';

const PWAInstallPrompt: React.FC = () => {
  const { showPrompt, isIOS, isAndroid, deviceLabel, install, dismissPrompt } = usePWAInstall();
  const { setPreference } = usePerformanceMode();

  const handleInstallFull = async () => {
    setPreference('off');
    await install();
  };

  const handleInstallLite = async () => {
    setPreference('on');
    await install();
  };

  if (!showPrompt) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 80, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 80, scale: 0.95 }}
        transition={{ type: 'spring', damping: 22, stiffness: 280 }}
        className="fixed bottom-4 left-3 right-3 z-[140] sm:left-auto sm:right-4 sm:max-w-md"
      >
        <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-slate-950/95 dark:bg-slate-950/95 text-white p-5 shadow-2xl backdrop-blur-2xl">
          {/* Ambient Lighting Gradients */}
          <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-blue-600/30 blur-3xl pointer-events-none" />
          <div className="absolute -left-12 -bottom-12 h-32 w-32 rounded-full bg-indigo-600/25 blur-3xl pointer-events-none" />

          {/* Close button (Dismiss for current visit) */}
          <button
            onClick={dismissPrompt}
            className="absolute right-3.5 top-3.5 rounded-full p-1.5 bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
            title="Continue in browser"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Header with Device Detection Badge */}
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-lg shadow-blue-500/30 border border-white/20">
              <Smartphone className="h-6 w-6 text-white" />
            </div>

            <div className="flex-1 min-w-0 pr-6">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] font-bold py-0.5 px-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
                  {deviceLabel} Detected
                </Badge>
                <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[10px] font-bold py-0.5 px-2">
                  App Available
                </Badge>
              </div>

              <h3 className="font-bold text-base text-white mt-1 leading-tight">
                Install Presences App & Widgets
              </h3>
            </div>
          </div>

          {/* Features Pill Checklist */}
          <div className="my-3.5 grid grid-cols-1 gap-1.5 text-xs text-slate-300 bg-white/5 border border-white/10 rounded-2xl p-3">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>Native <strong>Home Screen Widgets</strong> (Live Attendance & Timetable)</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span><strong>3x Faster Launch</strong> & Instant Face Recognition</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span><strong>Full Offline Access</strong> & Low Data Battery Mode</span>
            </div>
          </div>

          {isIOS ? (
            // iOS Step-by-Step Installation Card
            <div className="space-y-3">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-xs space-y-2">
                <p className="font-bold text-slate-200">How to install on iPhone:</p>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[10px] font-black text-white">1</span>
                  <span>Tap Safari’s <strong>Share</strong> button <Share className="inline h-3.5 w-3.5 text-blue-400 mx-0.5" /> below</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[10px] font-black text-white">2</span>
                  <span>Select <strong>"Add to Home Screen"</strong> <Plus className="inline h-3.5 w-3.5 text-blue-400 mx-0.5" /></span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={dismissPrompt}
                  className="w-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border-white/15"
                >
                  Continue in Web Browser
                </Button>
              </div>
            </div>
          ) : (
            // Android / Standard Mobile Install Card
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleInstallFull}
                  className="flex-1 gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs h-10 rounded-xl shadow-md shadow-blue-500/25"
                >
                  <Download className="h-4 w-4" />
                  <span>Install App (.APK / PWA)</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleInstallLite}
                  className="gap-1.5 text-xs font-semibold h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white border-white/15"
                  title="Super lightweight for low-RAM phones"
                >
                  <Feather className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Lite Mode</span>
                </Button>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={dismissPrompt}
                className="w-full text-[11px] text-slate-400 hover:text-white h-7"
              >
                Continue in Web Browser for this visit
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PWAInstallPrompt;

