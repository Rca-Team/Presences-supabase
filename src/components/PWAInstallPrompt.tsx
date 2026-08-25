import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, Download, Share, Plus, Smartphone, Feather } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';

const PWAInstallPrompt: React.FC = () => {
  const { showPrompt, isIOS, install, dismissPrompt } = usePWAInstall();
  const { setPreference } = usePerformanceMode();

  const installLite = async () => {
    setPreference('on');
    await install();
  };

  const installFull = async () => {
    setPreference('off');
    await install();
  };

  if (!showPrompt) return null;


  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-20 left-4 right-4 z-[100] md:left-auto md:right-4 md:max-w-sm"
      >
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-background via-background to-primary/5 p-4 shadow-2xl backdrop-blur-xl">
          {/* Decorative gradient */}
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -left-10 -bottom-10 h-24 w-24 rounded-full bg-blue-500/20 blur-2xl" />
          
          {/* Close button */}
          <button
            onClick={dismissPrompt}
            className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative flex items-start gap-4">
            {/* App Icon */}
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-blue-600 shadow-lg">
              <Smartphone className="h-7 w-7 text-white" />
            </div>

            <div className="flex-1 pt-1">
              <h3 className="font-semibold text-foreground">Install Presence App</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Add to your home screen for quick access and offline support
              </p>
            </div>
          </div>

          {isIOS ? (
            // iOS instructions
            <div className="relative mt-4 rounded-lg bg-muted/50 p-3">
              <p className="text-sm font-medium text-foreground">To install:</p>
              <ol className="mt-2 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">1</span>
                  <span className="flex items-center gap-1">
                    Tap the <Share className="h-4 w-4 text-primary" /> Share button
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">2</span>
                  <span className="flex items-center gap-1">
                    Select <Plus className="h-4 w-4 text-primary" /> "Add to Home Screen"
                  </span>
                </li>
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">
                Tip: turn on Lite app first for a faster, low-data experience on slow phones.
              </p>
              <div className="mt-2 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => setPreference('on')}>
                  <Feather className="h-4 w-4" /> Use Lite
                </Button>
                <Button variant="ghost" size="sm" onClick={dismissPrompt} className="flex-1">
                  Got it
                </Button>
              </div>
            </div>
          ) : (
            // Android/Chrome install buttons — full or lite
            <div className="relative mt-4 space-y-2">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={installFull}
                  className="flex-1 gap-2 bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90"
                >
                  <Download className="h-4 w-4" />
                  Install full app
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={installLite}
                  className="flex-1 gap-2"
                >
                  <Feather className="h-4 w-4" />
                  Install Lite
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={dismissPrompt} className="w-full">
                Not now
              </Button>
            </div>

          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PWAInstallPrompt;
