import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Camera, Upload, Loader2, Sparkles, X, CheckCircle2 } from 'lucide-react';

export interface IDCardExtractedFields {
  name?: string;
  employee_id?: string;
  roll_number?: string;
  department?: string;
  position?: string;
  email?: string;
  phone?: string;
  parent_name?: string;
  parent_phone?: string;
  parent_email?: string;
  blood_group?: string;
  address?: string;
  transport_mode?: string;
  student_photo_data_url?: string;
  photo_bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface Props {
  onExtracted: (fields: IDCardExtractedFields) => void;
  extractPhoto?: boolean;
  showExtractedPhotoPreview?: boolean;
}

/**
 * Portrait ID-card scanner that captures a card via camera or upload,
 * sends it to the AI extraction edge function, and returns parsed fields.
 */
const IDCardAutoFillScanner: React.FC<Props> = ({
  onExtracted,
  extractPhoto = true,
  showExtractedPhotoPreview = true,
}) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [lastExtractedPhoto, setLastExtractedPhoto] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const isValidBBox = (bbox: any) => {
    if (!bbox || typeof bbox !== 'object') return false;
    const nums = [bbox.x, bbox.y, bbox.width, bbox.height].map(Number);
    if (nums.some((n) => Number.isNaN(n))) return false;
    const [x, y, width, height] = nums;
    if (width <= 0 || height <= 0) return false;
    return x >= 0 && y >= 0 && x <= 1 && y <= 1 && width <= 1 && height <= 1;
  };

  const extractStudentPhotoFromCard = async (
    cardDataUrl: string,
    bbox?: { x: number; y: number; width: number; height: number }
  ): Promise<string | null> => {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = cardDataUrl;
    });

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;

    // If AI gives a valid normalized bounding box, prefer it.
    let x = Math.round((bbox?.x ?? 0) * w);
    let y = Math.round((bbox?.y ?? 0) * h);
    let cw = Math.round((bbox?.width ?? 0) * w);
    let ch = Math.round((bbox?.height ?? 0) * h);

    // Fallback heuristic for common Indian school ID layout (portrait photo at left block).
    if (!bbox || cw < 40 || ch < 40) {
      x = Math.round(w * 0.03);
      y = Math.round(h * 0.26);
      cw = Math.round(w * 0.24);
      ch = Math.round(h * 0.47);
    }

    // Keep crop inside image boundaries.
    x = Math.max(0, Math.min(x, w - 1));
    y = Math.max(0, Math.min(y, h - 1));
    cw = Math.max(1, Math.min(cw, w - x));
    ch = Math.max(1, Math.min(ch, h - y));

    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 420;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(img, x, y, cw, ch, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.92);
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setShowCamera(false);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1920 } },
      });
      streamRef.current = stream;
      setShowCamera(true);
      // wait next tick so videoRef mounts
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (err) {
      console.error(err);
      toast({ title: 'Camera error', description: 'Could not access camera. Use upload instead.', variant: 'destructive' });
    }
  };

  const captureFromCamera = async () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')!.drawImage(v, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    stopCamera();
    setPreview(dataUrl);
    await runExtraction(dataUrl, 'capture.jpg', 'image/jpeg');
  };

  const handleFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      await runExtraction(dataUrl, file.name, file.type);
    };
    reader.readAsDataURL(file);
  };

  const runExtraction = async (dataUrl: string, fileName: string, fileType: string) => {
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-pdf-users', {
        body: { fileData: dataUrl, fileName, fileType },
      });
      if (error) throw error;
      const user = data?.users?.[0];
      if (!user) {
        toast({ title: 'No data found', description: 'Could not read this card. Try a clearer photo.', variant: 'destructive' });
        return;
      }

      const photoBBox = isValidBBox(user.photo_bbox) ? user.photo_bbox : undefined;
      const extractedPhoto = extractPhoto
        ? await extractStudentPhotoFromCard(dataUrl, photoBBox)
        : null;
      if (extractedPhoto) setLastExtractedPhoto(extractedPhoto);

      onExtracted({
        ...user,
        photo_bbox: photoBBox,
        student_photo_data_url: extractedPhoto || undefined,
      });

      toast({
        title: 'ID Card scanned ✨',
        description: extractedPhoto
          ? `Auto-filled details and extracted student photo for ${user.name || 'student'}.`
          : `Auto-filled details for ${user.name || 'student'}.`,
      });
      setIsOpen(false);
      setPreview(null);
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Scan failed', description: err.message || 'Try again.', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-blue-200 dark:border-blue-900 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/40 dark:to-cyan-950/40 p-4"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
            <CreditCard className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm">Scan ID card to auto-fill</h4>
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Snap a portrait photo of the student ID card and we'll fill in the form for you.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => setIsOpen(true)}
              className="mt-3 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600"
            >
              <Camera className="w-4 h-4 mr-1.5" /> Scan ID Card
            </Button>

      {showExtractedPhotoPreview && lastExtractedPhoto && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-200/70 bg-white/70 dark:bg-slate-900/40 px-2 py-2 w-fit">
                <img src={lastExtractedPhoto} alt="Extracted student" className="h-10 w-8 rounded object-cover border border-border" />
                <p className="text-[11px] text-muted-foreground">Student photo extracted from latest ID scan</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => {
              if (!isProcessing) {
                stopCamera();
                setIsOpen(false);
                setPreview(null);
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-background rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-blue-500" />
                  <h3 className="font-semibold">Scan Student ID</h3>
                </div>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => { stopCamera(); setIsOpen(false); setPreview(null); }}
                  className="p-1 rounded-md hover:bg-muted disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* Portrait card frame */}
                <div className="mx-auto relative bg-slate-900 rounded-xl overflow-hidden" style={{ width: 240, height: 380 }}>
                  {preview ? (
                    <img src={preview} alt="ID preview" className="w-full h-full object-cover" />
                  ) : showCamera ? (
                    <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                      <CreditCard className="w-12 h-12 opacity-40" />
                      <p className="text-xs px-4 text-center">Frame the ID card vertically inside this area</p>
                    </div>
                  )}
                  {/* corner guides */}
                  <div className="pointer-events-none absolute inset-0">
                    {['top-2 left-2 border-t-2 border-l-2', 'top-2 right-2 border-t-2 border-r-2', 'bottom-2 left-2 border-b-2 border-l-2', 'bottom-2 right-2 border-b-2 border-r-2'].map((c) => (
                      <span key={c} className={`absolute w-5 h-5 border-blue-400 ${c}`} />
                    ))}
                  </div>
                  {isProcessing && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white gap-2">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <p className="text-xs">AI reading card…</p>
                    </div>
                  )}
                </div>

                {!preview && !isProcessing && (
                  <div className="grid grid-cols-2 gap-2">
                    {showCamera ? (
                      <Button type="button" onClick={captureFromCamera} className="col-span-2">
                        <CheckCircle2 className="w-4 h-4 mr-1.5" /> Capture
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" onClick={startCamera}>
                        <Camera className="w-4 h-4 mr-1.5" /> Camera
                      </Button>
                    )}
                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="w-4 h-4 mr-1.5" /> Upload
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(f);
                        e.target.value = '';
                      }}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default IDCardAutoFillScanner;