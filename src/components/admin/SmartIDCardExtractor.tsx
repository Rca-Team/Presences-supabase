import React, { useState, useRef, useCallback } from 'react';
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
  UserCheck
} from 'lucide-react';

interface ExtractedData {
  name: string;
  employee_id: string;
  department: string;
  position: string;
  photo_description?: string;
  has_photo: boolean;
  imageBlob?: Blob;
  faceDetected: boolean;
  confidence?: number;
}

const SmartIDCardExtractor: React.FC = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState<string>('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(areRegistrationModelsLoaded());

  const loadModels = async () => {
    if (!areRegistrationModelsLoaded()) {
      await loadRegistrationModels();
      setModelsLoaded(true);
    }
  };

  const extractFaceFromImage = useCallback(async (imageBlob: Blob): Promise<{faceBlob: Blob | null, detected: boolean}> => {
    await loadModels();
    
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

          // Add padding around face
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
  }, []);

  const processIDCard = async (file: File) => {
    setIsProcessing(true);
    setProgress(0);
    setExtractedData(null);

    try {
      // Step 1: Show preview
      setStep('Loading image...');
      setProgress(10);
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      setPreviewImage(base64);

      // Step 2: Load face detection models
      setStep('Loading AI models...');
      setProgress(20);
      await loadModels();

      // Step 3: Detect face in the image
      setStep('Detecting face...');
      setProgress(35);
      const { faceBlob, detected } = await extractFaceFromImage(file);

      // Step 4: Send to AI for text extraction
      setStep('AI analyzing ID card...');
      setProgress(50);

      const { data, error } = await supabase.functions.invoke('extract-pdf-users', {
        body: { 
          fileData: base64,
          fileName: file.name,
          fileType: file.type
        }
      });

      if (error) throw error;

      setProgress(80);
      setStep('Processing results...');

      // Extract the first user from AI response
      const aiUser = data?.users?.[0] || {};
      
      const extracted: ExtractedData = {
        name: aiUser.name || '',
        employee_id: aiUser.employee_id || aiUser.student_id || '',
        department: aiUser.department || aiUser.class || '',
        position: aiUser.position || 'Student',
        photo_description: aiUser.photo_description,
        has_photo: detected || aiUser.has_photo || false,
        imageBlob: faceBlob || undefined,
        faceDetected: detected,
        confidence: detected ? 95 : 0,
      };

      setExtractedData(extracted);
      setProgress(100);
      setStep('');

      toast({
        title: detected ? "ID Card Analyzed" : "Text Extracted",
        description: detected 
          ? `Face detected! Found: ${extracted.name || 'Unknown'}` 
          : "No face detected, but text was extracted. Please upload a clearer photo.",
        variant: detected ? "default" : "destructive",
      });

    } catch (err) {
      console.error('Processing error:', err);
      toast({
        title: "Processing Failed",
        description: err instanceof Error ? err.message : "Failed to process ID card",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File",
        description: "Please upload an image file (JPG, PNG, etc.)",
        variant: "destructive",
      });
      return;
    }

    processIDCard(file);
  };

  const handleRegister = async () => {
    if (!extractedData?.name || !extractedData.imageBlob) {
      toast({
        title: "Missing Information",
        description: "Please ensure name and face image are available",
        variant: "destructive",
      });
      return;
    }

    setIsRegistering(true);

    try {
      let descriptor: Float32Array | undefined;
      
      if (modelsLoaded && extractedData.imageBlob) {
        const result = await getFaceDescriptorFromBlob(extractedData.imageBlob);
        if (result) {
          descriptor = result;
        }
      }

      await registerFace(
        extractedData.imageBlob,
        extractedData.name,
        extractedData.employee_id || `STU-${Date.now()}`,
        extractedData.department || 'General',
        extractedData.position || 'Student',
        undefined,
        descriptor
      );

      toast({
        title: "Registration Successful",
        description: `${extractedData.name} has been registered`,
      });

      // Reset form
      setExtractedData(null);
      setPreviewImage(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (err) {
      toast({
        title: "Registration Failed",
        description: err instanceof Error ? err.message : "Failed to register user",
        variant: "destructive",
      });
    } finally {
      setIsRegistering(false);
    }
  };

  const updateField = (field: keyof ExtractedData, value: string) => {
    if (extractedData) {
      setExtractedData({ ...extractedData, [field]: value });
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4 bg-gradient-to-r from-pink-500 to-rose-500 text-white">
        <CardTitle className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <span className="flex items-center gap-2">
              Smart ID Card Extractor
              <Badge className="bg-white/20 text-white border-0">AI Powered</Badge>
            </span>
          </div>
        </CardTitle>
        <CardDescription className="text-white/80">
          Upload an ID card photo to automatically extract student information and face
        </CardDescription>
      </CardHeader>
      
      <CardContent className="p-6 space-y-6">
        {/* Upload Area */}
        <div className="relative">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
            disabled={isProcessing}
          />
          
          <motion.div
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
              isProcessing 
                ? 'border-pink-300 bg-pink-50 dark:bg-pink-950/20' 
                : 'border-muted-foreground/25 hover:border-pink-500 hover:bg-pink-50/50 dark:hover:bg-pink-950/10'
            }`}
          >
            {isProcessing ? (
              <div className="space-y-4">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                >
                  <ScanLine className="w-12 h-12 mx-auto text-pink-500" />
                </motion.div>
                <div>
                  <p className="font-medium text-pink-600">{step}</p>
                  <Progress value={progress} className="mt-2 h-2" />
                </div>
              </div>
            ) : previewImage ? (
              <div className="space-y-4">
                <img 
                  src={previewImage} 
                  alt="ID Card Preview" 
                  className="max-h-48 mx-auto rounded-lg shadow-lg"
                />
                <p className="text-sm text-muted-foreground">Click to upload a different image</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shadow-lg shadow-pink-500/25">
                  <Upload className="w-8 h-8 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-lg">Upload ID Card Image</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Supports JPG, PNG, HEIC • Max 20MB
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </div>

        {/* Extracted Data Form */}
        <AnimatePresence>
          {extractedData && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Status Badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {extractedData.faceDetected ? (
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Face Detected
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      No Face Found
                    </Badge>
                  )}
                  {extractedData.confidence && extractedData.confidence > 0 && (
                    <Badge variant="outline" className="text-pink-600 border-pink-500/30">
                      {extractedData.confidence}% confidence
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setExtractedData(null);
                    setPreviewImage(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Reset
                </Button>
              </div>

              {/* Face Preview */}
              {extractedData.imageBlob && (
                <div className="flex justify-center">
                  <div className="relative">
                    <img
                      src={URL.createObjectURL(extractedData.imageBlob)}
                      alt="Detected Face"
                      className="w-32 h-32 rounded-full object-cover border-4 border-green-500 shadow-lg"
                    />
                    <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
                      <UserCheck className="w-4 h-4 text-white" />
                    </div>
                  </div>
                </div>
              )}

              {/* Form Fields */}
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Full Name *
                  </Label>
                  <Input
                    id="name"
                    value={extractedData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="Enter full name"
                    className="border-pink-200 focus:border-pink-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="employee_id">Student/Employee ID</Label>
                    <Input
                      id="employee_id"
                      value={extractedData.employee_id}
                      onChange={(e) => updateField('employee_id', e.target.value)}
                      placeholder="e.g., STU-001"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="department">Department/Class</Label>
                    <Input
                      id="department"
                      value={extractedData.department}
                      onChange={(e) => updateField('department', e.target.value)}
                      placeholder="e.g., Class 10-A"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="position">Position/Grade</Label>
                  <Input
                    id="position"
                    value={extractedData.position}
                    onChange={(e) => updateField('position', e.target.value)}
                    placeholder="e.g., Student"
                  />
                </div>

                {extractedData.photo_description && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs font-medium text-muted-foreground mb-1">AI Photo Description:</p>
                    <p className="text-sm">{extractedData.photo_description}</p>
                  </div>
                )}
              </div>

              {/* Register Button */}
              <Button
                onClick={handleRegister}
                disabled={isRegistering || !extractedData.name || !extractedData.faceDetected}
                className="w-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow-lg shadow-pink-500/25"
              >
                {isRegistering ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Registering...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Register Student
                  </>
                )}
              </Button>

              {!extractedData.faceDetected && (
                <p className="text-xs text-center text-muted-foreground">
                  A clear face photo is required for registration. Please try a different image.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Instructions */}
        {!extractedData && !isProcessing && (
          <div className="bg-muted/50 rounded-xl p-4 space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-pink-500" />
              How it works
            </h4>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-pink-500 text-white flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                <span>Upload a clear photo of an ID card (school ID, employee ID, etc.)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-pink-500 text-white flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                <span>AI will automatically extract name, ID number, and detect the face</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-pink-500 text-white flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                <span>Review and edit the extracted information if needed</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-pink-500 text-white flex items-center justify-center text-xs flex-shrink-0 mt-0.5">4</span>
                <span>Click register to add the student to the system</span>
              </li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SmartIDCardExtractor;
