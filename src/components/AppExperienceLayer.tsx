import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Wifi, WifiOff } from 'lucide-react';

const AppExperienceLayer = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    const onOffline = () => {
      setIsOnline(false);
      setShowRestored(false);
    };
    const onOnline = () => {
      setIsOnline(true);
      setShowRestored(true);
      window.setTimeout(() => setShowRestored(false), 2800);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return (
    <>
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ y: -70, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -70, opacity: 0 }}
            className="fixed top-3 left-1/2 -translate-x-1/2 z-[130] w-[min(94vw,34rem)] rounded-xl border border-destructive/40 bg-destructive/12 backdrop-blur-xl px-4 py-2"
          >
            <div className="flex items-center gap-2 text-sm text-foreground">
              <WifiOff className="h-4 w-4 text-destructive animate-pulse" />
              <span className="font-medium">Network is unstable. Working in retry mode.</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOnline && showRestored && (
          <motion.div
            initial={{ y: -70, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -70, opacity: 0 }}
            className="fixed top-3 left-1/2 -translate-x-1/2 z-[130] w-[min(94vw,34rem)] rounded-xl border border-primary/40 bg-primary/12 backdrop-blur-xl px-4 py-2"
          >
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Wifi className="h-4 w-4 text-primary" />
              <span className="font-medium">Connection restored. Sync is active.</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AppExperienceLayer;
