import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Radio, QrCode, ShieldCheck, CheckCircle2, Zap, Play, RefreshCw, Smartphone, Users, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  subscribeToSatelliteNodes,
  dispatchRemoteCaptureCommand,
  CameraNodeStatus,
} from '@/services/RemoteCameraRelayService';
import { playWinnerCelebrationChime, playQuietAlertTone } from '@/utils/audioChimes';
import { supabase } from '@/integrations/supabase/client';

export const RemoteCameraRelayController: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const [activeNodes, setActiveNodes] = useState<Record<string, CameraNodeStatus>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureLog, setCaptureLog] = useState<Array<{ id: string; time: string; text: string }>>([]);

  // Subscribe to live frame updates from satellite cameras
  useEffect(() => {
    if (!isOpen) return;

    const unsubscribe = subscribeToSatelliteNodes((status) => {
      setActiveNodes((prev) => ({
        ...prev,
        [status.nodeId]: status,
      }));
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  const nodeList = Object.values(activeNodes);
  const selectedNode = selectedNodeId ? activeNodes[selectedNodeId] : nodeList[0] || null;

  const handleRemoteTrigger = async (pairingCode: string, nodeId: string) => {
    setIsCapturing(true);
    try {
      await dispatchRemoteCaptureCommand(pairingCode, nodeId);
      playWinnerCelebrationChime();
      toast.success('📷 Remote Attendance Capture Triggered', {
        description: `Dispatched capture command to Camera Station (${pairingCode}).`,
      });

      const logItem = {
        id: 'log_' + Date.now(),
        time: new Date().toLocaleTimeString(),
        text: `Triggered remote scan on node ${pairingCode}`,
      };
      setCaptureLog((prev) => [logItem, ...prev.slice(0, 10)]);
    } catch (err: any) {
      toast.error('Trigger Failed', { description: err.message || 'Could not communicate with camera station.' });
    } finally {
      setTimeout(() => setIsCapturing(false), 800);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xl">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-white/15 text-white p-6 shadow-2xl space-y-4 relative overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Radio className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold tracking-tight">Cross-Device Remote Camera Relay</h3>
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] font-bold">
                  {nodeList.length} Station{nodeList.length !== 1 ? 's' : ''} Online
                </Badge>
              </div>
              <p className="text-xs text-slate-400">View live camera streams & mark attendance from any paired device</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-white rounded-xl">
            Close
          </Button>
        </div>

        {/* Satellite Node Selector */}
        {nodeList.length > 0 ? (
          <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {nodeList.map((node) => {
                const isSelected = selectedNode?.nodeId === node.nodeId;
                return (
                  <button
                    key={node.nodeId}
                    type="button"
                    onClick={() => setSelectedNodeId(node.nodeId)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 shrink-0 ${
                      isSelected
                        ? 'bg-indigo-600/30 border-indigo-500 text-white shadow-md'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Station {node.pairingCode}</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  </button>
                );
              })}
            </div>

            {/* Live Camera Viewport */}
            {selectedNode && (
              <div className="space-y-3">
                <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-white/15 flex items-center justify-center">
                  {selectedNode.lastFrameSnapshot ? (
                    <img
                      src={selectedNode.lastFrameSnapshot}
                      alt="Remote Camera Feed"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center p-6 text-slate-400">
                      <Camera className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-xs">Connecting to video feed from {selectedNode.pairingCode}...</p>
                    </div>
                  )}

                  {/* Top Overlay Badge */}
                  <div className="absolute top-3 left-3 flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>RELAY ACTIVE ({selectedNode.pairingCode})</span>
                    </span>
                  </div>

                  {/* Bottom Controls */}
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between p-2.5 rounded-xl bg-slate-950/80 backdrop-blur-md border border-white/15">
                    <div className="text-xs">
                      <p className="text-[10px] text-slate-400 uppercase font-bold">Node Resolution</p>
                      <p className="font-mono font-bold text-white">{selectedNode.resolution?.width}x{selectedNode.resolution?.height}</p>
                    </div>

                    <Button
                      size="sm"
                      disabled={isCapturing}
                      onClick={() => handleRemoteTrigger(selectedNode.pairingCode, selectedNode.nodeId)}
                      className="rounded-xl text-xs font-extrabold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/30 active:scale-95"
                    >
                      <Camera className="w-3.5 h-3.5 mr-1.5" />
                      {isCapturing ? 'Scanning...' : 'Trigger Remote Attendance'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <Card className="p-8 text-center bg-white/5 border-white/10 text-white space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mx-auto text-slate-400">
              <Camera className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold">No Satellite Camera Stations Connected</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              To turn any mobile phone, tablet, or gate terminal into a wireless camera station, click <strong>"Start Camera Station"</strong> or navigate to <strong>/attendance</strong> on that device.
            </p>
          </Card>
        )}

        {/* Recent Remote Activity */}
        {captureLog.length > 0 && (
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-xs space-y-1">
            <p className="text-[10px] font-bold uppercase text-slate-400">Recent Remote Captures</p>
            {captureLog.map((log) => (
              <div key={log.id} className="flex items-center justify-between text-slate-300">
                <span>{log.text}</span>
                <span className="text-[10px] font-mono text-slate-400">{log.time}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default RemoteCameraRelayController;
