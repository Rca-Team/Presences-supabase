import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  QrCode,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Phone,
  Search,
  Camera,
  DoorOpen,
  Loader2,
  Clock,
  UserCheck,
  Calendar,
  XCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import jsQR from 'jsqr';
import {
  GatePass,
  fetchAllGatePasses,
  verifyAndExecuteExit,
  subscribeToGatePasses,
} from '@/services/gatePassService';

interface GatePassScannerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gateName?: string;
  guardName?: string;
  onExitLogged?: (studentName: string) => void;
}

export const GatePassScannerModal: React.FC<GatePassScannerModalProps> = ({
  open,
  onOpenChange,
  gateName = 'Main Security Gate',
  guardName = 'Gate Security Officer',
  onExitLogged,
}) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'code' | 'camera'>('queue');
  const [passes, setPasses] = useState<GatePass[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [selectedPass, setSelectedPass] = useState<GatePass | null>(null);
  const [isProcessingExit, setIsProcessingExit] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Play exit audio tone
  const playExitTone = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.26);
    } catch {
      // Audio context might be restricted
    }
  }, []);

  const loadPasses = useCallback(async () => {
    setLoading(true);
    try {
      const all = await fetchAllGatePasses();
      // Sort newest first
      all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setPasses(all);

      // Keep selectedPass synced if currently viewing
      if (selectedPass) {
        const updated = all.find(p => p.id === selectedPass.id);
        if (updated) setSelectedPass(updated);
      }
    } catch (err) {
      console.error('Error loading gate passes:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedPass]);

  useEffect(() => {
    if (open) {
      loadPasses();
      const unsub = subscribeToGatePasses(() => {
        loadPasses();
      });
      return () => {
        unsub();
      };
    }
  }, [open, loadPasses]);

  // Camera QR scanning loop
  useEffect(() => {
    if (!open || activeTab !== 'camera') {
      // Stop camera stream
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      setCameraActive(false);
      return;
    }

    let stream: MediaStream | null = null;
    const startScanner = async () => {
      try {
        setCameraError(null);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setCameraActive(true);
          scanFrame();
        }
      } catch (err: any) {
        console.error('Camera access error:', err);
        setCameraError('Unable to access camera for QR scanning. Please use Pass Code search.');
      }
    };

    const scanFrame = () => {
      if (videoRef.current && canvasRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });

          if (code && code.data) {
            handleScanSuccess(code.data.trim());
            return; // stop scanning after detection
          }
        }
      }
      animFrameRef.current = requestAnimationFrame(scanFrame);
    };

    startScanner();

    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [open, activeTab]);

  const handleScanSuccess = (scannedValue: string) => {
    // Try to match either pass.id or pass.pass_code
    const matched = passes.find(
      p =>
        p.id.toLowerCase() === scannedValue.toLowerCase() ||
        p.pass_code?.toLowerCase() === scannedValue.toLowerCase() ||
        scannedValue.toLowerCase().includes(p.id.toLowerCase()) ||
        (p.pass_code && scannedValue.toLowerCase().includes(p.pass_code.toLowerCase()))
    );

    if (matched) {
      toast.success(`Found Gate Pass for ${matched.student_name}!`);
      setSelectedPass(matched);
      setActiveTab('queue');
    } else {
      toast.error(`No matching pass found for code: "${scannedValue}".`);
    }
  };

  const handleManualCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = manualCode.trim().toUpperCase();
    if (!q) return;

    const matched = passes.find(
      p =>
        p.pass_code?.toUpperCase() === q ||
        p.id.toUpperCase() === q ||
        p.student_name.toUpperCase().includes(q) ||
        p.roll_number?.toUpperCase() === q
    );

    if (matched) {
      setSelectedPass(matched);
      toast.success(`Found Gate Pass for ${matched.student_name}`);
    } else {
      toast.error(`No gate pass found matching "${q}"`);
    }
  };

  const handleAuthorizeExit = async (pass: GatePass) => {
    if (pass.status !== 'approved') {
      toast.error(`Cannot authorize exit. Status is currently "${pass.status.toUpperCase()}". Requires teacher approval.`);
      return;
    }

    setIsProcessingExit(true);
    try {
      const result = await verifyAndExecuteExit(pass.id, gateName, guardName);
      if (result.success && result.pass) {
        playExitTone();
        toast.success(`Turnstile Exit Authorized! ${result.pass.student_name} departure recorded.`);
        setSelectedPass(result.pass);
        if (onExitLogged) {
          onExitLogged(result.pass.student_name);
        }
        await loadPasses();
      } else {
        toast.error(result.error || 'Failed to authorize exit.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error processing exit verification.');
    } finally {
      setIsProcessingExit(false);
    }
  };

  // Filtered passes for today's queue
  const filteredPasses = passes.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.student_name.toLowerCase().includes(q) ||
      (p.pass_code && p.pass_code.toLowerCase().includes(q)) ||
      (p.class && p.class.toLowerCase().includes(q)) ||
      (p.guardian_name && p.guardian_name.toLowerCase().includes(q))
    );
  });

  const approvedCount = passes.filter(p => p.status === 'approved').length;
  const pendingCount = passes.filter(p => p.status === 'pending').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-full max-h-[92vh] flex flex-col p-0 overflow-hidden bg-card/95 backdrop-blur-2xl border-border/80 shadow-2xl rounded-3xl">
        {/* Top Header */}
        <DialogHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-inner">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-black tracking-tight text-foreground flex items-center gap-2">
                  <span>Security Gate Turnstile Clearance</span>
                  <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/30 text-primary font-bold">
                    {gateName}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Verify approved student gate passes & log physical departure via campus gates
                </DialogDescription>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={loadPasses}
              disabled={loading}
              className="h-8 px-2 rounded-xl text-xs gap-1 text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center gap-2 mt-3 pt-2">
            <Button
              variant={activeTab === 'queue' ? 'default' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab('queue')}
              className="h-8 text-xs rounded-xl font-bold gap-1.5"
            >
              <UserCheck className="h-3.5 w-3.5" />
              <span>Active Passes</span>
              {approvedCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-emerald-500 text-white rounded-full text-[10px] font-black">
                  {approvedCount}
                </span>
              )}
            </Button>

            <Button
              variant={activeTab === 'code' ? 'default' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab('code')}
              className="h-8 text-xs rounded-xl font-bold gap-1.5"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Pass Code Entry</span>
            </Button>

            <Button
              variant={activeTab === 'camera' ? 'default' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab('camera')}
              className="h-8 text-xs rounded-xl font-bold gap-1.5"
            >
              <Camera className="h-3.5 w-3.5" />
              <span>QR Scanner</span>
            </Button>
          </div>
        </DialogHeader>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* TAB 1: PASS QUEUE & ACTIVE SELECTION */}
          {activeTab === 'queue' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Left Column: Pass List (5 cols) */}
              <div className="md:col-span-5 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search student, pass code..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="h-8 pl-8 text-xs rounded-xl bg-background/50 border-border/70"
                  />
                </div>

                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {loading && passes.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                      Loading gate passes...
                    </div>
                  ) : filteredPasses.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground border border-dashed rounded-2xl p-4">
                      No active gate passes found today.
                    </div>
                  ) : (
                    filteredPasses.map(pass => {
                      const isSelected = selectedPass?.id === pass.id;
                      return (
                        <div
                          key={pass.id}
                          onClick={() => setSelectedPass(pass)}
                          className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-primary/10 border-primary shadow-sm ring-1 ring-primary/20'
                              : 'bg-card hover:bg-muted/40 border-border/60'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8 rounded-xl">
                                <AvatarFallback className="text-[10px] font-bold bg-muted">
                                  {pass.student_name.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <h4 className="text-xs font-bold text-foreground line-clamp-1">
                                  {pass.student_name}
                                </h4>
                                <p className="text-[10px] text-muted-foreground">
                                  Class {pass.class}-{pass.section} {pass.roll_number ? `• Roll ${pass.roll_number}` : ''}
                                </p>
                              </div>
                            </div>

                            <Badge
                              variant="outline"
                              className={`text-[9px] font-extrabold uppercase shrink-0 ${
                                pass.status === 'approved'
                                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                                  : pass.status === 'used'
                                  ? 'bg-purple-500/10 text-purple-600 border-purple-500/30'
                                  : pass.status === 'rejected'
                                  ? 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                                  : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                              }`}
                            >
                              {pass.status}
                            </Badge>
                          </div>

                          <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground">
                            <span className="font-mono font-bold text-foreground/80">{pass.pass_code}</span>
                            <span>Pickup: {pass.guardian_name}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column: Selected Pass Verification Details (7 cols) */}
              <div className="md:col-span-7">
                {selectedPass ? (
                  <Card className="border-border/80 shadow-md bg-card/60 backdrop-blur-xl rounded-2xl overflow-hidden">
                    {/* Status Strip */}
                    <div
                      className={`p-3 flex items-center justify-between border-b ${
                        selectedPass.status === 'approved'
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                          : selectedPass.status === 'used'
                          ? 'bg-purple-500/15 border-purple-500/30 text-purple-700 dark:text-purple-300'
                          : selectedPass.status === 'rejected'
                          ? 'bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300'
                          : 'bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {selectedPass.status === 'approved' ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : selectedPass.status === 'used' ? (
                          <ShieldCheck className="h-4 w-4" />
                        ) : selectedPass.status === 'rejected' ? (
                          <XCircle className="h-4 w-4" />
                        ) : (
                          <AlertTriangle className="h-4 w-4" />
                        )}
                        <span className="text-xs font-black tracking-wide uppercase">
                          {selectedPass.status === 'approved'
                            ? 'Approved for Turnstile Clearance'
                            : selectedPass.status === 'used'
                            ? `Exited at ${new Date(selectedPass.exit_verified_at || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : selectedPass.status === 'rejected'
                            ? 'Exit Denied / Rejected'
                            : 'Pending Teacher Sign-off'}
                        </span>
                      </div>
                      <span className="font-mono font-black text-xs">{selectedPass.pass_code}</span>
                    </div>

                    <CardContent className="p-4 space-y-3.5">
                      {/* Student Card */}
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12 rounded-2xl border-2 border-border/80 shadow-sm">
                          <AvatarFallback className="text-sm font-black bg-primary/10 text-primary">
                            {selectedPass.student_name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="text-sm font-black text-foreground">{selectedPass.student_name}</h3>
                          <p className="text-xs text-muted-foreground font-medium">
                            Class {selectedPass.class}-{selectedPass.section} • Roll #{selectedPass.roll_number || 'N/A'}
                          </p>
                          <p className="text-[11px] text-primary font-mono mt-0.5">
                            Pass ID: {selectedPass.id.slice(0, 13)}...
                          </p>
                        </div>
                      </div>

                      {/* Guardian & Pickup Info */}
                      <div className="bg-muted/40 p-3 rounded-xl space-y-1.5 text-xs">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                          Authorized Guardian for Pickup
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-foreground">{selectedPass.guardian_name} ({selectedPass.relationship})</span>
                          <a
                            href={`tel:${selectedPass.guardian_phone}`}
                            className="inline-flex items-center gap-1 text-[11px] text-primary font-bold hover:underline"
                          >
                            <Phone className="h-3 w-3" />
                            {selectedPass.guardian_phone}
                          </a>
                        </div>
                      </div>

                      {/* Reason & Medical Info */}
                      <div className="space-y-1 text-xs">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                          Reason for Departure
                        </span>
                        <div className="p-2.5 rounded-xl border bg-background/50">
                          <Badge variant="secondary" className="text-[10px] font-bold mb-1">
                            {selectedPass.reason}
                          </Badge>
                          <p className="text-xs text-foreground/90">{selectedPass.reason_detail}</p>
                        </div>
                      </div>

                      {/* Approval Metadata */}
                      {selectedPass.approved_by && (
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          <span>
                            Approved by <strong className="text-foreground">{selectedPass.approved_by}</strong> on{' '}
                            {new Date(selectedPass.approved_at || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      )}

                      {/* Exit Authorization Button */}
                      <div className="pt-2">
                        {selectedPass.status === 'approved' ? (
                          <Button
                            size="lg"
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl gap-2 shadow-lg shadow-emerald-600/25 h-11 transition-transform active:scale-[0.98]"
                            onClick={() => handleAuthorizeExit(selectedPass)}
                            disabled={isProcessingExit}
                          >
                            {isProcessingExit ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <DoorOpen className="h-4 w-4" />
                            )}
                            Authorize & Record Physical Exit
                          </Button>
                        ) : selectedPass.status === 'used' ? (
                          <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-center text-xs font-bold text-purple-700 dark:text-purple-300">
                            Student departed through {selectedPass.exit_gate || gateName} at{' '}
                            {new Date(selectedPass.exit_verified_at || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        ) : (
                          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center text-xs text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="h-4 w-4 mx-auto mb-1" />
                            Cannot clear exit: Pass has not been approved by class teacher.
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="h-full min-h-[300px] border border-dashed rounded-2xl flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                    <ShieldCheck className="h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-xs font-semibold">No pass selected</p>
                    <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
                      Select a pass from the queue or switch to Pass Code Entry / QR Scanner to verify.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: PASS CODE SEARCH */}
          {activeTab === 'code' && (
            <div className="max-w-md mx-auto py-6 space-y-4 text-center">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                <Search className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Search by Pass Code</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Enter the 6-character code (e.g., GP-8429) shown on parent's mobile slip
                </p>
              </div>

              <form onSubmit={handleManualCodeSubmit} className="space-y-3">
                <Input
                  placeholder="e.g. GP-8429"
                  value={manualCode}
                  onChange={e => setManualCode(e.target.value)}
                  className="h-12 text-center text-lg font-mono font-black uppercase tracking-widest rounded-2xl border-primary/30 focus-visible:ring-primary"
                  autoFocus
                />
                <Button type="submit" className="w-full h-10 rounded-xl font-bold gap-1.5">
                  <Search className="h-4 w-4" /> Search Pass
                </Button>
              </form>
            </div>
          )}

          {/* TAB 3: QR CAMERA SCANNER */}
          {activeTab === 'camera' && (
            <div className="max-w-md mx-auto py-4 space-y-3 text-center">
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border-2 border-dashed border-primary/40 flex items-center justify-center">
                <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                <canvas ref={canvasRef} className="hidden" />

                {/* Reticle / Target overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-48 h-48 border-2 border-primary/80 rounded-2xl relative shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-primary -translate-x-1 -translate-y-1" />
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-primary translate-x-1 -translate-y-1" />
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-primary -translate-x-1 translate-y-1" />
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-primary translate-x-1 translate-y-1" />
                  </div>
                </div>

                {!cameraActive && !cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-xs">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Initializing Camera...
                  </div>
                )}
              </div>

              {cameraError ? (
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-xs text-destructive">
                  {cameraError}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Align parent's Pass QR code inside the target reticle
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
