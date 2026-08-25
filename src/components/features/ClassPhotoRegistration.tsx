import React, { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import * as faceapi from 'face-api.js';
import { loadNets } from '@/services/face-recognition/NetLoaderService';
import { 
  Upload, Users, Camera, Check, X, Edit2, 
  RefreshCw, Sparkles, UserPlus, Image
} from 'lucide-react';

interface DetectedFace {
  id: string;
  box: { x: number; y: number; width: number; height: number };
  descriptor: Float32Array;
  name: string;
  confirmed: boolean;
  imageData: string;
}

const ClassPhotoRegistration = () => {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [detectedFaces, setDetectedFaces] = useState<DetectedFace[]>([]);
  const [processing, setProcessing] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('A');
  const [editingFaceId, setEditingFaceId] = useState<string | null>(null);

  // Load face-api models
  React.useEffect(() => {
    const loadModels = async () => {
      try {
        await loadNets(['ssdMobilenetv1', 'faceLandmark68Net', 'faceRecognitionNet']);
        setModelsLoaded(true);
      } catch (error) {
        console.error('Error loading models:', error);
        toast({ title: 'Error', description: 'Failed to load face detection models', variant: 'destructive' });
      }
    };
    loadModels();
  }, []);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadedImage(e.target?.result as string);
      setDetectedFaces([]);
    };
    reader.readAsDataURL(file);
  };

  const detectFacesInPhoto = async () => {
    if (!uploadedImage || !modelsLoaded || !imageRef.current) return;

    setProcessing(true);
    try {
      // Create image element
      const img = await faceapi.fetchImage(uploadedImage);
      
      // Detect all faces with landmarks and descriptors
      const detections = await faceapi
        .detectAllFaces(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (detections.length === 0) {
        toast({ title: 'No Faces Found', description: 'Could not detect any faces in the image', variant: 'destructive' });
        setProcessing(false);
        return;
      }

      // Draw on canvas
      if (canvasRef.current && imageRef.current) {
        const canvas = canvasRef.current;
        const displaySize = { width: imageRef.current.width, height: imageRef.current.height };
        faceapi.matchDimensions(canvas, displaySize);
        
        if (!displaySize.width || !displaySize.height) {
          setProcessing(false);
          return;
        }
        const safeDetections = detections.filter((d) => {
          const b = d?.detection?.box;
          return Number.isFinite(b?.x) && Number.isFinite(b?.y) && Number.isFinite(b?.width) && Number.isFinite(b?.height);
        });
        const resizedDetections = faceapi.resizeResults(safeDetections, displaySize);
        
        canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
        faceapi.draw.drawDetections(canvas, resizedDetections);
      }

      // Extract face images and create DetectedFace objects
      const faces: DetectedFace[] = await Promise.all(
        detections.map(async (detection, index) => {
          const box = detection.detection.box;
          
          // Create face crop
          const faceCanvas = document.createElement('canvas');
          const padding = 20;
          faceCanvas.width = box.width + padding * 2;
          faceCanvas.height = box.height + padding * 2;
          const ctx = faceCanvas.getContext('2d');
          
          if (ctx) {
            ctx.drawImage(
              img,
              Math.max(0, box.x - padding),
              Math.max(0, box.y - padding),
              box.width + padding * 2,
              box.height + padding * 2,
              0, 0,
              faceCanvas.width, faceCanvas.height
            );
          }

          return {
            id: `face-${index}-${Date.now()}`,
            box: { x: box.x, y: box.y, width: box.width, height: box.height },
            descriptor: detection.descriptor,
            name: `Student ${index + 1}`,
            confirmed: false,
            imageData: faceCanvas.toDataURL('image/jpeg'),
          };
        })
      );

      setDetectedFaces(faces);
      toast({ 
        title: `${faces.length} Faces Detected!`, 
        description: 'Please confirm or edit student names' 
      });
    } catch (error) {
      console.error('Error detecting faces:', error);
      toast({ title: 'Detection Failed', description: 'Error processing the image', variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const updateFaceName = (faceId: string, name: string) => {
    setDetectedFaces(prev => 
      prev.map(face => 
        face.id === faceId ? { ...face, name } : face
      )
    );
  };

  const confirmFace = (faceId: string) => {
    setDetectedFaces(prev =>
      prev.map(face =>
        face.id === faceId ? { ...face, confirmed: true } : face
      )
    );
    setEditingFaceId(null);
  };

  const removeFace = (faceId: string) => {
    setDetectedFaces(prev => prev.filter(face => face.id !== faceId));
  };

  const registerAllFaces = async () => {
    const confirmedFaces = detectedFaces.filter(f => f.confirmed);
    if (confirmedFaces.length === 0) {
      toast({ title: 'No Confirmed Faces', description: 'Please confirm at least one student', variant: 'destructive' });
      return;
    }

    setRegistering(true);
    let successCount = 0;

    try {
      for (const face of confirmedFaces) {
        // Upload face image
        const base64Data = face.imageData.split(',')[1];
        const blob = await fetch(`data:image/jpeg;base64,${base64Data}`).then(r => r.blob());
        const fileName = `batch/${Date.now()}-${face.id}.jpg`;
        
        const { error: uploadError } = await supabase.storage
          .from('face-images')
          .upload(fileName, blob, { contentType: 'image/jpeg' });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          continue;
        }

        const { data: urlData } = supabase.storage.from('face-images').getPublicUrl(fileName);

        // Create user and register face
        const userId = crypto.randomUUID();
        
        // Store face descriptor
        await supabase.from('face_descriptors').insert({
          user_id: userId,
          descriptor: Array.from(face.descriptor),
          label: face.name,
          image_url: urlData.publicUrl,
          metadata: { registration: 'true' },
        });

        // Create registration record
        await supabase.from('attendance_records').insert({
          user_id: userId,
          status: 'registered',
          category: selectedCategory,
          device_info: {
            registration_type: 'batch_photo',
            metadata: {
              name: face.name,
              firebase_image_url: urlData.publicUrl,
            }
          },
          image_url: urlData.publicUrl,
        });

        successCount++;
      }

      toast({ 
        title: '✓ Batch Registration Complete', 
        description: `Successfully registered ${successCount} students` 
      });

      // Reset
      setUploadedImage(null);
      setDetectedFaces([]);
    } catch (error) {
      console.error('Registration error:', error);
      toast({ title: 'Error', description: 'Some registrations failed', variant: 'destructive' });
    } finally {
      setRegistering(false);
    }
  };

  const confirmedCount = detectedFaces.filter(f => f.confirmed).length;

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <Card className="bg-card/50 backdrop-blur border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Class Photo Batch Registration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {['A', 'B', 'C', 'D', 'E', 'F'].map(cat => (
                  <SelectItem key={cat} value={cat}>Category {cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <Button 
              variant="outline" 
              onClick={() => fileInputRef.current?.click()}
              className="flex-1"
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload Class Photo
            </Button>
          </div>

          {/* Image Preview */}
          {uploadedImage && (
            <div className="relative">
              <img
                ref={imageRef}
                src={uploadedImage}
                alt="Class Photo"
                className="w-full rounded-lg"
                onLoad={detectFacesInPhoto}
              />
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full pointer-events-none"
              />
              
              {processing && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                  <div className="text-center text-white">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
                    <p>Detecting Faces...</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {!uploadedImage && (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-primary/30 rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
            >
              <Image className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Upload a class photo</p>
              <p className="text-sm text-muted-foreground mt-1">
                AI will detect all faces and help you register students quickly
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detected Faces Grid */}
      {detectedFaces.length > 0 && (
        <Card className="bg-card/50 backdrop-blur border-primary/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Detected Students ({detectedFaces.length})
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  <Check className="h-3 w-3" />
                  {confirmedCount} confirmed
                </Badge>
                <Button 
                  onClick={registerAllFaces}
                  disabled={confirmedCount === 0 || registering}
                >
                  {registering ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="mr-2 h-4 w-4" />
                  )}
                  Register All ({confirmedCount})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-96">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                <AnimatePresence>
                  {detectedFaces.map((face, index) => (
                    <motion.div
                      key={face.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ delay: index * 0.05 }}
                      className={`relative rounded-lg overflow-hidden border-2 ${
                        face.confirmed ? 'border-green-500' : 'border-muted'
                      }`}
                    >
                      <img 
                        src={face.imageData} 
                        alt={face.name}
                        className="w-full aspect-square object-cover"
                      />
                      
                      {/* Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                      
                      {/* Name Input/Display */}
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        {editingFaceId === face.id ? (
                          <Input
                            value={face.name}
                            onChange={(e) => updateFaceName(face.id, e.target.value)}
                            onBlur={() => confirmFace(face.id)}
                            onKeyDown={(e) => e.key === 'Enter' && confirmFace(face.id)}
                            autoFocus
                            className="h-7 text-xs"
                          />
                        ) : (
                          <div 
                            className="flex items-center justify-between cursor-pointer"
                            onClick={() => setEditingFaceId(face.id)}
                          >
                            <span className="text-white text-sm font-medium truncate">
                              {face.name}
                            </span>
                            <Edit2 className="h-3 w-3 text-white/70" />
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="absolute top-1 right-1 flex gap-1">
                        {!face.confirmed && (
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-6 w-6 bg-green-500/80 hover:bg-green-500"
                            onClick={() => confirmFace(face.id)}
                          >
                            <Check className="h-3 w-3 text-white" />
                          </Button>
                        )}
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-6 w-6 bg-red-500/80 hover:bg-red-500"
                          onClick={() => removeFace(face.id)}
                        >
                          <X className="h-3 w-3 text-white" />
                        </Button>
                      </div>

                      {/* Confirmed Badge */}
                      {face.confirmed && (
                        <div className="absolute top-1 left-1">
                          <Badge className="bg-green-500 text-white text-xs px-1">
                            <Check className="h-2 w-2" />
                          </Badge>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ClassPhotoRegistration;
