import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, RefreshCw, X, ArrowUpCircle, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppUpdate } from '@/hooks/useAppUpdate';

export const MobileAppUpdateBanner: React.FC = () => {
  const { hasUpdate, updateDetails, isUpdating, applyUpdate, dismissUpdate } = useAppUpdate();

  if (!hasUpdate) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="fixed bottom-20 md:bottom-6 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-sm z-[9999] pointer-events-auto"
      >
        <div className="relative overflow-hidden rounded-2xl border border-blue-500/40 bg-slate-900/95 text-white p-3.5 sm:p-4 shadow-2xl backdrop-blur-2xl">
          {/* Subtle Ambient Backing Glow */}
          <div className="absolute -top-12 -right-12 w-28 h-28 rounded-full bg-blue-500/30 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-24 h-24 rounded-full bg-emerald-500/20 blur-xl pointer-events-none" />

          {/* Dismiss button */}
          <button
            onClick={dismissUpdate}
            className="absolute right-2.5 top-2.5 rounded-full p-1 text-slate-400 hover:text-white transition-colors"
            title="Dismiss update notice"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          <div className="flex items-start gap-3">
            {/* App Update Icon */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-500/25 border border-white/10">
              <Zap className="h-5 w-5 text-white fill-current" />
            </div>

            <div className="flex-1 pr-4 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-black tracking-tight text-white">
                  {updateDetails?.title || 'New Update Available'}
                </span>
                {updateDetails?.version && (
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-blue-500/25 text-blue-300 border border-blue-400/30">
                    {updateDetails.version}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed line-clamp-2">
                {updateDetails?.description || 'Fresh performance upgrades and new features are ready.'}
              </p>
            </div>
          </div>

          {/* Action Row */}
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              onClick={applyUpdate}
              disabled={isUpdating}
              className="flex-1 h-8 rounded-xl text-xs font-bold bg-blue-500 hover:bg-blue-600 text-white shadow-md shadow-blue-500/20 gap-1.5 transition-all"
            >
              {isUpdating ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <>
                  <ArrowUpCircle className="h-3.5 w-3.5" />
                  <span>Update Now</span>
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={dismissUpdate}
              className="h-8 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/10 px-3"
            >
              Later
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default MobileAppUpdateBanner;
