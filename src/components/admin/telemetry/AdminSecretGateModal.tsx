import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Lock, Unlock, Delete, AlertCircle, X, Sparkles, Terminal, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

interface AdminSecretGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlock: () => void;
}

const CORRECT_PIN = '2022';
const MAX_ATTEMPTS = 5;

export const AdminSecretGateModal: React.FC<AdminSecretGateModalProps> = ({
  isOpen,
  onClose,
  onUnlock,
}) => {
  const [pin, setPin] = useState<string>('');
  const [isError, setIsError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [attempts, setAttempts] = useState<number>(0);
  const [isLockedOut, setIsLockedOut] = useState<boolean>(false);
  const [lockoutTimer, setLockoutTimer] = useState<number>(0);
  const { trigger: haptic } = useHapticFeedback();
  const modalRef = useRef<HTMLDivElement>(null);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setPin('');
      setIsError(false);
      setErrorMessage('');
    }
  }, [isOpen]);

  // Lockout countdown timer
  useEffect(() => {
    let timer: any;
    if (isLockedOut && lockoutTimer > 0) {
      timer = setInterval(() => {
        setLockoutTimer((prev) => {
          if (prev <= 1) {
            setIsLockedOut(false);
            setAttempts(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isLockedOut, lockoutTimer]);

  // Physical Keyboard listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLockedOut) return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigitPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleDelete();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleCheckPin(pin);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pin, isLockedOut]);

  const handleDigitPress = (digit: string) => {
    if (isLockedOut || pin.length >= 4) return;
    haptic('light');
    const newPin = pin + digit;
    setPin(newPin);
    setIsError(false);
    setErrorMessage('');

    if (newPin.length === 4) {
      handleCheckPin(newPin);
    }
  };

  const handleDelete = () => {
    if (isLockedOut || pin.length === 0) return;
    haptic('selection');
    setPin((prev) => prev.slice(0, -1));
    setIsError(false);
  };

  const handleClear = () => {
    if (isLockedOut) return;
    haptic('selection');
    setPin('');
    setIsError(false);
    setErrorMessage('');
  };

  const handleCheckPin = (currentPin: string) => {
    if (currentPin === CORRECT_PIN) {
      haptic('success');
      try {
        sessionStorage.setItem('presences_telemetry_unlocked', 'true');
      } catch {}
      onUnlock();
      onClose();
    } else {
      haptic('error');
      setIsError(true);
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);

      if (newAttempts >= MAX_ATTEMPTS) {
        setIsLockedOut(true);
        setLockoutTimer(30);
        setErrorMessage('Too many failed attempts. Console locked for 30s.');
      } else {
        setErrorMessage(`Invalid Security PIN. (${MAX_ATTEMPTS - newAttempts} attempts left)`);
      }

      setTimeout(() => {
        setPin('');
      }, 500);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-2xl">
        <motion.div
          ref={modalRef}
          initial={{ opacity: 0, scale: 0.92, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 15 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className="relative w-full max-w-sm rounded-3xl bg-slate-900/90 dark:bg-slate-950/95 border border-white/15 text-white shadow-2xl overflow-hidden p-6 text-center"
        >
          {/* Subtle Ambient Glow */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header Icon */}
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/25 border border-white/20">
            {isError ? (
              <Lock className="w-7 h-7 text-rose-300 animate-bounce" />
            ) : (
              <Shield className="w-7 h-7 text-white" />
            )}
          </div>

          <h3 className="text-lg font-extrabold tracking-tight text-white flex items-center justify-center gap-2">
            <span>Fleet Intelligence Gate</span>
            <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-bold border border-blue-400/30">
              SECRET
            </span>
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-[260px] mx-auto">
            Enter the 4-digit Master Security PIN to unlock real-time device radar & telemetry.
          </p>

          {/* 4-Digit Pin Dots Indicator */}
          <motion.div
            animate={isError ? { x: [-10, 10, -8, 8, -4, 4, 0] } : {}}
            transition={{ duration: 0.4 }}
            className="flex items-center justify-center gap-3.5 my-6"
          >
            {[0, 1, 2, 3].map((index) => {
              const isFilled = pin.length > index;
              return (
                <div
                  key={index}
                  className={`w-4 h-4 rounded-full transition-all duration-200 border ${
                    isError
                      ? 'bg-rose-500 border-rose-400 shadow-md shadow-rose-500/50 scale-110'
                      : isFilled
                      ? 'bg-gradient-to-r from-blue-400 to-indigo-400 border-white shadow-md shadow-blue-500/50 scale-110'
                      : 'bg-white/5 border-white/20'
                  }`}
                />
              );
            })}
          </motion.div>

          {/* Error / Lockout Banner */}
          {errorMessage && (
            <div className="mb-4 px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center justify-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {isLockedOut && (
            <div className="mb-4 text-xs font-mono text-amber-400">
              Cooldown: {lockoutTimer}s remaining
            </div>
          )}

          {/* Mobile & Touch Optimized Apple Glass Keypad */}
          <div className="grid grid-cols-3 gap-2.5 max-w-[270px] mx-auto select-none">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                type="button"
                disabled={isLockedOut}
                onClick={() => handleDigitPress(String(num))}
                className="h-13 py-3 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 border border-white/10 active:scale-95 transition-all text-xl font-bold text-white shadow-sm flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
              >
                {num}
              </button>
            ))}

            <button
              type="button"
              disabled={isLockedOut || pin.length === 0}
              onClick={handleClear}
              className="h-13 py-3 rounded-2xl bg-white/5 hover:bg-white/15 active:scale-95 transition-all text-xs font-bold text-slate-300 flex items-center justify-center disabled:opacity-20"
            >
              Clear
            </button>

            <button
              type="button"
              disabled={isLockedOut}
              onClick={() => handleDigitPress('0')}
              className="h-13 py-3 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 border border-white/10 active:scale-95 transition-all text-xl font-bold text-white shadow-sm flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
            >
              0
            </button>

            <button
              type="button"
              disabled={isLockedOut || pin.length === 0}
              onClick={handleDelete}
              className="h-13 py-3 rounded-2xl bg-white/5 hover:bg-white/15 active:scale-95 transition-all text-slate-300 flex items-center justify-center disabled:opacity-20"
              title="Backspace"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-5 text-[10px] text-slate-400 flex items-center justify-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Encrypted Telemetry Channel</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default AdminSecretGateModal;
