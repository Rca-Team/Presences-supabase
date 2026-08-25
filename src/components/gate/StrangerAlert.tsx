import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, X, Bell, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StrangerAlertProps {
  photoUrl?: string;
  gateName: string;
  onDismiss: () => void;
  onAlertStaff?: () => void;
}

const AUTO_DISMISS_MS = 10_000;

/**
 * Non-blocking corner notification for unrecognised faces.
 * Auto-dismisses after 10 s so it never freezes the gate operator.
 */
const StrangerAlert = ({ photoUrl, gateName, onDismiss, onAlertStaff }: StrangerAlertProps) => {
  useEffect(() => {
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <motion.div
      initial={{ x: 80, opacity: 0 }}
      animate={{ x: 0,  opacity: 1 }}
      exit={{    x: 80, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="fixed bottom-20 right-4 sm:bottom-6 z-[60] w-72 sm:w-80 pointer-events-auto"
    >
      <div className="bg-card/98 backdrop-blur-2xl rounded-2xl border-2 border-red-500/60 shadow-2xl overflow-hidden">
        {/* Timer bar */}
        <motion.div
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: AUTO_DISMISS_MS / 1000, ease: 'linear' }}
          className="h-1 w-full origin-left bg-red-500"
        />

        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <ShieldAlert className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="font-bold text-sm text-foreground">Unregistered Person</p>
                <p className="text-[11px] text-muted-foreground">{gateName} · {timeStr}</p>
              </div>
            </div>
            <button
              onClick={onDismiss}
              className="h-7 w-7 rounded-lg hover:bg-muted flex items-center justify-center transition-colors flex-shrink-0"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>

          {/* Photo thumbnail */}
          {photoUrl ? (
            <div className="rounded-xl overflow-hidden border border-border bg-muted h-32">
              <img src={photoUrl} alt="Unregistered person" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-muted/50 h-24 flex items-center justify-center">
              <UserX className="h-8 w-8 text-muted-foreground" />
            </div>
          )}

          <p className="text-xs text-muted-foreground leading-relaxed">
            Face not found in the registered student database. Captured and logged automatically.
          </p>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={onDismiss}>
              Dismiss
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="flex-1 text-xs h-8"
              onClick={() => { onAlertStaff?.(); onDismiss(); }}
            >
              <Bell className="h-3.5 w-3.5 mr-1" /> Alert Staff
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default StrangerAlert;
