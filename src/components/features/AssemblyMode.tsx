import React, { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Users, Camera, CheckCircle2, XCircle, Play, Square, RotateCcw } from 'lucide-react';
import { loadModels, areModelsLoaded } from '@/services/face-recognition/ModelService';
import { recognizeFace } from '@/services/face-recognition/RecognitionService';
import { supabase } from '@/integrations/supabase/client';
import * as faceapi from 'face-api.js';
import { toast } from 'sonner';

interface DetectedStudent {
  id: string;
  name: string;
  confidence: number;
  time: Date;
}

const AssemblyMode = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [detected, setDetected] = useState<DetectedStudent[]>([]);
  const [totalRegistered, setTotalRegistered] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const detectedIdsRef = useRef<Set<string>>(new Set());

  const startCamera = async () => {
    setIsLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'environment' }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      if (!areModelsLoaded()) await loadModels();
      
      const { count } = await supabase.from('face_descriptors').select('user_id', { count: 'exact', head: true });
      setTotalRegistered(count || 0);
      
      setCameraActive(true);
    } catch {
      toast.error('Camera access denied');
    }
    setIsLoading(false);
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
    setCameraActive(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsScanning(false);
  };

  const scan = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      const detections = await faceapi
        .detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      for (const d of detections) {
        try {
          const result = await recognizeFace(d.descriptor);
          if (result?.recognized && result.employee && !detectedIdsRef.current.has(result.employee.id)) {
            detectedIdsRef.current.add(result.employee.id);
            setDetected(prev => [...prev, {
              id: result.employee!.id,
              name: result.employee!.name,
              confidence: result.confidence,
              time: new Date()
            }]);
          }
        } catch {}
      }
    } catch {}
  }, []);

  const startScanning = () => {
    setIsScanning(true);
    intervalRef.current = setInterval(scan, 500);
    toast.success('Assembly scan started - point camera at students');
  };

  const stopScanning = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsScanning(false);
    toast.info(`Scan complete: ${detected.length} students detected`);
  };

  const reset = () => {
    setDetected([]);
    detectedIdsRef.current.clear();
  };

  const presentPercent = totalRegistered > 0 ? Math.round((detected.length / totalRegistered) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Assembly Mode / सभा मोड
        </h2>
        <p className="text-sm text-muted-foreground">Mass scan during morning assembly to identify missing students</p>
      </div>

      {/* Camera view */}
      <Card>
        <CardContent className="pt-4">
          <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            {!cameraActive && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted">
                <Button onClick={startCamera} disabled={isLoading} size="lg">
                  <Camera className="h-5 w-5 mr-2" />
                  {isLoading ? 'Loading...' : 'Start Camera'}
                </Button>
              </div>
            )}
            {isScanning && (
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-card/80 backdrop-blur px-3 py-1.5 rounded-full">
                <span className="h-2 w-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-xs font-medium text-foreground">Scanning Assembly...</span>
              </div>
            )}
          </div>
          {cameraActive && (
            <div className="flex gap-2 mt-3">
              {!isScanning ? (
                <Button onClick={startScanning} className="flex-1">
                  <Play className="h-4 w-4 mr-1" /> Start Scan
                </Button>
              ) : (
                <Button onClick={stopScanning} variant="destructive" className="flex-1">
                  <Square className="h-4 w-4 mr-1" /> Stop
                </Button>
              )}
              <Button variant="outline" onClick={reset}><RotateCcw className="h-4 w-4" /></Button>
              <Button variant="outline" onClick={stopCamera}>Close Camera</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-green-500">{detected.length}</div>
            <p className="text-xs text-muted-foreground">Present / उपस्थित</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-destructive">{Math.max(0, totalRegistered - detected.length)}</div>
            <p className="text-xs text-muted-foreground">Missing / अनुपस्थित</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-primary">{presentPercent}%</div>
            <p className="text-xs text-muted-foreground">Coverage</p>
          </CardContent>
        </Card>
      </div>

      <Progress value={presentPercent} className="h-3" />

      {/* Detected list */}
      {detected.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Detected Students ({detected.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
              {detected.map(s => (
                <div key={s.id} className="flex items-center gap-2 p-2 rounded bg-green-500/5 text-sm">
                  <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                  <span className="truncate text-foreground">{s.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AssemblyMode;
