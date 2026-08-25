import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { loadOptimizedModels, getOptimizedFaceDescriptor } from '@/services/face-recognition/OptimizedModelService';
import {
  Upload,
  Image as ImageIcon,
  User,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  FileImage,
  AlertCircle,
  Sparkles,
  FileUp,
  Edit2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ImageCropper from './ImageCropper';

type Category = 'A' | 'B' | 'C' | 'D' | 'Teacher';

interface ImageEntry {
  id: string;
  file?: File;
  blob?: Blob;
  preview: string;
  name: string;
  employeeId: string;
  department: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
}

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'A', label: 'Category A' },
  { value: 'B', label: 'Category B' },
  { value: 'C', label: 'Category C' },
  { value: 'D', label: 'Category D' },
  { value: 'Teacher', label: 'Teacher' },
];

const CombinedBulkRegistration: React.FC = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const [images, setImages] = useState<ImageEntry[]>([]);
  const [category, setCategory] = useState<Category>('A');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<'images' | 'pdf'>('images');

  // Image cropper state
  const [cropperOpen, setCropperOpen] = useState(false);
  const [cropperImage, setCropperImage] = useState<string>('');
  const [cropperImageId, setCropperImageId] = useState<string>('');

  // Handle image file selection
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    const newImages: ImageEntry[] = files
      .filter(file => file.type.startsWith('image/'))
      .map((file, index) => {
        const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        const words = baseName.split(' ');
        const formattedName = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

        return {
          id: `${Date.now()}-${index}`,
          file,
          preview: URL.createObjectURL(file),
          name: formattedName,
          employeeId: `STU-${String(Date.now() + index).slice(-6)}`,
          department: category === 'Teacher' ? 'Faculty' : 'Student',
          status: 'pending' as const,
        };
      });

    setImages(prev => [...prev, ...newImages]);

    if (files.length > 0) {
      toast({
        title: "Images Added",
        description: `${newImages.length} image(s) added for registration`,
      });
    }
  }, [toast, category]);

  // Handle PDF/Document upload for AI extraction
  const handlePdfSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('pdf') && !file.type.includes('image')) {
      toast({
        title: "Invalid File",
        description: "Please upload a PDF document or image file",
        variant: "destructive"
      });
      return;
    }

    setIsExtracting(true);

    try {
      const base64 = await fileToBase64(file);

      toast({
        title: "Processing Document",
        description: "Using AI to extract user information and photos...",
      });

      const { data, error } = await supabase.functions.invoke('extract-pdf-users', {
        body: {
          fileData: base64,
          fileName: file.name,
          fileType: file.type
        }
      });

      if (error) throw error;

      if (data?.users && data.users.length > 0) {
        const newEntries: ImageEntry[] = [];

        for (const user of data.users) {
          let blob: Blob | undefined;
          let preview = '';

          // Try to fetch image if URL provided
          if (user.photo_url || user.image_url) {
            try {
              const response = await fetch(user.photo_url || user.image_url);
              if (response.ok) {
                blob = await response.blob();
                preview = URL.createObjectURL(blob);
              }
            } catch (err) {
              console.warn(`Failed to fetch image for ${user.name}`);
            }
          }

          // If we have base64 image data
          if (user.image_data) {
            try {
              const binaryData = atob(user.image_data);
              const bytes = new Uint8Array(binaryData.length);
              for (let i = 0; i < binaryData.length; i++) {
                bytes[i] = binaryData.charCodeAt(i);
              }
              blob = new Blob([bytes], { type: 'image/jpeg' });
              preview = URL.createObjectURL(blob);
            } catch (err) {
              console.warn(`Failed to process image data for ${user.name}`);
            }
          }

          newEntries.push({
            id: `pdf-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            blob,
            preview,
            name: user.name || 'Unknown',
            employeeId: user.employee_id || user.student_id || `STU-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            department: user.department || user.class || 'General',
            status: 'pending',
          });
        }

        setImages(prev => [...prev, ...newEntries]);

        toast({
          title: "Extraction Complete",
          description: `Found ${newEntries.length} users in the document`,
        });
      } else {
        toast({
          title: "No Users Found",
          description: "Could not extract user information from the document",
          variant: "destructive"
        });
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
      if (pdfInputRef.current) {
        pdfInputRef.current.value = '';
      }
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Update image details
  const updateImage = (id: string, updates: Partial<ImageEntry>) => {
    setImages(prev => prev.map(img =>
      img.id === id ? { ...img, ...updates } : img
    ));
  };

  // Remove image
  const removeImage = (id: string) => {
    setImages(prev => {
      const img = prev.find(i => i.id === id);
      if (img && img.preview) URL.revokeObjectURL(img.preview);
      return prev.filter(i => i.id !== id);
    });
  };

  // Clear all
  const clearAll = () => {
    images.forEach(img => {
      if (img.preview) URL.revokeObjectURL(img.preview);
    });
    setImages([]);
    setProgress(0);
  };

  // Open image cropper
  const openCropper = (id: string, preview: string) => {
    setCropperImageId(id);
    setCropperImage(preview);
    setCropperOpen(true);
  };

  // Handle cropped image
  const handleCropComplete = (croppedBlob: Blob) => {
    const newPreview = URL.createObjectURL(croppedBlob);
    updateImage(cropperImageId, {
      blob: croppedBlob,
      preview: newPreview,
    });
    setCropperOpen(false);
  };

  // Process all images
  const processAll = async () => {
    const pendingImages = images.filter(i => i.status === 'pending');
    if (pendingImages.length === 0) {
      toast({
        title: "No Images",
        description: "Please add images to register",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      if (!modelsLoaded) {
        toast({ title: "Loading Models", description: "Preparing face recognition..." });
        await loadOptimizedModels();
        setModelsLoaded(true);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to register faces",
          variant: "destructive",
        });
        setIsProcessing(false);
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < images.length; i++) {
        const img = images[i];

        if (img.status === 'success') continue;

        updateImage(img.id, { status: 'processing' });

        try {
          // Get image blob
          const imageBlob = img.blob || img.file;
          if (!imageBlob) {
            throw new Error('No image available');
          }

          // Load image element
          const imageElement = new Image();
          imageElement.src = img.preview;
          await new Promise<void>((resolve, reject) => {
            imageElement.onload = () => resolve();
            imageElement.onerror = () => reject(new Error('Failed to load image'));
          });

          // Get face descriptor
          const descriptor = await getOptimizedFaceDescriptor(imageElement);

          if (!descriptor) {
            throw new Error('No face detected in image');
          }

          // Upload image to storage
          const fileName = `${user.id}/${Date.now()}-${img.name.replace(/\s+/g, '-')}.jpg`;
          const { error: uploadError } = await supabase.storage
            .from('face-images')
            .upload(fileName, imageBlob, { contentType: 'image/jpeg' });

          // Save to database
          const deviceInfo = {
            source: 'bulk-registration',
            metadata: {
              name: img.name,
              employee_id: img.employeeId,
              department: img.department,
            }
          };

          const { error: insertError } = await supabase
            .from('attendance_records')
            .insert({
              user_id: user.id,
              status: 'registered',
              category,
              device_info: deviceInfo,
              face_descriptor: Array.from(descriptor),
              confidence_score: 1.0,
              image_url: uploadError ? null : fileName,
            });

          if (insertError) throw insertError;

          updateImage(img.id, { status: 'success' });
          successCount++;
        } catch (err: any) {
          console.error('Registration error:', err);
          updateImage(img.id, {
            status: 'error',
            error: err.message || 'Registration failed'
          });
          errorCount++;
        }

        setProgress(Math.round(((i + 1) / images.length) * 100));
      }

      toast({
        title: "Bulk Registration Complete",
        description: `${successCount} succeeded, ${errorCount} failed`,
      });
    } catch (err) {
      console.error('Bulk registration error:', err);
      toast({
        title: "Registration Failed",
        description: "An error occurred during registration",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const pendingCount = images.filter(i => i.status === 'pending').length;
  const successCount = images.filter(i => i.status === 'success').length;
  const errorCount = images.filter(i => i.status === 'error').length;

  return (
    <>
      <ImageCropper
        imageSrc={cropperImage}
        open={cropperOpen}
        onCropComplete={handleCropComplete}
        onCancel={() => setCropperOpen(false)}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Bulk Registration
          </CardTitle>
          <CardDescription>
            Upload images directly or extract from PDF/documents with AI
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Upload Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'images' | 'pdf')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="images" className="gap-2">
                <FileImage className="h-4 w-4" />
                Upload Images
              </TabsTrigger>
              <TabsTrigger value="pdf" className="gap-2">
                <FileUp className="h-4 w-4" />
                Extract from PDF
              </TabsTrigger>
            </TabsList>

            <TabsContent value="images" className="mt-4">
              <div className="border-2 border-dashed rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageSelect}
                  className="hidden"
                  id="bulk-image-upload"
                  disabled={isProcessing}
                />
                <label
                  htmlFor="bulk-image-upload"
                  className="cursor-pointer flex flex-col items-center gap-4"
                >
                  <div className="p-4 bg-primary/10 rounded-full">
                    <Upload className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Click to upload images</p>
                    <p className="text-sm text-muted-foreground">
                      Names extracted from filenames automatically
                    </p>
                  </div>
                </label>
              </div>
            </TabsContent>

            <TabsContent value="pdf" className="mt-4">
              <div className="border-2 border-dashed rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  onChange={handlePdfSelect}
                  className="hidden"
                  id="pdf-upload"
                  disabled={isExtracting || isProcessing}
                />
                <label
                  htmlFor="pdf-upload"
                  className="cursor-pointer flex flex-col items-center gap-4"
                >
                  <div className="p-4 bg-primary/10 rounded-full">
                    {isExtracting ? (
                      <Loader2 className="h-8 w-8 text-primary animate-spin" />
                    ) : (
                      <Sparkles className="h-8 w-8 text-primary" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">
                      {isExtracting ? 'Extracting with AI...' : 'Upload PDF or ID Card Image'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      AI will extract names, IDs, and photos
                    </p>
                  </div>
                </label>
              </div>
            </TabsContent>
          </Tabs>

          {/* Category & Controls */}
          {images.length > 0 && (
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="category">Category:</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                  <SelectTrigger id="category" className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1" />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearAll}
                  disabled={isProcessing}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Clear All
                </Button>
                <Button
                  onClick={processAll}
                  disabled={isProcessing || pendingCount === 0}
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Register {pendingCount} {pendingCount === 1 ? 'User' : 'Users'}
                </Button>
              </div>
            </div>
          )}

          {/* Progress */}
          {isProcessing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Processing...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* Stats */}
          {images.length > 0 && (
            <div className="flex gap-4 flex-wrap">
              <Badge variant="outline" className="gap-1">
                <ImageIcon className="h-3 w-3" />
                {images.length} Total
              </Badge>
              {pendingCount > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <Loader2 className="h-3 w-3" />
                  {pendingCount} Pending
                </Badge>
              )}
              {successCount > 0 && (
                <Badge className="gap-1 bg-green-500">
                  <CheckCircle2 className="h-3 w-3" />
                  {successCount} Success
                </Badge>
              )}
              {errorCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3 w-3" />
                  {errorCount} Failed
                </Badge>
              )}
            </div>
          )}

          {/* Image Grid */}
          <ScrollArea className="max-h-[400px]">
            <AnimatePresence mode="popLayout">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-1">
                {images.map((img) => (
                  <motion.div
                    key={img.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className={`relative border rounded-lg p-3 space-y-3 ${
                      img.status === 'success'
                        ? 'border-green-500/50 bg-green-500/5'
                        : img.status === 'error'
                          ? 'border-destructive/50 bg-destructive/5'
                          : img.status === 'processing'
                            ? 'border-primary/50 bg-primary/5'
                            : ''
                    }`}
                  >
                    {/* Status Indicator */}
                    <div className="absolute -top-2 -right-2 z-10">
                      {img.status === 'processing' && (
                        <div className="p-1 bg-primary rounded-full">
                          <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" />
                        </div>
                      )}
                      {img.status === 'success' && (
                        <div className="p-1 bg-green-500 rounded-full">
                          <CheckCircle2 className="h-4 w-4 text-white" />
                        </div>
                      )}
                      {img.status === 'error' && (
                        <div className="p-1 bg-destructive rounded-full">
                          <XCircle className="h-4 w-4 text-white" />
                        </div>
                      )}
                    </div>

                    {/* Image Preview */}
                    <div className="relative aspect-square rounded-lg overflow-hidden bg-muted group">
                      {img.preview ? (
                        <img
                          src={img.preview}
                          alt={img.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <User className="h-12 w-12 text-muted-foreground" />
                        </div>
                      )}
                      {img.status === 'processing' && (
                        <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                      )}
                      {/* Edit overlay */}
                      {img.status === 'pending' && img.preview && !isProcessing && (
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openCropper(img.id, img.preview)}
                          >
                            <Edit2 className="h-4 w-4 mr-1" />
                            Adjust
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="space-y-2">
                      <Input
                        value={img.name}
                        onChange={(e) => updateImage(img.id, { name: e.target.value })}
                        placeholder="Name"
                        className="h-8 text-sm"
                        disabled={img.status !== 'pending' || isProcessing}
                      />
                      <Input
                        value={img.employeeId}
                        onChange={(e) => updateImage(img.id, { employeeId: e.target.value })}
                        placeholder="ID"
                        className="h-8 text-sm"
                        disabled={img.status !== 'pending' || isProcessing}
                      />
                    </div>

                    {/* Error Message */}
                    {img.status === 'error' && img.error && (
                      <div className="flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle className="h-3 w-3" />
                        {img.error}
                      </div>
                    )}

                    {/* Remove Button */}
                    {img.status === 'pending' && !isProcessing && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full h-7 text-xs"
                        onClick={() => removeImage(img.id)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Remove
                      </Button>
                    )}
                  </motion.div>
                ))}
              </div>
            </AnimatePresence>
          </ScrollArea>

          {/* Empty State */}
          {images.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No images added yet</p>
              <p className="text-sm">Upload photos or extract from PDF to get started</p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};

export default CombinedBulkRegistration;
