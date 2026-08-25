import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
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
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type Category = 'A' | 'B' | 'C' | 'D' | 'Teacher';

interface ImageEntry {
  id: string;
  file: File;
  preview: string;
  name: string;
  employeeId: string;
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

const BulkImageRegistration: React.FC = () => {
  const { toast } = useToast();
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [category, setCategory] = useState<Category>('A');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    const newImages: ImageEntry[] = files
      .filter(file => file.type.startsWith('image/'))
      .map((file, index) => {
        // Extract name from filename (remove extension)
        const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        const words = baseName.split(' ');
        const formattedName = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        
        return {
          id: `${Date.now()}-${index}`,
          file,
          preview: URL.createObjectURL(file),
          name: formattedName,
          employeeId: `STU-${String(Date.now() + index).slice(-6)}`,
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
  }, [toast]);

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
      if (img) URL.revokeObjectURL(img.preview);
      return prev.filter(i => i.id !== id);
    });
  };

  // Clear all
  const clearAll = () => {
    images.forEach(img => URL.revokeObjectURL(img.preview));
    setImages([]);
    setProgress(0);
  };

  // Process all images
  const processAll = async () => {
    if (images.length === 0) {
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
      // Load models if not already loaded
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
        
        if (img.status === 'success') {
          continue; // Skip already processed
        }

        updateImage(img.id, { status: 'processing' });

        try {
          // Load image
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

          // Save to database
          const deviceInfo = {
            source: 'bulk-registration',
            metadata: {
              name: img.name,
              employee_id: img.employeeId,
              department: category === 'Teacher' ? 'Faculty' : 'Student',
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
              image_url: img.preview.startsWith('data:') ? img.preview : null,
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
        variant: errorCount > 0 ? "default" : "default",
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileImage className="h-5 w-5" />
          Bulk Image Registration
        </CardTitle>
        <CardDescription>
          Upload multiple photos to register users in batch. Name will be extracted from filename.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload Area */}
        <div className="border-2 border-dashed rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
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
                or drag and drop multiple photos
              </p>
            </div>
          </label>
        </div>

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
          <div className="flex gap-4">
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
        <AnimatePresence mode="popLayout">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
                <div className="absolute -top-2 -right-2">
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
                <div className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                  <img 
                    src={img.preview} 
                    alt={img.name}
                    className="w-full h-full object-cover"
                  />
                  {img.status === 'processing' && (
                    <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
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

        {/* Empty State */}
        {images.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No images added yet</p>
            <p className="text-sm">Upload photos to get started</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BulkImageRegistration;
