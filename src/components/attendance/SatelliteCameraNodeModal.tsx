import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, Radio, QrCode, ShieldCheck, CheckCircle2, Zap, ArrowLeft, RefreshCw, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { startSatelliteCameraNode, generatePairingCode } from '@/services/RemoteCameraRelayService';
import { playWinnerCelebrationChime } from '@/utils/audioChimes';
import { supabase } from '@/integrations/supabase/client';

export const SatelliteCameraNodeModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [pairingCode, setPairingCode] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [captureCount, setCaptureCount] = useState(0);
  const [lastCapturedStudent, setLastCapturedStudent] = useState<string | null>(null);
  const stopFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (isOpen) {
      const code = generatePairingCode();
      setPairingCode(code);
      setCaptureCount(0);
      setLastCapturedStudent(null);

      // Acquire wake lock so camera device screen does not sleep
      if ('wakeLock' in navigator) {
        (navigator as any).wakeLock.request('screen').catch(() => {});
      }

      // Initialize camera streaming
      setTimeout(async () => {
        if (!videoRef.current) return;
        try {
          const { stop } = await startSatelliteCameraNode(
            videoRef.current,
            code,
            async (triggerInfo) => {
              playWinnerCelebrationChime();
              setCaptureCount((c) => c + 1);
              toast.success('📷 Remote Attendance Trigger Received', {
                description: `Marked attendance via controller command.`,
              });
            }
          );
          stopFnRef.current = stop;
          setIsStreaming(true);
        } catch (err: any) {
          toast.error('Camera Access Error', {
            description: err.message || 'Please grant camera permission to start satellite node.',
          });
        }
      }, 300);
    }

    return () => {
      if (stopFnRef.current) {
        stopFnRef.current();
        stopFnRef.current = null;
      }
      setIsStreaming(false);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xl">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-xl rounded-3xl bg-slate-900 border border-white/15 text-white p-6 shadow-2xl space-y-4 relative overflow-hidden"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold tracking-tight">Satellite Attendance Camera Node</h3>
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] font-bold">
                  BROADCASTING
                </Badge>
              </div>
              <p className="text-xs text-slate-400">Position this phone/tablet to capture students facing the entrance</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-white rounded-xl">
            Close
          </Button>
        </div>

        {/* Video Preview */}
        <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-white/10 flex items-center justify-center">
          <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover mirror" />

          {/* Overlay UI */}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>LIVE SATELLITE FEED</span>
            </span>
          </div>

          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between p-2.5 rounded-xl bg-slate-950/80 backdrop-blur-md border border-white/15">
            <div className="flex items-center gap-2">
              <QrCode className="w-4 h-4 text-indigo-400" />
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Pairing Code</p>
                <p className="text-sm font-mono font-black text-white">{pairingCode}</p>
              </div>
            </div>

            <div className="text-right">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Remote Captures</p>
              <p className="text-sm font-mono font-black text-emerald-400">{captureCount} students</p>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-slate-300 space-y-1">
          <p className="font-bold text-white flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Ready for Remote Control:</span>
          </p>
          <p className="text-[11px] text-slate-400">
            Open the <strong>Fleet Intelligence Console (Ctrl+Shift+G / PIN: 2022)</strong> or Teacher Portal on your laptop or another phone to view this camera live and trigger attendance captures.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default SatelliteCameraNodeModal;
