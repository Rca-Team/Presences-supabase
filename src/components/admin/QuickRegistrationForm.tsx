import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Camera, Loader2, CheckCircle, User, Upload, RotateCcw, ArrowLeft, ArrowRight, ArrowUp, Eye } from 'lucide-react';
import { registerFace } from '@/services/face-recognition/RegistrationService';
import { 
  loadRegistrationModels, 
  areRegistrationModelsLoaded,
  getFaceDescriptorFromBlob,
  detectFaceInVideo 
} from '@/services/face-recognition/OptimizedRegistrationService';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import ImageCropper from './ImageCropper';
import { cn } from '@/lib/utils';
import { 
  CLASSES, SECTIONS, ALL_CATEGORIES, TRANSPORT_MODES, BLOOD_GROUPS,
  type Category 
} from '@/constants/schoolConfig';

interface ScanDirection {
  id: string;
  label: string;
  instruction: string;
  icon: React.ElementType;
  captured: boolean;
  blob: Blob | null;
  url: string;
  descriptor: Float32Array | null;
}

interface QuickRegistrationFormProps {
  onSuccess?: () => void;
  prefillData?: {
    name?: string;
    employee_id?: string;
    department?: string;
    position?: string;
    category?: Category;
    imageBlob?: Blob;
  };
}

const QuickRegistrationForm: React.FC<QuickRegistrationFormProps> = ({ onSuccess, prefillData }) => {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceDetectionRef = useRef<number | null>(null);
  
  const [formData, setFormData] = useState({
    name: prefillData?.name || '',
    employee_id: prefillData?.employee_id || '',
    roll_number: '',
    parent_phone: '',
    blood_group: '',
    medical_info: '',
    transport_mode: '',
    selectedClass: '6',
    selectedSection: 'A',
    category: prefillData?.category || '6-A' as Category,
  });

  const [scanDirections, setScanDirections] = useState<ScanDirection[]>([
    { id: 'front', label: 'Front', instruction: 'Look straight at the camera', icon: Eye, captured: false, blob: null, url: '', descriptor: null },
    { id: 'left', label: 'Left', instruction: 'Turn your head slightly to the left', icon: ArrowLeft, captured: false, blob: null, url: '', descriptor: null },
    { id: 'right', label: 'Right', instruction: 'Turn your head slightly to the right', icon: ArrowRight, captured: false, blob: null, url: '', descriptor: null },
    { id: 'up', label: 'Up', instruction: 'Tilt your head slightly upward', icon: ArrowUp, captured: false, blob: null, url: '', descriptor: null },
  ]);

  const [currentScanIndex, setCurrentScanIndex] = useState(0);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [modelsReady, setModelsReady] = useState(areRegistrationModelsLoaded());
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [scanMode, setScanMode] = useState<'multi' | 'single'>('multi');
  const [singleImage, setSingleImage] = useState<{ blob: Blob | null; url: string }>({ blob: null, url: '' });
  const [isTeacher, setIsTeacher] = useState(false);

  const capturedCount = scanDirections.filter(d => d.captured).length;
  const scanProgress = (capturedCount / scanDirections.length) * 100;

  // Update category when class/section changes
  useEffect(() => {
    if (!isTeacher) {
      setFormData(prev => ({
        ...prev,
        category: `${prev.selectedClass}-${prev.selectedSection}` as Category,
      }));
    }
  }, [formData.selectedClass, formData.selectedSection, isTeacher]);

  useEffect(() => {
    const loadModels = async () => {
      if (areRegistrationModelsLoaded()) { setModelsReady(true); return; }
      setIsLoadingModels(true);
      try {
        await loadRegistrationModels();
        setModelsReady(true);
      } catch (err) {
        console.error('Model loading error:', err);
        toast({ title: 'Model Loading Failed', description: 'Face detection may not work properly', variant: 'destructive' });
      } finally { setIsLoadingModels(false); }
    };
    loadModels();
    return () => { stopCamera(); if (faceDetectionRef.current) cancelAnimationFrame(faceDetectionRef.current); };
  }, []);

  useEffect(() => {
    if (prefillData) {
      setFormData(prev => ({
        ...prev,
        name: prefillData.name || '',
        employee_id: prefillData.employee_id || '',
        category: prefillData.category || '6-A',
      }));
      if (prefillData.imageBlob) {
        setScanMode('single');
        setSingleImage({ blob: prefillData.imageBlob, url: URL.createObjectURL(prefillData.imageBlob) });
      }
    }
  }, [prefillData]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraActive(true);
        detectFaceLoop();
      }
    } catch {
      toast({ title: "Camera Error", description: "Unable to access camera", variant: "destructive" });
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
    setFaceDetected(false);
  };

  const detectFaceLoop = useCallback(async () => {
    if (!videoRef.current || !modelsReady) return;
    const detect = async () => {
      if (!videoRef.current || !streamRef.current?.active) return;
      try { setFaceDetected(await detectFaceInVideo(videoRef.current)); } catch {}
      if (streamRef.current?.active) faceDetectionRef.current = requestAnimationFrame(detect);
    };
    detect();
  }, [modelsReady]);

  const captureCurrentDirection = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
      if (!blob) return;

      let descriptor: Float32Array | null = null;
      if (modelsReady) {
        const result = await getFaceDescriptorFromBlob(blob);
        if (result) descriptor = result;
        else {
          toast({ title: "No Face Detected", description: "Please position your face clearly and try again.", variant: "destructive" });
          return;
        }
      }

      const url = URL.createObjectURL(blob);
      setScanDirections(prev => prev.map((d, i) =>
        i === currentScanIndex ? { ...d, captured: true, blob, url, descriptor } : d
      ));

      const nextIndex = scanDirections.findIndex((d, i) => i > currentScanIndex && !d.captured);
      if (nextIndex !== -1) {
        setCurrentScanIndex(nextIndex);
      } else {
        const firstUncaptured = scanDirections.findIndex((d, i) => i !== currentScanIndex && !d.captured);
        if (firstUncaptured !== -1) {
          setCurrentScanIndex(firstUncaptured);
        } else {
          stopCamera();
          toast({ title: "All Angles Captured!", description: "4-way face scan complete. Ready to register." });
        }
      }
    }, 'image/jpeg', 0.9);
  }, [currentScanIndex, modelsReady, scanDirections]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSingleImage({ blob: file, url: URL.createObjectURL(file) });
      setScanMode('single');
    }
  };

  const resetScan = () => {
    setScanDirections(prev => prev.map(d => ({ ...d, captured: false, blob: null, url: '', descriptor: null })));
    setCurrentScanIndex(0);
    setSingleImage({ blob: null, url: '' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({ title: "Error", description: "Please enter a name", variant: "destructive" });
      return;
    }

    const hasMultiScan = scanDirections.some(d => d.captured);
    const hasSingleImage = !!singleImage.blob;

    if (!hasMultiScan && !hasSingleImage) {
      toast({ title: "Error", description: "Please capture at least one photo", variant: "destructive" });
      return;
    }

    setIsProcessing(true);
    try {
      const parentContactInfo = formData.parent_phone ? {
        parent_phone: formData.parent_phone,
      } : undefined;

      // Build department string with extra student info
      const extraInfo = [
        formData.roll_number && `Roll: ${formData.roll_number}`,
        formData.blood_group && `Blood: ${formData.blood_group}`,
        formData.transport_mode && `Transport: ${formData.transport_mode}`,
        formData.medical_info && `Medical: ${formData.medical_info}`,
      ].filter(Boolean).join(' | ');

      const department = extraInfo || 'General';

      if (scanMode === 'multi' && hasMultiScan) {
        const frontScan = scanDirections.find(d => d.id === 'front' && d.captured);
        const primaryScan = frontScan || scanDirections.find(d => d.captured)!;
        
        const allDescriptors = scanDirections
          .filter(d => d.captured && d.descriptor)
          .map(d => d.descriptor!);

        let avgDescriptor: Float32Array | undefined;
        if (allDescriptors.length > 0) {
          const len = allDescriptors[0].length;
          avgDescriptor = new Float32Array(len);
          for (let i = 0; i < len; i++) {
            let sum = 0;
            for (const desc of allDescriptors) sum += desc[i];
            avgDescriptor[i] = sum / allDescriptors.length;
          }
        }

        await registerFace(
          primaryScan.blob!,
          formData.name,
          formData.employee_id || `STU-${Date.now()}`,
          department,
          formData.roll_number || 'Student',
          undefined,
          avgDescriptor,
          parentContactInfo,
          formData.category
        );
      } else {
        let descriptor: Float32Array | undefined;
        if (modelsReady && singleImage.blob) {
          const result = await getFaceDescriptorFromBlob(singleImage.blob);
          if (result) descriptor = result;
          else {
            toast({ title: "Warning", description: "No face detected. Try a clearer photo.", variant: "destructive" });
            setIsProcessing(false);
            return;
          }
        }

        await registerFace(
          singleImage.blob!,
          formData.name,
          formData.employee_id || `STU-${Date.now()}`,
          department,
          formData.roll_number || 'Student',
          undefined,
          descriptor,
          parentContactInfo,
          formData.category
        );
      }

      toast({ title: "Registration Successful", description: `${formData.name} registered to ${formData.category}` });
      setFormData({ 
        name: '', employee_id: '', roll_number: '', parent_phone: '',
        blood_group: '', medical_info: '', transport_mode: '',
        selectedClass: formData.selectedClass, selectedSection: formData.selectedSection,
        category: formData.category,
      });
      resetScan();
      onSuccess?.();
    } catch (err) {
      console.error('Registration error:', err);
      toast({ title: "Registration Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setIsProcessing(false); }
  };

  const currentDirection = scanDirections[currentScanIndex];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <User className="h-5 w-5" />
          Student / Teacher Registration
        </CardTitle>
        <CardDescription>
          Register with class, section, and parent details for school attendance
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Scan Mode Toggle */}
          <div className="flex gap-2">
            <Button type="button" variant={scanMode === 'multi' ? 'default' : 'outline'} size="sm" onClick={() => setScanMode('multi')}>
              <Camera className="h-3.5 w-3.5 mr-1.5" />4-Way Scan
            </Button>
            <Button type="button" variant={scanMode === 'single' ? 'default' : 'outline'} size="sm" onClick={() => setScanMode('single')}>
              <Upload className="h-3.5 w-3.5 mr-1.5" />Single Photo
            </Button>
          </div>

          {scanMode === 'multi' ? (
            <>
              {/* Progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Scan Progress</span>
                  <span className="text-sm text-muted-foreground">{capturedCount}/4 angles</span>
                </div>
                <Progress value={scanProgress} className="h-2" />
              </div>

              {/* Direction Indicators */}
              <div className="grid grid-cols-4 gap-2">
                {scanDirections.map((dir, i) => (
                  <button
                    key={dir.id}
                    type="button"
                    onClick={() => {
                      setCurrentScanIndex(i);
                      if (!isCameraActive && !dir.captured) startCamera();
                    }}
                    className={cn(
                      "flex flex-col items-center gap-1 p-2 rounded-lg border transition-all text-xs",
                      i === currentScanIndex && isCameraActive
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : dir.captured
                        ? "border-green-500 bg-green-500/5"
                        : "border-border hover:border-muted-foreground"
                    )}
                  >
                    {dir.captured ? (
                      <img src={dir.url} alt={dir.label} className="w-10 h-10 rounded object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                        <dir.icon className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <span className={cn("font-medium", dir.captured && "text-green-600 dark:text-green-400")}>
                      {dir.label}
                    </span>
                    {dir.captured && <CheckCircle className="w-3 h-3 text-green-500" />}
                  </button>
                ))}
              </div>

              {/* Camera View */}
              <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                {isCameraActive ? (
                  <>
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                    <div className={cn("absolute inset-4 border-2 rounded-xl transition-colors", faceDetected ? "border-green-500" : "border-yellow-500 border-dashed")} />
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur px-3 py-1.5 rounded-full">
                      <div className="flex items-center gap-2">
                        <currentDirection.icon className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">{currentDirection.instruction}</span>
                      </div>
                    </div>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
                      <Button type="button" onClick={captureCurrentDirection} disabled={!faceDetected} size="sm">
                        <Camera className="h-4 w-4 mr-1.5" />{faceDetected ? `Capture ${currentDirection.label}` : 'Position Face'}
                      </Button>
                      <Button type="button" variant="secondary" size="sm" onClick={stopCamera}>Cancel</Button>
                    </div>
                  </>
                ) : capturedCount > 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
                    <div className="grid grid-cols-4 gap-2 w-full max-w-xs">
                      {scanDirections.map(dir => (
                        <div key={dir.id} className={cn("aspect-square rounded-lg overflow-hidden border", dir.captured ? "border-green-500" : "border-dashed border-border")}>
                          {dir.captured ? (
                            <img src={dir.url} alt={dir.label} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-muted flex items-center justify-center">
                              <dir.icon className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      {capturedCount < 4 && (
                        <Button type="button" size="sm" onClick={startCamera}>
                          <Camera className="h-3.5 w-3.5 mr-1.5" />Continue Scan
                        </Button>
                      )}
                      <Button type="button" variant="outline" size="sm" onClick={resetScan}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Reset
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
                    <div className="text-center space-y-1">
                      <Camera className="w-8 h-8 mx-auto text-muted-foreground" />
                      <p className="text-sm font-medium">4-Way Face Scan</p>
                      <p className="text-xs text-muted-foreground">Captures front, left, right & up angles</p>
                    </div>
                    <Button type="button" onClick={startCamera} disabled={isLoadingModels}>
                      {isLoadingModels ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading Models...</>
                      ) : (
                        <><Camera className="h-4 w-4 mr-2" />Start Scan</>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Single Photo Mode */
            <div className="relative aspect-video bg-muted rounded-lg overflow-hidden max-w-sm">
              {isCameraActive ? (
                <>
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                  <div className={cn("absolute inset-4 border-2 rounded-xl transition-colors", faceDetected ? "border-green-500" : "border-yellow-500 border-dashed")} />
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2">
                    <Button type="button" onClick={() => {
                      if (!videoRef.current || !canvasRef.current) return;
                      const v = videoRef.current, c = canvasRef.current;
                      c.width = v.videoWidth; c.height = v.videoHeight;
                      const ctx = c.getContext('2d');
                      if (!ctx) return;
                      ctx.translate(c.width, 0); ctx.scale(-1, 1); ctx.drawImage(v, 0, 0);
                      c.toBlob((blob) => {
                        if (blob) { setSingleImage({ blob, url: URL.createObjectURL(blob) }); stopCamera(); }
                      }, 'image/jpeg', 0.9);
                    }} disabled={!faceDetected} size="sm">
                      <Camera className="h-4 w-4 mr-1.5" />{faceDetected ? 'Capture' : 'Position Face'}
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={stopCamera}>Cancel</Button>
                  </div>
                </>
              ) : singleImage.url ? (
                <div className="relative group">
                  <img src={singleImage.url} alt="Captured" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => { setSingleImage({ blob: null, url: '' }); startCamera(); }}>
                      <Camera className="h-3 w-3 mr-1" />Retake
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
                  <Button type="button" onClick={startCamera} variant="outline">
                    <Camera className="h-4 w-4 mr-2" />Open Camera
                  </Button>
                  <span className="text-sm text-muted-foreground">or</span>
                  <label className="cursor-pointer">
                    <Input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                    <Button type="button" variant="outline" asChild>
                      <span><Upload className="h-4 w-4 mr-2" />Upload Photo</span>
                    </Button>
                  </label>
                </div>
              )}
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />

          {/* Teacher toggle */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isTeacher}
                onChange={(e) => {
                  setIsTeacher(e.target.checked);
                  if (e.target.checked) {
                    setFormData(prev => ({ ...prev, category: 'Teacher' as Category }));
                  } else {
                    setFormData(prev => ({ ...prev, category: `${prev.selectedClass}-${prev.selectedSection}` as Category }));
                  }
                }}
                className="rounded border-border"
              />
              <span className="text-sm font-medium">Register as Teacher</span>
            </label>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input id="name" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="Enter full name" required />
            </div>

            <div>
              <Label htmlFor="employee_id">Student / Staff ID</Label>
              <Input id="employee_id" value={formData.employee_id} onChange={(e) => setFormData(prev => ({ ...prev, employee_id: e.target.value }))} placeholder="Auto-generated if empty" />
            </div>

            <div>
              <Label htmlFor="roll_number">Roll Number</Label>
              <Input id="roll_number" value={formData.roll_number} onChange={(e) => setFormData(prev => ({ ...prev, roll_number: e.target.value }))} placeholder="e.g. 1, 2, 3..." />
            </div>

            {!isTeacher && (
              <>
                <div>
                  <Label>Class *</Label>
                  <Select value={formData.selectedClass} onValueChange={(v) => setFormData(prev => ({ ...prev, selectedClass: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CLASSES.map(cls => (
                        <SelectItem key={cls} value={String(cls)}>Class {cls}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Section *</Label>
                  <Select value={formData.selectedSection} onValueChange={(v) => setFormData(prev => ({ ...prev, selectedSection: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SECTIONS.map(sec => (
                        <SelectItem key={sec} value={sec}>Section {sec}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="col-span-2">
              <Label htmlFor="parent_phone">Parent Phone (with country code)</Label>
              <Input id="parent_phone" value={formData.parent_phone} onChange={(e) => setFormData(prev => ({ ...prev, parent_phone: e.target.value }))} placeholder="+91XXXXXXXXXX" />
            </div>

            <div>
              <Label>Blood Group</Label>
              <Select value={formData.blood_group} onValueChange={(v) => setFormData(prev => ({ ...prev, blood_group: v }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {BLOOD_GROUPS.map(bg => (
                    <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Transport Mode</Label>
              <Select value={formData.transport_mode} onValueChange={(v) => setFormData(prev => ({ ...prev, transport_mode: v }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {TRANSPORT_MODES.map(tm => (
                    <SelectItem key={tm} value={tm}>{tm}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <Label htmlFor="medical_info">Medical Info (optional)</Label>
              <Input id="medical_info" value={formData.medical_info} onChange={(e) => setFormData(prev => ({ ...prev, medical_info: e.target.value }))} placeholder="Allergies, conditions, etc." />
            </div>
          </div>

          {/* Category Badge */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Will register to:</span>
            <Badge variant="secondary" className="text-sm">
              {isTeacher ? 'Teacher' : `Class ${formData.selectedClass} - Section ${formData.selectedSection}`}
            </Badge>
          </div>

          <Button type="submit" className="w-full" disabled={isProcessing || (!scanDirections.some(d => d.captured) && !singleImage.blob)}>
            {isProcessing ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</>
            ) : (
              <><CheckCircle className="h-4 w-4 mr-2" />Register {formData.name || 'Student'}</>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default QuickRegistrationForm;
