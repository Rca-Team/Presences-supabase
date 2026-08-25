import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Clock, UserCircle } from 'lucide-react';
import type { GateEntry } from '@/pages/GateMode';

interface GateEntryFeedbackProps {
  entry: GateEntry;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 4000;

const GateEntryFeedback = ({ entry, onDismiss }: GateEntryFeedbackProps) => {
  useEffect(() => {
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [onDismiss, entry.id]);

  const { isRecognized, isLate, studentName, confidence, time, photoUrl } = entry;

  const status = isRecognized ? (isLate ? 'late' : 'present') : 'unknown';

  const palette = {
    present: {
      border: 'border-green-500/50',
      icon:   <CheckCircle2 className="h-8 w-8 text-green-400 flex-shrink-0" />,
      label:  'Welcome!',
      bar:    'bg-green-400',
    },
    late: {
      border: 'border-amber-500/50',
      icon:   <Clock className="h-8 w-8 text-amber-400 flex-shrink-0" />,
      label:  'Late entry',
      bar:    'bg-amber-400',
    },
    unknown: {
      border: 'border-red-500/50',
      icon:   <AlertTriangle className="h-8 w-8 text-red-400 flex-shrink-0" />,
      label:  'Not registered',
      bar:    'bg-red-400',
    },
  }[status];

  const timeStr = time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <motion.div
      key={entry.id}
      initial={{ y: 32, opacity: 0, scale: 0.96 }}
      animate={{ y: 0,  opacity: 1, scale: 1.00 }}
      exit={{    y: 32, opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="absolute bottom-20 sm:bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-[340px] z-20 pointer-events-auto"
    >
      <div
        className={`bg-card/97 backdrop-blur-2xl rounded-2xl border-2 ${palette.border} shadow-2xl overflow-hidden`}
        onClick={onDismiss}
        style={{ cursor: 'pointer' }}
      >
        {/* Progress bar (auto-dismiss timer) */}
        <motion.div
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: AUTO_DISMISS_MS / 1000, ease: 'linear' }}
          className={`h-1 w-full origin-left ${palette.bar}`}
        />

        <div className="flex items-center gap-3 p-4">
          {/* Photo or icon */}
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={studentName}
              className="h-14 w-14 rounded-xl object-cover border border-border flex-shrink-0"
            />
          ) : (
            <div className={`h-14 w-14 rounded-xl flex items-center justify-center flex-shrink-0 ${
              status === 'present' ? 'bg-green-500/15' : status === 'late' ? 'bg-amber-500/15' : 'bg-red-500/15'
            }`}>
              {isRecognized
                ? <UserCircle className={`h-9 w-9 ${status === 'late' ? 'text-amber-400' : 'text-green-400'}`} />
                : <UserCircle className="h-9 w-9 text-red-400" />
              }
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-base text-foreground truncate leading-tight">
                {isRecognized ? studentName : 'Unknown Person'}
              </p>
              {palette.icon}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {palette.label}
              {isRecognized && confidence > 0 && (
                <> · <span className="font-semibold">{(confidence * 100).toFixed(0)}% match</span></>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{timeStr}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default GateEntryFeedback;
