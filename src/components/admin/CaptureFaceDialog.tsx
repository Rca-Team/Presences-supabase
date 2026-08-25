import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import Scan3DCapture from '@/components/register/Scan3DCapture';
import { loadRegistrationModels } from '@/services/face-recognition/OptimizedRegistrationService';
import { uploadFaceImage } from '@/services/face-recognition/RegistrationService';
import { storeFaceSample } from '@/services/face-recognition/ProgressiveTrainingService';
import { supabase } from '@/integrations/supabase/client';
import { descriptorToString } from '@/services/face-recognition/ModelService';
import { Sparkles, Loader2, ScanFace } from 'lucide-react';

interface Student {
  id: string;
  user_id: string;
  name: string;
  employee_id: string;
  roll_number?: string;
  category?: string;
  parent_name?: string;
  parent_phone?: string;
  parent_email?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Student | null;
  onSuccess?: () => void;
}

const CaptureFaceDialog: React.FC<Props> = ({ open, onOpenChange, student, onSuccess }) => {
  const { toast } = useToast();
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      try {
        setIsModelLoading(true);
        await loadRegistrationModels();
      } catch (e) {
        console.error('Failed loading models', e);
      } finally {
        if (mounted) setIsModelLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [open]);

  const handleScanComplete = async (
    averaged: Float32Array,
    primaryImage: string,
    rawDescriptors: Float32Array[],
  ) => {
    if (!student) return;
    setIsSaving(true);
    try {
      // IMPORTANT: Do NOT call registerFace() — it inserts a new attendance_records
      // row which creates a duplicate student in the admin table.
      // Instead, just attach face descriptors to the existing student's user_id.

      // 1. Upload primary image (best-effort) for visual reference
      let imageUrl: string | null = null;
      try {
        const response = await fetch(primaryImage);
        const blob = await response.blob();
        imageUrl = await uploadFaceImage(blob);
      } catch (uploadErr) {
        console.warn('Image upload failed, continuing without image URL', uploadErr);
      }

      // 2. Save the averaged descriptor to face_descriptors (primary recognition source)
      const { error: descErr } = await supabase.from('face_descriptors').insert({
        user_id: student.user_id,
        descriptor: descriptorToString(averaged) as any,
        label: student.name,
        image_url: imageUrl,
      });
      if (descErr) console.error('face_descriptors insert error', descErr);

      // 3. Store each angle sample for progressive training (max accuracy)
      for (const d of rawDescriptors) {
        await storeFaceSample(student.user_id, d, null, student.name, 1.0);
      }

      toast({
        title: 'Face Captured',
        description: `Added ${rawDescriptors.length} 3D face samples to ${student.name} (no duplicate created).`,
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast({
        title: 'Save failed',
        description: 'Could not save the captured face. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b bg-gradient-to-r from-cyan-50 via-blue-50 to-violet-50 dark:from-cyan-950/30 dark:via-blue-950/30 dark:to-violet-950/30">
          <DialogTitle className="flex items-center gap-2">
            <ScanFace className="h-5 w-5 text-primary" />
            3D Face Scan — {student?.name}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Apple-style multi-angle capture for highest recognition accuracy.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 sm:p-5">
          {isSaving ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Saving 3D face data…</p>
            </div>
          ) : (
            <Scan3DCapture
              isModelLoading={isModelLoading}
              onComplete={handleScanComplete}
            />
          )}
        </div>

        {!isSaving && (
          <div className="px-5 py-3 border-t bg-muted/30 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CaptureFaceDialog;