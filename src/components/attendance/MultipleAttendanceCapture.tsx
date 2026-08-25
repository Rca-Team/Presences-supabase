import React, { useRef, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useOptimizedFaceRecognition } from '@/hooks/useOptimizedFaceRecognition';
import { DetectedFace } from '@/services/face-recognition/MultipleFaceService';
import { Webcam } from '@/components/ui/webcam';
import { 
  Camera, 
  CameraOff, 
  Users, 
  Zap, 
  TrendingUp, 
  Clock,
  CheckCircle,
  AlertCircle,
  Play,
  Pause,
  RotateCcw
} from 'lucide-react';

interface FaceDisplay {
  id: string;
  name: string;
  status: 'recognized' | 'unrecognized' | 'processing';
  confidence?: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  employee?: any;
}

const MultipleAttendanceCapture: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [isContinuous, setIsContinuous] = useState(false);
  const [displayFaces, setDisplayFaces] = useState<FaceDisplay[]>([]);
  const [sessionStats, setSessionStats] = useState({
    totalProcessed: 0,
    totalRecognized: 0,
    sessionTime: 0
  });
  
  const {
    processFace,
    startContinuousProcessing,
    resetProcessing,
    isProcessing,
    isModelLoading,
    result,
    error,
    processingStats,
    trackingStats
  } = useOptimizedFaceRecognition();

  const continuousProcessingRef = useRef<(() => void) | null>(null);
  const sessionStartTime = useRef<number | null>(null);

  // Monitor video readiness and activate interface
  useEffect(() => {
    const checkVideoReady = () => {
      if (videoRef.current && videoRef.current.readyState >= 2 && videoRef.current.videoWidth > 0) {
        setIsActive(true);
        console.log('Video is ready, activating interface');
      } else {
        setTimeout(checkVideoReady, 500);
      }
    };
    
    const timer = setTimeout(checkVideoReady, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Handle continuous processing
  useEffect(() => {
    if (isContinuous && videoRef.current && isActive) {
      console.log('Starting continuous multiple face processing...');
      sessionStartTime.current = Date.now();
      
      continuousProcessingRef.current = startContinuousProcessing(videoRef.current, {
        enableMultipleFaces: true,
        maxFaces: 60, // Support 50+ faces for classroom
        enableTracking: true,
        skipFrames: true,
        batchProcessing: true
      });
    } else if (continuousProcessingRef.current) {
      console.log('Stopping continuous processing...');
      continuousProcessingRef.current();
      continuousProcessingRef.current = null;
    }

    return () => {
      if (continuousProcessingRef.current) {
        continuousProcessingRef.current();
      }
    };
  }, [isContinuous, isActive, startContinuousProcessing]);

  // Update display when results change
  useEffect(() => {
    if (result?.type === 'multiple' && result.multiple) {
      const newDisplayFaces: FaceDisplay[] = result.multiple.faces.map(face => ({
        id: face.id,
        name: face.recognition?.employee?.name || 'Unknown',
        status: face.recognition?.recognized ? 'recognized' : 'unrecognized',
        confidence: face.recognition?.confidence,
        boundingBox: {
          x: face.boundingBox.x,
          y: face.boundingBox.y,
          width: face.boundingBox.width,
          height: face.boundingBox.height
        },
        employee: face.recognition?.employee
      }));

      setDisplayFaces(newDisplayFaces);
      drawFaceBounds(newDisplayFaces);
      
      // Update session stats
      setSessionStats(prev => ({
        totalProcessed: prev.totalProcessed + result.multiple!.faces.length,
        totalRecognized: prev.totalRecognized + result.multiple!.recognizedFaces.length,
        sessionTime: sessionStartTime.current ? Date.now() - sessionStartTime.current : 0
      }));
    }
  }, [result]);

  // Draw face bounding boxes on canvas
  const drawFaceBounds = (faces: FaceDisplay[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw bounding boxes
    faces.forEach(face => {
      const { x, y, width, height } = face.boundingBox;
      
      // Set color based on recognition status
      ctx.strokeStyle = face.status === 'recognized' ? '#10b981' : '#ef4444';
      ctx.lineWidth = 3;
      
      // Draw rectangle
      ctx.strokeRect(x, y, width, height);
      
      // Draw label background
      const labelText = face.status === 'recognized' ? face.name : 'Unknown';
      const labelWidth = ctx.measureText(labelText).width + 20;
      const labelHeight = 30;
      
      ctx.fillStyle = face.status === 'recognized' ? '#10b981' : '#ef4444';
      ctx.fillRect(x, y - labelHeight, labelWidth, labelHeight);
      
      // Draw label text
      ctx.fillStyle = 'white';
      ctx.font = '14px Arial';
      ctx.fillText(labelText, x + 10, y - 10);
      
      // Draw confidence if available
      if (face.confidence && face.status === 'recognized') {
        const confidenceText = `${Math.round(face.confidence * 100)}%`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = '12px Arial';
        ctx.fillText(confidenceText, x + 10, y + height - 10);
      }
    });
  };

  // Manual single capture - Classroom Snapshot Mode
  const handleCapture = async () => {
    if (!videoRef.current || isProcessing) return;

    console.log('📸 Classroom Snapshot: Capturing all faces...');
    
    await processFace(videoRef.current, {
      enableMultipleFaces: true,
      maxFaces: 60, // Support 50+ faces
      enableTracking: false, // No tracking needed for single snapshot
      batchProcessing: true // Auto-record attendance
    });
  };

  // Toggle continuous processing
  const toggleContinuous = () => {
    if (isContinuous) {
      setIsContinuous(false);
    } else {
      setIsContinuous(true);
      resetProcessing();
      setDisplayFaces([]);
      setSessionStats({ totalProcessed: 0, totalRecognized: 0, sessionTime: 0 });
    }
  };

  // Reset everything
  const handleReset = () => {
    setIsContinuous(false);
    resetProcessing();
    setDisplayFaces([]);
    setSessionStats({ totalProcessed: 0, totalRecognized: 0, sessionTime: 0 });
    sessionStartTime.current = null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Multiple Face Attendance Recognition
            <Badge variant="secondary" className="ml-auto">
              <Zap className="h-3 w-3 mr-1" />
              Optimized
            </Badge>
          </CardTitle>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Camera Feed */}
        <div className="lg:col-span-2 space-y-4 order-2 lg:order-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Live Camera Feed
                </span>
                {isActive && (
                  <Badge variant={isContinuous ? "default" : "secondary"}>
                    {isContinuous ? 'Continuous' : 'Manual'}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Webcam
                  ref={videoRef}
                  className="w-full h-auto rounded-lg"
                  autoStart={true}
                />
                
                {/* Overlay canvas for face bounds */}
                {isActive && (
                  <canvas
                    ref={canvasRef}
                    className="absolute top-0 left-0 w-full h-full pointer-events-none"
                    width={640}
                    height={480}
                  />
                )}
                
                {/* Processing overlay */}
                {isProcessing && (
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center rounded-lg">
                    <div className="bg-white/90 backdrop-blur-sm rounded-lg p-4">
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                        <span>Processing faces...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <Button
                  onClick={handleCapture}
                  disabled={!isActive || isModelLoading || isProcessing || isContinuous}
                  className="flex-1"
                  size="lg"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">📸 Classroom Snapshot (50+ Faces)</span>
                  <span className="sm:hidden">Snapshot</span>
                </Button>
                
                <Button
                  onClick={toggleContinuous}
                  disabled={!isActive || isModelLoading}
                  variant={isContinuous ? "destructive" : "default"}
                  className="flex-1"
                >
                  {isContinuous ? (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">Stop Continuous</span>
                      <span className="sm:hidden">Stop</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">Start Continuous</span>
                      <span className="sm:hidden">Start</span>
                    </>
                  )}
                </Button>
                
                <Button
                  onClick={handleReset}
                  variant="outline"
                  className="sm:w-auto"
                >
                  <RotateCcw className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Reset</span>
                </Button>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Stats and Results */}
        <div className="space-y-4 order-1 lg:order-2">
          {/* Performance Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Avg Processing Time</span>
                  <span className="font-mono">{processingStats.averageProcessingTime}ms</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Recognition Rate</span>
                  <span className="font-mono">{processingStats.recognitionRate}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Active Faces</span>
                  <span className="font-mono">{trackingStats.activeFaces}</span>
                </div>
              </div>
              
              <Progress 
                value={processingStats.recognitionRate} 
                className="h-2"
              />
            </CardContent>
          </Card>

          {/* Session Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Session Stats
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Faces Processed</span>
                <span className="font-mono">{sessionStats.totalProcessed}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Recognized</span>
                <span className="font-mono">{sessionStats.totalRecognized}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Session Time</span>
                <span className="font-mono">
                  {Math.floor(sessionStats.sessionTime / 1000)}s
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Current Faces */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Detected Faces ({displayFaces.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {displayFaces.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No faces detected
                  </p>
                ) : (
                  displayFaces.map(face => (
                    <div
                      key={face.id}
                      className="flex items-center justify-between p-2 rounded-lg border"
                    >
                      <div className="flex items-center gap-2">
                        {face.status === 'recognized' ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span className="text-sm font-medium">
                          {face.name}
                        </span>
                      </div>
                      {face.confidence && (
                        <Badge variant="outline" className="text-xs">
                          {Math.round(face.confidence * 100)}%
                        </Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default MultipleAttendanceCapture;