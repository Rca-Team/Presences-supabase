import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { registerFace } from '@/services/face-recognition/RegistrationService';
import { 
  loadRegistrationModels, 
  areRegistrationModelsLoaded,
  getFaceDescriptorFromBlob 
} from '@/services/face-recognition/OptimizedRegistrationService';
import * as faceapi from 'face-api.js';
import Webcam from 'react-webcam';
import {
  Upload,
  Camera,
  Sparkles,
  User,
  CreditCard,
  CheckCircle,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  RefreshCw,
  Wand2,
  ScanLine,
  UserCheck,
  X,
  Plus,
  Trash2,
  Video,
  ImagePlus,
  FileStack,
  Zap,
  Eye,
  Play,
  Pause,
  RotateCcw,
  Check,
  ChevronLeft,
  ChevronRight,
  Grid3x3
} from 'lucide-react';

interface ExtractedStudent {
  id: string;
  name: string;
  employee_id: string;
  department: string;
  position: string;
  photo_description?: string;
  imageBlob?: Blob;
  previewUrl?: string;
  faceDetected: boolean;
  confidence?: number;
  status: 'pending' | 'processing' | 'success' | 'error';
  errorMessage?: string;
}

const BatchIDCardExtractor: React.FC = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const webcamRef = useRef<Webcam>(null);
  
  const [mode, setMode] = useState<'upload' | 'camera'>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isBatchRegistering, setIsBatchRegistering] = useState(false);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const [students, setStudents] = useState<ExtractedStudent[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(areRegistrationModelsLoaded());
  const [showCamera, setShowCamera] = useState(false);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [scanningFace, setScanningFace] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  useEffect(() => {
    if (!modelsLoaded) {
      loadRegistrationModels().then(() => setModelsLoaded(true));
    }
  }, [modelsLoaded]);

  const extractFaceFromImage = useCallback(async (imageBlob: Blob): Promise<{faceBlob: Blob | null, detected: boolean}> => {
    if (!modelsLoaded) {
      await loadRegistrationModels();
      setModelsLoaded(true);
    }
    
    return new Promise((resolve) => {
      const img = document.createElement('img');
      img.onload = async () => {
        try {
          const detection = await faceapi
            .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ 
              inputSize: 416, 
              scoreThreshold: 0.4 
            }))
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (!detection) {
            resolve({ faceBlob: null, detected: false });
            return;
          }

          const box = detection.detection.box;
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          const padding = Math.min(box.width, box.height) * 0.4;
          const x = Math.max(0, box.x - padding);
          const y = Math.max(0, box.y - padding);
          const width = Math.min(img.width - x, box.width + padding * 2);
          const height = Math.min(img.height - y, box.height + padding * 2);

          canvas.width = width;
          canvas.height = height;
          ctx?.drawImage(img, x, y, width, height, 0, 0, width, height);

          canvas.toBlob((blob) => {
            resolve({ faceBlob: blob, detected: true });
          }, 'image/jpeg', 0.9);
        } catch (err) {
          console.error('Face detection error:', err);
          resolve({ faceBlob: null, detected: false });
        }
      };
      img.onerror = () => resolve({ faceBlob: null, detected: false });
      img.src = URL.createObjectURL(imageBlob);
    });
  }, [modelsLoaded]);

  const processImage = async (file: File | Blob, index: number): Promise<ExtractedStudent> => {
    const id = `student-${Date.now()}-${index}`;
    
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const { faceBlob, detected } = await extractFaceFromImage(file);

      const { data, error } = await supabase.functions.invoke('extract-pdf-users', {
        body: { 
          fileData: base64,
          fileName: `idcard-${index}.jpg`,
          fileType: 'image/jpeg'
        }
      });

      if (error) throw error;

      const aiUser = data?.users?.[0] || {};
      
      return {
        id,
        name: aiUser.name || '',
        employee_id: aiUser.employee_id || aiUser.student_id || `STU-${Date.now()}-${index}`,
        department: aiUser.department || aiUser.class || '',
        position: aiUser.position || 'Student',
        photo_description: aiUser.photo_description,
        imageBlob: faceBlob || undefined,
        previewUrl: base64,
        faceDetected: detected,
        confidence: detected ? 95 : 0,
        status: 'pending'
      };
    } catch (err) {
      return {
        id,
        name: '',
        employee_id: '',
        department: '',
        position: 'Student',
        faceDetected: false,
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Processing failed'
      };
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setTotalToProcess(files.length);
    const processedStudents: ExtractedStudent[] = [];

    for (let i = 0; i < files.length; i++) {
      setCurrentProcessingIndex(i + 1);
      const file = files[i];
      
      if (!file.type.startsWith('image/')) continue;
      
      const student = await processImage(file, i);
      processedStudents.push(student);
    }

    setStudents(prev => [...prev, ...processedStudents]);
    setIsProcessing(false);
    setCurrentProcessingIndex(0);
    setTotalToProcess(0);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    toast({
      title: "Processing Complete",
      description: `Processed ${processedStudents.length} ID cards. ${processedStudents.filter(s => s.faceDetected).length} faces detected.`,
    });
  };

  const captureFromCamera = useCallback(async () => {
    if (!webcamRef.current) return;
    
    setScanningFace(true);
    
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) {
      setScanningFace(false);
      return;
    }

    setCapturedImages(prev => [...prev, imageSrc]);
    
    // Convert base64 to blob
    const response = await fetch(imageSrc);
    const blob = await response.blob();
    
    const student = await processImage(blob, students.length + capturedImages.length);
    setStudents(prev => [...prev, student]);
    
    setScanningFace(false);
    
    toast({
      title: student.faceDetected ? "ID Card Captured" : "Captured (No Face)",
      description: student.faceDetected 
        ? `Face detected: ${student.name || 'Unknown'}` 
        : "No face detected. You can edit details manually.",
      variant: student.faceDetected ? "default" : "destructive"
    });
  }, [students.length, capturedImages.length, processImage]);

  const registerStudent = async (student: ExtractedStudent): Promise<boolean> => {
    if (!student.name || !student.imageBlob) return false;

    try {
      let descriptor: Float32Array | undefined;
      
      if (modelsLoaded && student.imageBlob) {
        const result = await getFaceDescriptorFromBlob(student.imageBlob);
        if (result) descriptor = result;
      }

      await registerFace(
        student.imageBlob,
        student.name,
        student.employee_id || `STU-${Date.now()}`,
        student.department || 'General',
        student.position || 'Student',
        undefined,
        descriptor
      );

      return true;
    } catch (err) {
      console.error('Registration error:', err);
      return false;
    }
  };

  const handleBatchRegister = async () => {
    const validStudents = students.filter(s => s.faceDetected && s.name);
    if (validStudents.length === 0) {
      toast({
        title: "No Valid Students",
        description: "Please ensure all students have names and detected faces.",
        variant: "destructive"
      });
      return;
    }

    setIsBatchRegistering(true);
    let successCount = 0;
    let errorCount = 0;

    const updatedStudents = [...students];

    for (let i = 0; i < updatedStudents.length; i++) {
      const student = updatedStudents[i];
      if (!student.faceDetected || !student.name) continue;

      updatedStudents[i] = { ...student, status: 'processing' };
      setStudents([...updatedStudents]);

      const success = await registerStudent(student);
      
      if (success) {
        updatedStudents[i] = { ...student, status: 'success' };
        successCount++;
      } else {
        updatedStudents[i] = { ...student, status: 'error', errorMessage: 'Registration failed' };
        errorCount++;
      }
      
      setStudents([...updatedStudents]);
    }

    setIsBatchRegistering(false);

    toast({
      title: "Batch Registration Complete",
      description: `Successfully registered ${successCount} students. ${errorCount} failed.`,
      variant: errorCount > 0 ? "destructive" : "default"
    });
  };

  const updateStudent = (id: string, field: keyof ExtractedStudent, value: string) => {
    setStudents(prev => prev.map(s => 
      s.id === id ? { ...s, [field]: value } : s
    ));
  };

  const removeStudent = (id: string) => {
    setStudents(prev => prev.filter(s => s.id !== id));
  };

  const clearAll = () => {
    setStudents([]);
    setCapturedImages([]);
  };

  const validCount = students.filter(s => s.faceDetected && s.name).length;
  const totalCount = students.length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4 bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500 text-white">
        <CardTitle className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <span className="flex items-center gap-2">
              Smart ID Card Extractor
              <Badge className="bg-white/20 text-white border-0">AI Batch</Badge>
            </span>
          </div>
        </CardTitle>
        <CardDescription className="text-white/80">
          Upload multiple ID cards or use camera to extract student info and register faces automatically
        </CardDescription>
      </CardHeader>
      
      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* Mode Toggle */}
        <div className="flex gap-2 p-1 bg-muted rounded-xl">
          <Button
            variant={mode === 'upload' ? 'default' : 'ghost'}
            className={`flex-1 gap-2 ${mode === 'upload' ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white' : ''}`}
            onClick={() => { setMode('upload'); setShowCamera(false); }}
          >
            <Upload className="w-4 h-4" />
            Upload Files
          </Button>
          <Button
            variant={mode === 'camera' ? 'default' : 'ghost'}
            className={`flex-1 gap-2 ${mode === 'camera' ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white' : ''}`}
            onClick={() => { setMode('camera'); setShowCamera(true); }}
          >
            <Camera className="w-4 h-4" />
            Camera Capture
          </Button>
        </div>

        {/* Upload Area */}
        {mode === 'upload' && (
          <div className="relative">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
              disabled={isProcessing}
            />
            
            <motion.div
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
                isProcessing 
                  ? 'border-pink-300 bg-pink-50 dark:bg-pink-950/20' 
                  : 'border-muted-foreground/25 hover:border-pink-500 hover:bg-pink-50/50 dark:hover:bg-pink-950/10'
              }`}
            >
              {isProcessing ? (
                <div className="space-y-4">
                  <motion.div className="relative w-20 h-20 mx-auto">
                    <motion.div
                      className="absolute inset-0 rounded-full border-4 border-pink-200"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    />
                    <motion.div
                      className="absolute inset-2 rounded-full border-4 border-t-pink-500 border-r-transparent border-b-transparent border-l-transparent"
                      animate={{ rotate: -360 }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ScanLine className="w-8 h-8 text-pink-500" />
                    </div>
                  </motion.div>
                  <div>
                    <p className="font-medium text-pink-600">
                      Processing {currentProcessingIndex} of {totalToProcess}...
                    </p>
                    <Progress 
                      value={(currentProcessingIndex / totalToProcess) * 100} 
                      className="mt-2 h-2" 
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shadow-lg shadow-pink-500/25">
                    <FileStack className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-lg">Upload Multiple ID Cards</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Select multiple images to batch process • JPG, PNG • Max 20MB each
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {/* Camera Area */}
        {mode === 'camera' && showCamera && (
          <div className="space-y-4">
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] sm:aspect-video">
              {/* Scanning Animation Overlay */}
              <AnimatePresence>
                {scanningFace && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-20 flex items-center justify-center bg-black/50"
                  >
                    <div className="relative">
                      <motion.div
                        className="w-48 h-48 sm:w-64 sm:h-64 rounded-full border-4 border-cyan-400"
                        animate={{ 
                          scale: [1, 1.1, 1],
                          boxShadow: [
                            '0 0 0 0 rgba(34,211,238,0.4)',
                            '0 0 0 20px rgba(34,211,238,0)',
                            '0 0 0 0 rgba(34,211,238,0.4)'
                          ]
                        }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                      <motion.div
                        className="absolute inset-0 border-t-4 border-cyan-300 rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <motion.div
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 0.8, repeat: Infinity }}
                        >
                          <Eye className="w-12 h-12 text-cyan-400" />
                        </motion.div>
                      </div>
                    </div>
                    <motion.p
                      className="absolute bottom-8 text-cyan-400 font-medium"
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      Analyzing ID Card...
                    </motion.p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Camera Corner Brackets */}
              <div className="absolute inset-0 z-10 pointer-events-none">
                <div className="absolute top-4 left-4 w-12 h-12 border-t-4 border-l-4 border-cyan-400 rounded-tl-xl" />
                <div className="absolute top-4 right-4 w-12 h-12 border-t-4 border-r-4 border-cyan-400 rounded-tr-xl" />
                <div className="absolute bottom-4 left-4 w-12 h-12 border-b-4 border-l-4 border-cyan-400 rounded-bl-xl" />
                <div className="absolute bottom-4 right-4 w-12 h-12 border-b-4 border-r-4 border-cyan-400 rounded-br-xl" />
                
                {/* Scanning Line */}
                <motion.div
                  className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
                  animate={{ top: ['10%', '90%', '10%'] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>

              <Webcam
                ref={webcamRef}
                audio={false}
                screenshotFormat="image/jpeg"
                className="w-full h-full object-cover"
                videoConstraints={{
                  facingMode,
                  width: { ideal: 1920 },
                  height: { ideal: 1080 }
                }}
              />
            </div>

            {/* Camera Controls */}
            <div className="flex flex-wrap gap-2 justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFacingMode(f => f === 'user' ? 'environment' : 'user')}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Flip Camera
              </Button>
              
              <Button
                onClick={captureFromCamera}
                disabled={scanningFace}
                className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-8"
              >
                {scanningFace ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Camera className="w-5 h-5 mr-2" />
                    Capture ID Card
                  </>
                )}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCamera(false)}
              >
                <X className="w-4 h-4 mr-2" />
                Close
              </Button>
            </div>
          </div>
        )}

        {/* Students List */}
        {students.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-pink-600 border-pink-500/30">
                  {totalCount} Captured
                </Badge>
                <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                  {validCount} Ready to Register
                </Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={clearAll}>
                <Trash2 className="w-4 h-4 mr-1" />
                Clear All
              </Button>
            </div>

            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {students.map((student, index) => (
                  <motion.div
                    key={student.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`relative p-4 rounded-xl border-2 transition-all ${
                      student.status === 'success' 
                        ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                        : student.status === 'error'
                        ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
                        : student.status === 'processing'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                        : student.faceDetected
                        ? 'border-pink-200 dark:border-pink-900'
                        : 'border-orange-200 dark:border-orange-900'
                    }`}
                  >
                    {/* Status Indicator */}
                    <div className="absolute top-2 right-2">
                      {student.status === 'processing' && (
                        <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                      )}
                      {student.status === 'success' && (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                      {student.status === 'error' && (
                        <AlertCircle className="w-5 h-5 text-red-500" />
                      )}
                    </div>

                    <div className="flex gap-4">
                      {/* Face Preview */}
                      <div className="flex-shrink-0">
                        {student.imageBlob ? (
                          <div className="relative">
                            <img
                              src={URL.createObjectURL(student.imageBlob)}
                              alt="Detected Face"
                              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-green-500"
                            />
                            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          </div>
                        ) : student.previewUrl ? (
                          <img
                            src={student.previewUrl}
                            alt="ID Card"
                            className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover border-2 border-orange-300"
                          />
                        ) : (
                          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg bg-muted flex items-center justify-center">
                            <User className="w-8 h-8 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Form Fields */}
                      <div className="flex-1 grid gap-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Input
                            placeholder="Full Name *"
                            value={student.name}
                            onChange={(e) => updateStudent(student.id, 'name', e.target.value)}
                            className="text-sm"
                            disabled={student.status === 'success'}
                          />
                          <Input
                            placeholder="ID Number"
                            value={student.employee_id}
                            onChange={(e) => updateStudent(student.id, 'employee_id', e.target.value)}
                            className="text-sm"
                            disabled={student.status === 'success'}
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Input
                            placeholder="Class/Department"
                            value={student.department}
                            onChange={(e) => updateStudent(student.id, 'department', e.target.value)}
                            className="text-sm"
                            disabled={student.status === 'success'}
                          />
                          <div className="flex gap-2">
                            <Input
                              placeholder="Position"
                              value={student.position}
                              onChange={(e) => updateStudent(student.id, 'position', e.target.value)}
                              className="text-sm flex-1"
                              disabled={student.status === 'success'}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeStudent(student.id)}
                              disabled={student.status === 'success'}
                            >
                              <X className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          </div>
                        </div>

                        {/* Status Messages */}
                        {!student.faceDetected && (
                          <p className="text-xs text-orange-600">
                            ⚠️ No face detected - upload a clearer image
                          </p>
                        )}
                        {student.errorMessage && (
                          <p className="text-xs text-red-600">{student.errorMessage}</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </ScrollArea>

            {/* Batch Register Button */}
            <Button
              onClick={handleBatchRegister}
              disabled={isBatchRegistering || validCount === 0}
              className="w-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow-lg shadow-pink-500/25 h-12"
            >
              {isBatchRegistering ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Registering Students...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 mr-2" />
                  Register All {validCount} Students
                </>
              )}
            </Button>
          </div>
        )}

        {/* Instructions */}
        {students.length === 0 && !isProcessing && !showCamera && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
            {[
              { icon: FileStack, title: 'Batch Upload', desc: 'Upload multiple ID card images at once' },
              { icon: Camera, title: 'Camera Capture', desc: 'Take photos directly from your device' },
              { icon: Wand2, title: 'AI Extraction', desc: 'Automatic face and text detection' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="font-medium text-sm">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BatchIDCardExtractor;
