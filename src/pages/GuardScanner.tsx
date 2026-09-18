import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  QrCode,
  ShieldCheck,
  ShieldAlert,
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
  Volume2,
  VolumeX,
  Flashlight,
  LogOut,
  Building2,
  User,
  Check,
  ArrowRight,
  Shield,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import jsQR from 'jsqr';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import {
  GatePass,
  fetchAllGatePasses,
  verifyAndExecuteExit,
  subscribeToGatePasses,
} from '@/services/gatePassService';

export const GuardScanner: React.FC = () => {
  const navigate = useNavigate();

  // Guard Session Details
  const [guardName, setGuardName] = useState<string>('Duty Security Officer');
  const [gateName, setGateName] = useState<string>('Main Gate 1');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Scanner & Data State
  const [passes, setPasses] = useState<GatePass[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'camera' | 'search' | 'log'>('camera');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPass, setSelectedPass] = useState<GatePass | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState<boolean>(false);
  const [lastScannedResult, setLastScannedResult] = useState<{
    status: 'success' | 'warning' | 'error';
    message: string;
    pass?: GatePass;
  } | null>(null);

  // Camera Refs & State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const lastScannedCodeRef = useRef<string>('');
  const lastScanTimestampRef = useRef<number>(0);

  // Load user profile name
  useEffect(() => {
    const fetchGuardProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await (supabase as any)
            .from('profiles')
            .select('name, full_name')
            .eq('id', user.id)
            .maybeSingle();

          if (profile?.name || profile?.full_name) {
            setGuardName(profile.name || profile.full_name);
          } else if (user.email) {
            setGuardName(user.email.split('@')[0]);
          }
        }
      } catch (e) {
        console.warn('Could not load guard identity:', e);
      }
    };
    fetchGuardProfile();
  }, []);

  // Text-to-Speech audio announcement
  const speakAnnouncement = useCallback(
    (text: string) => {
      if (!soundEnabled) return;
      try {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 1.05;
          utterance.pitch = 1.0;
          window.speechSynthesis.speak(utterance);
        }
      } catch {
        // speech synthesis fallback
      }
    },
    [soundEnabled]
  );

  // Audio chimes
  const playChime = useCallback(
    (type: 'success' | 'alert' | 'error') => {
      if (!soundEnabled) return;
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        if (type === 'success') {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
          osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.18); // G5
        } else if (type === 'alert') {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
          osc.frequency.linearRampToValueAtTime(349.23, ctx.currentTime + 0.2); // F4
        } else {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(220, ctx.currentTime);
          osc.frequency.linearRampToValueAtTime(164.81, ctx.currentTime + 0.25);
        }

        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.26);
      } catch {
        // restricted
      }
    },
    [soundEnabled]
  );

  // Load passes
  const loadPasses = useCallback(async () => {
    setIsLoading(true);
    try {
      const all = await fetchAllGatePasses();
      setPasses(all);

      if (selectedPass) {
        const updated = all.find((p) => p.id === selectedPass.id);
        if (updated) setSelectedPass(updated);
      }
    } catch (err) {
      console.error('Error loading gate passes:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedPass]);

  useEffect(() => {
    loadPasses();
    const unsub = subscribeToGatePasses(() => {
      loadPasses();
    });
    return unsub;
  }, [loadPasses]);

  // Handle Pass Evaluation when code is identified
  const handlePassScanned = useCallback(
    (codeOrId: string) => {
      const clean = codeOrId.trim();
      let targetCode = clean;

      // Extract if JSON
      if (clean.startsWith('{') && clean.endsWith('}')) {
        try {
          const parsed = JSON.parse(clean);
          if (parsed.passCode) targetCode = parsed.passCode;
          else if (parsed.passId) targetCode = parsed.passId;
        } catch {
          // ignore
        }
      }

      const lower = targetCode.toLowerCase();
      const found = passes.find(
        (p) =>
          p.pass_code.toLowerCase() === lower ||
          p.id.toLowerCase() === lower ||
          p.student_id.toLowerCase() === lower ||
          `pass-${p.student_id}`.toLowerCase() === lower
      );

      if (!found) {
        playChime('error');
        setLastScannedResult({
          status: 'error',
          message: `Unknown code "${targetCode}". No matching school gate pass record found.`,
        });
        toast.error(`Unknown Pass: ${targetCode}`);
        return;
      }

      setSelectedPass(found);

      if (found.status === 'approved') {
        playChime('success');
        speakAnnouncement(`Gate pass verified for ${found.student_name}. Authorized exit.`);
        setLastScannedResult({
          status: 'success',
          message: `Official pass verified! Authorized for early release to ${found.pickup_person_name}.`,
          pass: found,
        });
        toast.success(`Pass Verified: ${found.student_name}`);
      } else if (found.status === 'used') {
        playChime('alert');
        speakAnnouncement(`Warning: Gate pass already used for ${found.student_name}.`);
        setLastScannedResult({
          status: 'warning',
          message: `Pass already used. Student departed at ${format(new Date(found.exit_time || ''), 'hh:mm a')} via ${found.exit_gate || 'Main Gate'}.`,
          pass: found,
        });
        toast.warning(`Already Used: ${found.student_name}`);
      } else if (found.status === 'pending_principal') {
        playChime('alert');
        speakAnnouncement(`Alert: Pass pending Principal approval.`);
        setLastScannedResult({
          status: 'warning',
          message: `Pass verified by Class Teacher (${found.teacher_verified_by || 'Teacher'}), but awaiting final Principal approval.`,
          pass: found,
        });
        toast.warning(`Pending Principal Approval`);
      } else if (found.status === 'pending_teacher' || found.status === 'pending') {
        playChime('error');
        speakAnnouncement(`Alert: Pass not approved.`);
        setLastScannedResult({
          status: 'error',
          message: `Pass not authorized: Awaiting Class Teacher review.`,
          pass: found,
        });
        toast.error(`Awaiting Teacher Review`);
      } else if (found.status === 'rejected') {
        playChime('error');
        speakAnnouncement(`Warning: Pass rejected.`);
        setLastScannedResult({
          status: 'error',
          message: `Pass Rejected: ${found.rejection_reason || 'Disapproved by administration'}.`,
          pass: found,
        });
        toast.error(`Pass Disapproved`);
      } else if (found.status === 'expired') {
        playChime('error');
        setLastScannedResult({
          status: 'error',
          message: `Pass Expired: Exceeded validity time limit.`,
          pass: found,
        });
        toast.error(`Pass Expired`);
      }
    },
    [passes, playChime, speakAnnouncement]
  );

  // Camera Scanning Loop with jsQR
  useEffect(() => {
    if (activeTab !== 'camera') {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      setCameraActive(false);
      return;
    }

    let stream: MediaStream | null = null;
    let isActive = true;

    const startCamera = async () => {
      try {
        setCameraError(null);
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (!isActive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
          setCameraActive(true);
          scanFrame();
        }
      } catch (err: any) {
        console.error('Camera access error:', err);
        setCameraError('Camera access denied or unavailable. Please enable camera permissions.');
        setCameraActive(false);
      }
    };

    const scanFrame = () => {
      if (!isActive) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && video.readyState === video.HAVE_ENOUGH_DATA && canvas) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imgData.data, imgData.width, imgData.height, {
            inversionAttempts: 'dontInvert',
          });

          if (code && code.data) {
            const now = Date.now();
            if (
              code.data !== lastScannedCodeRef.current ||
              now - lastScanTimestampRef.current > 3500
            ) {
              lastScannedCodeRef.current = code.data;
              lastScanTimestampRef.current = now;
              handlePassScanned(code.data);
            }
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(scanFrame);
    };

    startCamera();

    return () => {
      isActive = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      setCameraActive(false);
    };
  }, [activeTab, facingMode, handlePassScanned]);

  // Authorize Exit Execution
  const handleAuthorizeExit = async (pass: GatePass) => {
    setIsAuthorizing(true);
    try {
      const res = await verifyAndExecuteExit(
        pass.id,
        gateName,
        guardName,
        pass.student_image_url,
        `Exit cleared at ${gateName} by ${guardName}`
      );

      if (res.success && res.pass) {
        playChime('success');
        speakAnnouncement(`Departure confirmed for ${pass.student_name}. Turnstile open.`);
        toast.success(`Exit Authorized: ${pass.student_name}`);
        setSelectedPass(res.pass);
        setLastScannedResult({
          status: 'success',
          message: `Exit Stamped! ${pass.student_name} departure recorded in gate log.`,
          pass: res.pass,
        });
        await loadPasses();
      } else {
        playChime('error');
        toast.error(res.message || 'Exit authorization failed');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error processing exit');
    } finally {
      setIsAuthorizing(false);
    }
  };

  // Departed today passes
  const exitedTodayPasses = useMemo(() => {
    return passes.filter((p) => p.status === 'used');
  }, [passes]);

  // Filtered passes for search
  const searchedPasses = useMemo(() => {
    if (!searchQuery.trim()) return passes.slice(0, 15);
    const q = searchQuery.trim().toLowerCase();
    return passes.filter(
      (p) =>
        p.student_name.toLowerCase().includes(q) ||
        p.student_id.toLowerCase().includes(q) ||
        p.pass_code.toLowerCase().includes(q) ||
        p.pickup_person_name.toLowerCase().includes(q) ||
        p.class_section.toLowerCase().includes(q)
    );
  }, [passes, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Security Cockpit Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-black tracking-tight text-white">
                SECURITY GATE PASS SCANNER
              </h1>
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-[10px] font-bold">
                LIVE COCKPIT
              </Badge>
            </div>
            <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
              <span>Officer: <strong className="text-white">{guardName}</strong></span>
              <span>•</span>
              <select
                value={gateName}
                onChange={(e) => setGateName(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-blue-400 focus:ring-0"
              >
                <option value="Main Gate 1">Main Gate 1</option>
                <option value="Turnstile 2 (South)">Turnstile 2 (South)</option>
                <option value="North Gate 3">North Gate 3</option>
                <option value="Admin Block Gate">Admin Block Gate</option>
              </select>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="h-9 w-9 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800"
            title={soundEnabled ? 'Mute Voice' : 'Enable Voice'}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4 text-emerald-400" /> : <VolumeX className="h-4 w-4 text-slate-500" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/login')}
            className="h-9 w-9 rounded-xl text-slate-300 hover:text-rose-400 hover:bg-slate-800"
            title="Logout / Switch User"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Security Stage */}
      <div className="flex-1 p-3 sm:p-5 max-w-5xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Side: Scanner & Search Viewport (7 Cols) */}
        <div className="lg:col-span-7 space-y-3 flex flex-col">
          {/* Navigation Mode Switcher */}
          <div className="grid grid-cols-3 gap-1.5 bg-slate-900 p-1 rounded-2xl border border-slate-800">
            <button
              onClick={() => setActiveTab('camera')}
              className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'camera'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Camera className="h-3.5 w-3.5" /> Camera Scanner
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'search'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Search className="h-3.5 w-3.5" /> Manual Search
            </button>
            <button
              onClick={() => setActiveTab('log')}
              className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'log'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Clock className="h-3.5 w-3.5" /> Gate Log ({exitedTodayPasses.length})
            </button>
          </div>

          {/* TAB 1: CAMERA SCANNER */}
          {activeTab === 'camera' && (
            <Card className="border-slate-800 bg-slate-900/80 overflow-hidden rounded-3xl relative flex-1 min-h-[360px] flex flex-col justify-center shadow-2xl">
              <div className="relative w-full h-[360px] sm:h-[420px] bg-black flex items-center justify-center overflow-hidden">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                  autoPlay
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Reticle Scanner Overlay */}
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                  <div className="relative w-64 h-64 border-2 border-blue-500/60 rounded-3xl flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.3)]">
                    {/* Reticle Corner Brackets */}
                    <div className="absolute top-2 left-2 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-lg" />
                    <div className="absolute top-2 right-2 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-lg" />
                    <div className="absolute bottom-2 left-2 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-lg" />
                    <div className="absolute bottom-2 right-2 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-lg" />

                    {/* Laser scanning line animation */}
                    <div className="absolute inset-x-4 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse shadow-[0_0_12px_cyan]" />

                    <div className="text-[11px] font-bold text-blue-300/80 bg-slate-950/80 px-2.5 py-1 rounded-full border border-blue-500/30">
                      ALIGN GATE PASS QR CODE
                    </div>
                  </div>
                </div>

                {/* Camera Controls Overlay */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5 z-20">
                  <Button
                    size="icon"
                    variant="secondary"
                    onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                    className="h-8 w-8 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700"
                    title="Switch Camera"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {cameraError && (
                  <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center space-y-3 z-30">
                    <ShieldAlert className="h-10 w-10 text-rose-500" />
                    <p className="text-xs font-bold text-rose-400">{cameraError}</p>
                    <Button
                      size="sm"
                      onClick={() => setActiveTab('search')}
                      className="rounded-xl text-xs font-bold bg-blue-600 text-white"
                    >
                      Use Manual Search Instead
                    </Button>
                  </div>
                )}
              </div>

              {/* Fast Direct Pass Code Input under Camera */}
              <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
                <Input
                  placeholder="Or enter Pass Code (e.g. GP-8429) / Student ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchQuery.trim()) {
                      handlePassScanned(searchQuery.trim());
                      setSearchQuery('');
                    }
                  }}
                  className="h-10 text-xs rounded-xl bg-slate-950 border-slate-700 font-mono text-white placeholder:text-slate-500"
                />
                <Button
                  onClick={() => {
                    if (searchQuery.trim()) {
                      handlePassScanned(searchQuery.trim());
                      setSearchQuery('');
                    }
                  }}
                  className="rounded-xl h-10 px-4 text-xs font-bold bg-blue-600 text-white shadow-md shrink-0"
                >
                  Verify
                </Button>
              </div>
            </Card>
          )}

          {/* TAB 2: MANUAL SEARCH */}
          {activeTab === 'search' && (
            <Card className="border-slate-800 bg-slate-900/80 rounded-3xl p-4 space-y-3 flex-1">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search student name, admission no, pass code (GP-XXXX)..."
                  className="h-10 pl-9 text-xs rounded-xl bg-slate-950 border-slate-700 text-white"
                />
              </div>

              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {searchedPasses.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-xs">
                    No matching gate passes found.
                  </div>
                ) : (
                  searchedPasses.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handlePassScanned(p.pass_code)}
                      className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                        selectedPass?.id === p.id
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 rounded-xl border border-slate-700">
                          <AvatarImage src={p.student_image_url} alt={p.student_name} />
                          <AvatarFallback className="rounded-xl bg-slate-800 text-xs font-bold">
                            {p.student_name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{p.student_name}</span>
                            <span className="text-[10px] text-slate-400">Class {p.class_section}</span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Pickup: {p.pickup_person_name} ({p.pickup_person_relation}) • {p.expected_pickup_time}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <Badge
                          variant="outline"
                          className={`font-mono text-[10px] font-bold ${
                            p.status === 'approved'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                              : p.status === 'used'
                              ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40'
                              : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          }`}
                        >
                          {p.pass_code}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          )}

          {/* TAB 3: GATE DEPARTURE LOG */}
          {activeTab === 'log' && (
            <Card className="border-slate-800 bg-slate-900/80 rounded-3xl p-4 space-y-3 flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Today's Gate Exit Log
                </h3>
                <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/40 text-[10px]">
                  {exitedTodayPasses.length} Cleared
                </Badge>
              </div>

              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {exitedTodayPasses.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-xs">
                    No student departures recorded yet on this shift.
                  </div>
                ) : (
                  exitedTodayPasses.map((p) => (
                    <div
                      key={p.id}
                      className="p-3 rounded-2xl border border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{p.student_name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">({p.pass_code})</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Released to <strong className="text-slate-200">{p.pickup_person_name}</strong> ({p.pickup_person_relation})
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-bold text-emerald-400">
                          {p.exit_time ? format(new Date(p.exit_time), 'hh:mm a') : 'Cleared'}
                        </span>
                        <p className="text-[10px] text-slate-500">{p.exit_gate || gateName}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Right Side: Verification Screen & 1-Tap Exit Action (5 Cols) */}
        <div className="lg:col-span-5 space-y-3 flex flex-col">
          {!selectedPass ? (
            <Card className="border-slate-800 bg-slate-900/60 rounded-3xl p-8 flex flex-col items-center justify-center text-center space-y-3 flex-1">
              <div className="w-16 h-16 rounded-3xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-inner">
                <QrCode className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Awaiting Pass Scan</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  Hold parent or student digital gate pass QR code in front of camera or enter the 6-character verification code.
                </p>
              </div>
            </Card>
          ) : (
            <Card
              className={`rounded-3xl border flex-1 flex flex-col justify-between overflow-hidden shadow-2xl transition-all ${
                selectedPass.status === 'approved'
                  ? 'border-emerald-500/40 bg-slate-900'
                  : selectedPass.status === 'used'
                  ? 'border-indigo-500/40 bg-slate-900'
                  : selectedPass.status === 'pending_principal'
                  ? 'border-amber-500/40 bg-slate-900'
                  : 'border-rose-500/40 bg-slate-900'
              }`}
            >
              {/* Verification Header Banner */}
              <div
                className={`p-4 border-b text-xs flex items-center justify-between ${
                  selectedPass.status === 'approved'
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : selectedPass.status === 'used'
                    ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                    : selectedPass.status === 'pending_principal'
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {selectedPass.status === 'approved' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                  ) : selectedPass.status === 'used' ? (
                    <ShieldCheck className="h-5 w-5 text-indigo-400 shrink-0" />
                  ) : selectedPass.status === 'pending_principal' ? (
                    <Clock className="h-5 w-5 text-amber-400 shrink-0 animate-pulse" />
                  ) : (
                    <XCircle className="h-5 w-5 text-rose-400 shrink-0" />
                  )}
                  <div>
                    <p className="font-black text-sm">
                      {selectedPass.status === 'approved'
                        ? 'OFFICIAL PASS VERIFIED ✅'
                        : selectedPass.status === 'used'
                        ? 'ALREADY EXITED 🚪'
                        : selectedPass.status === 'pending_principal'
                        ? 'PENDING PRINCIPAL SEAL ⏳'
                        : 'PASS NOT AUTHORIZED ❌'}
                    </p>
                    <p className="text-[11px] opacity-90">
                      {selectedPass.status === 'approved'
                        ? 'Authorized for early student release'
                        : selectedPass.status === 'used'
                        ? `Departed at ${format(new Date(selectedPass.exit_time || ''), 'hh:mm a')}`
                        : selectedPass.status === 'pending_principal'
                        ? 'Class Teacher verified; awaiting Principal'
                        : selectedPass.rejection_reason || 'Class teacher review required'}
                    </p>
                  </div>
                </div>

                <Badge className="font-mono text-xs font-black px-2.5 py-1 bg-slate-950 text-white border border-slate-700">
                  {selectedPass.pass_code}
                </Badge>
              </div>

              {/* Student & Guardian Visual Verification */}
              <div className="p-4 space-y-4 flex-1">
                {/* Student Profile Card */}
                <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
                  <Avatar className="h-14 w-14 rounded-2xl border-2 border-slate-700 shrink-0">
                    <AvatarImage src={selectedPass.student_image_url} alt={selectedPass.student_name} />
                    <AvatarFallback className="rounded-2xl bg-blue-600 font-black text-white text-base">
                      {selectedPass.student_name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-400">
                      Student Identity
                    </span>
                    <h3 className="text-base font-black text-white truncate">{selectedPass.student_name}</h3>
                    <p className="text-xs text-slate-400 font-medium">
                      Class {selectedPass.class_section} • ID: <strong className="font-mono text-slate-200">{selectedPass.student_id}</strong>
                    </p>
                  </div>
                </div>

                {/* Guardian Authorization Card */}
                <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-400">
                    Authorized Pickup Guardian
                  </span>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Name:</span>
                    <span className="font-bold text-white text-sm">
                      {selectedPass.pickup_person_name} ({selectedPass.pickup_person_relation})
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Phone:</span>
                    <span className="font-mono font-bold text-blue-400">{selectedPass.pickup_person_phone}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">ID Proof:</span>
                    <span className="font-semibold text-slate-300">{selectedPass.pickup_person_id_proof || 'Verified Parent ID'}</span>
                  </div>

                  <div className="flex justify-between items-center pt-1 border-t border-slate-800">
                    <span className="text-slate-400">Reason:</span>
                    <span className="font-medium text-slate-200 text-right truncate max-w-[200px]">
                      {selectedPass.reason_text}
                    </span>
                  </div>
                </div>

                {/* Authority Chain */}
                <div className="p-3 rounded-2xl bg-slate-950/40 border border-slate-800/80 text-[11px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Class Teacher:</span>
                    <span className={selectedPass.teacher_verified_by ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                      {selectedPass.teacher_verified_by ? `✓ ${selectedPass.teacher_verified_by}` : 'Pending'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Principal Office:</span>
                    <span className={selectedPass.principal_approved_by || selectedPass.approved_by ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                      {selectedPass.principal_approved_by || selectedPass.approved_by ? `✓ ${selectedPass.principal_approved_by || selectedPass.approved_by}` : 'Pending'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Button Footer */}
              <div className="p-4 bg-slate-950 border-t border-slate-800">
                {selectedPass.status === 'approved' ? (
                  <Button
                    onClick={() => handleAuthorizeExit(selectedPass)}
                    disabled={isAuthorizing}
                    className="w-full h-14 rounded-2xl text-sm font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-600/30 gap-2"
                  >
                    {isAuthorizing ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" /> Recording Exit...
                      </>
                    ) : (
                      <>
                        <DoorOpen className="h-6 w-6" /> AUTHORIZE EXIT & OPEN TURNSTILE
                      </>
                    )}
                  </Button>
                ) : selectedPass.status === 'used' ? (
                  <div className="text-center py-2 text-xs text-indigo-300 font-bold">
                    ✓ Departure recorded. Student has already exited campus.
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    disabled
                    className="w-full h-12 rounded-2xl text-xs font-bold border-rose-500/30 text-rose-400 bg-rose-500/10"
                  >
                    EXIT CANNOT BE AUTHORIZED (UNAPPROVED)
                  </Button>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default GuardScanner;
