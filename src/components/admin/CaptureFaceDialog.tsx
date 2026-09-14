import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import Scan3DCapture from '@/components/register/Scan3DCapture';
import { loadRegistrationModels } from '@/services/face-recognition/OptimizedRegistrationService';
import { uploadFaceImage } from '@/services/face-recognition/RegistrationService';
import { storeFaceSample } from '@/services/face-recognition/ProgressiveTrainingService';
import { supabase } from '@/integrations/supabase/client';
import { descriptorToString } from '@/services/face-recognition/ModelService';
import { syncFromSupabase as syncDescriptorCache } from '@/services/face-recognition/DescriptorCacheService';
import { Sparkles, Loader2, ScanFace, RefreshCw, UserCheck } from 'lucide-react';

interface Student {
  id: string;
  user_id?: string;
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
  const [replaceExisting, setReplaceExisting] = useState(true);

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
    rawImages?: string[],
  ) => {
    if (!student) return;
    setIsSaving(true);
    try {
      const targetUserId = student.user_id || `student-${student.employee_id || student.id}`;
      const studentEmpId = student.employee_id || '';

      // 1. Upload primary cropped image to Supabase Storage
      let imageUrl: string | null = null;
      let primaryBlob: Blob | null = null;
      try {
        const response = await fetch(primaryImage);
        primaryBlob = await response.blob();
        imageUrl = await uploadFaceImage(primaryBlob);
      } catch (uploadErr) {
        console.warn('Image upload failed, continuing without image URL', uploadErr);
      }

      // 2. If Recapture Mode (Replace Existing), clean up previous descriptors for this student
      if (replaceExisting) {
        if (student.user_id) {
          await supabase.from('face_descriptors').delete().eq('user_id', student.user_id);
        }
        if (studentEmpId) {
          await supabase.from('face_descriptors').delete().eq('student_id', studentEmpId);
        }
      }

      // 3. Save the averaged 3D descriptor to face_descriptors (primary recognition model)
      const { error: descErr } = await supabase.from('face_descriptors').insert({
        user_id: targetUserId,
        student_id: studentEmpId || null,
        descriptor: descriptorToString(averaged) as any,
        label: student.name,
        image_url: imageUrl,
      });
      if (descErr) console.error('face_descriptors insert error', descErr);

      // 4. Update profiles table with the new primary avatar photo
      if (imageUrl) {
        if (student.user_id) {
          await supabase
            .from('profiles')
            .update({ avatar_url: imageUrl, updated_at: new Date().toISOString() })
            .eq('user_id', student.user_id);
        }
        if (studentEmpId) {
          await supabase
            .from('profiles')
            .update({ avatar_url: imageUrl, updated_at: new Date().toISOString() })
            .or(`employee_id.eq.${studentEmpId},roll_number.eq.${studentEmpId}`);
        }
      }

      // 5. Store multi-angle training samples in database for progressive reinforcement
      // Upload each specific angle snapshot so every model slot has its authentic face photo
      for (let i = 0; i < rawDescriptors.length; i++) {
        const d = rawDescriptors[i];
        let sampleBlob: Blob | null = null;
        if (rawImages && rawImages[i]) {
          try {
            const resp = await fetch(rawImages[i]);
            sampleBlob = await resp.blob();
          } catch {}
        }
        if (!sampleBlob && primaryBlob) {
          sampleBlob = primaryBlob;
        }
        await storeFaceSample(targetUserId, d, sampleBlob, student.name, 1.0);
      }

      // 6. Instantly sync in-memory descriptor cache so attendance recognition updates immediately!
      try {
        await syncDescriptorCache();
      } catch (cacheErr) {
        console.warn('Descriptor cache sync error:', cacheErr);
      }

      toast({
        title: replaceExisting ? 'Face Recaptured & Replaced' : 'Face Samples Added',
        description: `Successfully calibrated ${rawDescriptors.length} 3D face angles for ${student.name}. Instant recognition is active.`,
      });

      onSuccess?.();
      onOpenChange(false);
    } catch (e: any) {
      console.error('Face capture save error:', e);
      toast({
        title: 'Save failed',
        description: e?.message || 'Could not save the captured face. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-xl max-h-[92dvh] overflow-y-auto p-0 rounded-[28px] border border-border/80 shadow-2xl">
        <DialogHeader className="px-5 pt-5 pb-4 border-b bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-indigo-500/10 dark:from-cyan-950/40 dark:via-blue-950/40 dark:to-indigo-950/40">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
              <ScanFace className="h-5 w-5 text-primary" />
              Recapture 3D Face — {student?.name}
            </DialogTitle>
            {student?.employee_id && (
              <Badge variant="outline" className="font-mono text-xs font-bold border-primary/30 text-primary">
                ID: {student.employee_id}
              </Badge>
            )}
          </div>
          <DialogDescription className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Apple TrueDepth multi-angle scan (frontal, left, right, up, down).
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 sm:p-5 space-y-4">
          {/* Recapture Mode Option */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border/60">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="replace-mode"
                checked={replaceExisting}
                onCheckedChange={(checked) => setReplaceExisting(!!checked)}
              />
              <Label
                htmlFor="replace-mode"
                className="text-xs sm:text-sm font-semibold cursor-pointer text-foreground select-none"
              >
                Replace previous face descriptors
              </Label>
            </div>
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              {replaceExisting ? 'Fresh 3D calibration' : 'Appends to current data'}
            </span>
          </div>

          {isSaving ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-sm font-bold text-foreground">Syncing 3D Face Descriptors…</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Updating models and instant recognition cache
                </p>
              </div>
            </div>
          ) : (
            <Scan3DCapture
              isModelLoading={isModelLoading}
              onComplete={handleScanComplete}
            />
          )}
        </div>

        {!isSaving && (
          <div className="px-5 py-3 border-t bg-muted/20 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
              Directly attached to {student?.name}
            </span>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="rounded-xl">
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CaptureFaceDialog;