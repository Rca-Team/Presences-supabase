import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { FileUp, Loader2, Users, CheckCircle, AlertCircle, Sparkles, Camera, Image as ImageIcon } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { registerFace } from '@/services/face-recognition/RegistrationService';
import { 
  loadRegistrationModels, 
  areRegistrationModelsLoaded,
  getFaceDescriptorFromBlob 
} from '@/services/face-recognition/OptimizedRegistrationService';
import * as faceapi from 'face-api.js';

interface ExtractedUser {
  name: string;
  employee_id: string;
  department?: string;
  position?: string;
  imageUrl?: string;
  imageBlob?: Blob;
  faceDetected: boolean;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
}

interface DetectedFace {
  faceBlob: Blob;
  box: faceapi.Box;
  descriptor?: Float32Array;
}

const PDFBulkRegistration: React.FC = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isExtracting, setIsExtracting] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [extractedUsers, setExtractedUsers] = useState<ExtractedUser[]>([]);
  const [progress, setProgress] = useState(0);
  const [modelsLoaded, setModelsLoaded] = useState(areRegistrationModelsLoaded());
  const [extractionStep, setExtractionStep] = useState<string>('');

  // Load face-api models using optimized service
  useEffect(() => {
    const loadModels = async () => {
      if (areRegistrationModelsLoaded()) {
        setModelsLoaded(true);
        return;
      }
      try {
        await loadRegistrationModels();
        setModelsLoaded(true);
        console.log('Bulk registration models loaded');
      } catch (err) {
        console.error('Error loading models:', err);
      }
    };
    loadModels();
  }, []);

  // Extract faces from an image using face-api.js
  const extractFacesFromImage = useCallback(async (imageBlob: Blob): Promise<DetectedFace[]> => {
    if (!modelsLoaded) {
      await loadRegistrationModels();
      setModelsLoaded(true);
    }

    return new Promise(async (resolve) => {
      const img = document.createElement('img');
      img.onload = async () => {
        try {
          // Detect all faces with landmarks and descriptors
          const detections = await faceapi
            .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ 
              inputSize: 416, 
              scoreThreshold: 0.4 
            }))
            .withFaceLandmarks()
            .withFaceDescriptors();

          if (detections.length === 0) {
            resolve([]);
            return;
          }

          const faces: DetectedFace[] = [];
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          for (const detection of detections) {
            const box = detection.detection.box;
            
            // Add padding around face
            const padding = Math.min(box.width, box.height) * 0.3;
            const x = Math.max(0, box.x - padding);
            const y = Math.max(0, box.y - padding);
            const width = Math.min(img.width - x, box.width + padding * 2);
            const height = Math.min(img.height - y, box.height + padding * 2);

            // Extract face region
            canvas.width = width;
            canvas.height = height;
            ctx?.drawImage(img, x, y, width, height, 0, 0, width, height);

            // Convert to blob
            const faceBlob = await new Promise<Blob>((resolve) => {
              canvas.toBlob((blob) => {
                resolve(blob || new Blob());
              }, 'image/jpeg', 0.9);
            });

            faces.push({
              faceBlob,
              box: detection.detection.box,
              descriptor: detection.descriptor
            });
          }

          resolve(faces);
        } catch (err) {
          console.error('Face detection error:', err);
          resolve([]);
        }
      };
      img.onerror = () => resolve([]);
      img.src = URL.createObjectURL(imageBlob);
    });
  }, [modelsLoaded]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type.includes('pdf');
    
    if (!isPdf && !isImage) {
      toast({
        title: "Invalid File",
        description: "Please upload a PDF document or image file",
        variant: "destructive"
      });
      return;
    }

    setIsExtracting(true);
    setExtractedUsers([]);
    setProgress(0);

    try {
      if (isImage) {
        // Direct face extraction from image
        setExtractionStep('Detecting faces in image...');
        await extractFacesFromUploadedImage(file);
      } else {
        // PDF processing - use AI to extract info, then detect faces
        await processPdfWithAI(file);
      }
    } catch (err) {
      console.error('Extraction error:', err);
      toast({
        title: "Extraction Failed",
        description: err instanceof Error ? err.message : "Failed to process document",
        variant: "destructive"
      });
    } finally {
      setIsExtracting(false);
      setExtractionStep('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const extractFacesFromUploadedImage = async (file: File) => {
    setExtractionStep('Loading face detection models...');
    
    if (!modelsLoaded) {
      await loadRegistrationModels();
      setModelsLoaded(true);
    }

    setExtractionStep('Detecting faces...');
    const faces = await extractFacesFromImage(file);

    if (faces.length === 0) {
      toast({
        title: "No Faces Detected",
        description: "Could not detect any faces in the uploaded image. Please try a clearer photo.",
        variant: "destructive"
      });
      return;
    }

    // Create users for each detected face
    const users: ExtractedUser[] = faces.map((face, idx) => ({
      name: `Person ${idx + 1}`,
      employee_id: `STU-${Date.now()}-${idx + 1}`,
      department: '',
      position: 'Student',
      imageBlob: face.faceBlob,
      faceDetected: true,
      status: 'pending' as const
    }));

    setExtractedUsers(users);
    
    toast({
      title: "Faces Detected",
      description: `Found ${faces.length} face(s). Please edit names before registering.`,
    });
  };

  const processPdfWithAI = async (file: File) => {
    setExtractionStep('Converting document...');
    const base64 = await fileToBase64(file);
    
    setExtractionStep('AI analyzing document...');
    toast({
      title: "Processing Document",
      description: "Using AI to extract user information...",
    });

    // Call AI edge function to extract data
    const { data, error } = await supabase.functions.invoke('extract-pdf-users', {
      body: { 
        fileData: base64,
        fileName: file.name,
        fileType: file.type
      }
    });

    if (error) throw error;

    if (data?.users && data.users.length > 0) {
      const users: ExtractedUser[] = data.users.map((user: any) => ({
        name: user.name || 'Unknown',
        employee_id: user.employee_id || user.student_id || `STU-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        department: user.department || user.class || '',
        position: user.position || user.grade || 'Student',
        imageUrl: user.photo_url || user.image_url,
        faceDetected: false,
        status: 'pending' as const
      }));

      setExtractedUsers(users);
      
      // Try to fetch and detect faces from image URLs
      setExtractionStep('Fetching and detecting faces from images...');
      await fetchAndDetectFaces(users);
      
      toast({
        title: "Extraction Complete",
        description: `Found ${users.length} users in the document`,
      });
    } else {
      // If AI couldn't extract structured data, try direct face detection
      // Convert PDF first page to image (using canvas)
      toast({
        title: "Trying Direct Face Detection",
        description: "AI couldn't extract structured data, detecting faces directly...",
      });
      
      // For now, show message about image upload
      toast({
        title: "Use Image Upload",
        description: "For best results with face detection, please upload images directly instead of PDFs.",
        variant: "destructive"
      });
    }
  };

  const fetchAndDetectFaces = async (users: ExtractedUser[]) => {
    const updatedUsers = [...users];
    
    for (let i = 0; i < updatedUsers.length; i++) {
      if (updatedUsers[i].imageUrl) {
        try {
          const response = await fetch(updatedUsers[i].imageUrl!);
          if (response.ok) {
            const blob = await response.blob();
            
            // Detect faces in the fetched image
            const faces = await extractFacesFromImage(blob);
            
            if (faces.length > 0) {
              // Use the first detected face
              updatedUsers[i].imageBlob = faces[0].faceBlob;
              updatedUsers[i].faceDetected = true;
            } else {
              // Use original image if no face detected
              updatedUsers[i].imageBlob = blob;
              updatedUsers[i].faceDetected = false;
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch/process image for ${updatedUsers[i].name}`);
        }
      }
    }
    
    setExtractedUsers(updatedUsers);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const fetchUserImages = async (users: ExtractedUser[]) => {
    const updatedUsers = [...users];
    
    for (let i = 0; i < updatedUsers.length; i++) {
      if (updatedUsers[i].imageUrl) {
        try {
          const response = await fetch(updatedUsers[i].imageUrl!);
          if (response.ok) {
            const blob = await response.blob();
            updatedUsers[i].imageBlob = blob;
          }
        } catch (err) {
          console.warn(`Failed to fetch image for ${updatedUsers[i].name}`);
        }
      }
    }
    
    setExtractedUsers(updatedUsers);
  };

  const handleRegisterAll = async () => {
    if (extractedUsers.length === 0) return;
    
    // Ensure models are loaded
    if (!modelsLoaded) {
      await loadRegistrationModels();
      setModelsLoaded(true);
    }
    
    setIsRegistering(true);
    setProgress(0);

    const total = extractedUsers.length;
    let completed = 0;
    let successCount = 0;

    for (let i = 0; i < extractedUsers.length; i++) {
      const user = extractedUsers[i];
      
      setExtractedUsers(prev => prev.map((u, idx) => 
        idx === i ? { ...u, status: 'processing' } : u
      ));

      try {
        // Check if we have an image
        if (!user.imageBlob) {
          throw new Error('No image available');
        }

        // Get face descriptor using optimized service
        let descriptor: Float32Array | undefined;
        
        if (modelsLoaded) {
          const result = await getFaceDescriptorFromBlob(user.imageBlob);
          if (result) {
            descriptor = result;
          }
        }

        await registerFace(
          user.imageBlob,
          user.name,
          user.employee_id,
          user.department || 'General',
          user.position || 'Student',
          undefined,
          descriptor
        );

        setExtractedUsers(prev => prev.map((u, idx) => 
          idx === i ? { ...u, status: 'success' } : u
        ));
        successCount++;
      } catch (err) {
        setExtractedUsers(prev => prev.map((u, idx) => 
          idx === i ? { ...u, status: 'error', error: err instanceof Error ? err.message : 'Registration failed' } : u
        ));
      }

      completed++;
      setProgress((completed / total) * 100);
    }

    setIsRegistering(false);
    
    toast({
      title: "Bulk Registration Complete",
      description: `Successfully registered ${successCount} of ${total} users`,
    });
  };

  const getStatusIcon = (status: string, faceDetected: boolean) => {
    switch (status) {
      case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'processing': return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      default: return faceDetected 
        ? <Camera className="h-4 w-4 text-green-500" />
        : <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const updateUserName = (idx: number, name: string) => {
    setExtractedUsers(prev => prev.map((u, i) => 
      i === idx ? { ...u, name } : u
    ));
  };

  const updateUserId = (idx: number, employee_id: string) => {
    setExtractedUsers(prev => prev.map((u, i) => 
      i === idx ? { ...u, employee_id } : u
    ));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Bulk Registration from PDF
        </CardTitle>
        <CardDescription>
          Upload a PDF document containing student/employee information. AI will extract names, IDs, and photos automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File Upload */}
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isExtracting || isRegistering}
            className="flex-1"
          >
            {isExtracting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {extractionStep || 'Extracting...'}
              </>
            ) : (
              <>
                <FileUp className="h-4 w-4 mr-2" />
                Upload Image/PDF
              </>
            )}
          </Button>
          
          {extractedUsers.length > 0 && (
            <Button
              onClick={handleRegisterAll}
              disabled={isRegistering || extractedUsers.every(u => u.status === 'success') || extractedUsers.filter(u => u.faceDetected).length === 0}
            >
              {isRegistering ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Registering...
                </>
              ) : (
                <>
                  <Users className="h-4 w-4 mr-2" />
                  Register ({extractedUsers.filter(u => u.status === 'pending' && u.faceDetected).length} with faces)
                </>
              )}
            </Button>
          )}
        </div>

        {/* Extraction Step Indicator */}
        {isExtracting && extractionStep && (
          <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm text-primary">{extractionStep}</span>
          </div>
        )}

        {/* Progress Bar */}
        {isRegistering && (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground text-center">
              {Math.round(progress)}% complete
            </p>
          </div>
        )}

        {/* Extracted Users List */}
        {extractedUsers.length > 0 && (
          <ScrollArea className="h-64 border rounded-lg">
            <div className="p-3 space-y-2">
              {extractedUsers.map((user, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                >
                  {user.imageBlob ? (
                    <img
                      src={URL.createObjectURL(user.imageBlob)}
                      alt={user.name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <Users className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0 space-y-1">
                    {user.status === 'pending' ? (
                      <>
                        <Input
                          value={user.name}
                          onChange={(e) => updateUserName(idx, e.target.value)}
                          placeholder="Enter name"
                          className="h-7 text-sm"
                        />
                        <Input
                          value={user.employee_id}
                          onChange={(e) => updateUserId(idx, e.target.value)}
                          placeholder="Enter ID"
                          className="h-6 text-xs"
                        />
                      </>
                    ) : (
                      <>
                        <p className="font-medium truncate">{user.name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {user.employee_id} • {user.department}
                        </p>
                      </>
                    )}
                  </div>
                  
                  <div className="flex flex-col items-center gap-1">
                    {user.faceDetected ? (
                      <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                        Face OK
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-600">
                        No Face
                      </Badge>
                    )}
                    {user.status === 'error' && (
                      <Badge variant="destructive" className="text-xs">
                        {user.error}
                      </Badge>
                    )}
                    {getStatusIcon(user.status, user.faceDetected)}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Instructions */}
        {extractedUsers.length === 0 && !isExtracting && (
          <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg">
            <p className="font-medium mb-2">Supported formats:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>PDF documents with student/employee lists</li>
              <li>ID cards or admission forms (images)</li>
              <li>Class photos with name labels</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PDFBulkRegistration;
