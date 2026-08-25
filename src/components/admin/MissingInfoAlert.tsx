import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Loader2, Save, Camera, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import CaptureFaceDialog from './CaptureFaceDialog';
import { FaceInfo } from './utils/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  face: FaceInfo | null;
  missing: string[];
}

// Map UI labels -> metadata keys
const FIELD_MAP: Record<string, { key: string; placeholder: string; type?: string }> = {
  'Roll Number': { key: 'roll_number', placeholder: 'e.g. 23' },
  'Blood Group': { key: 'blood_group', placeholder: 'e.g. O+' },
  'Parent Name': { key: 'parent_name', placeholder: 'Full name' },
  'Parent Phone': { key: 'parent_phone', placeholder: '+91XXXXXXXXXX', type: 'tel' },
  'Parent Email': { key: 'parent_email', placeholder: 'parent@example.com', type: 'email' },
  'Transport Mode': { key: 'transport_mode', placeholder: 'Bus / Walk / Private' },
  'Address': { key: 'address', placeholder: 'Home address' },
};

const MissingInfoAlert: React.FC<Props> = ({ open, onOpenChange, face, missing }) => {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);

  useEffect(() => {
    if (open) setValues({});
  }, [open, face?.recordId]);

  if (!face) return null;

  const editableFields = missing.filter((m) => m !== 'Photo');
  const photoMissing = missing.includes('Photo');

  const handleChange = (label: string, v: string) => {
    setValues((prev) => ({ ...prev, [label]: v }));
  };

  const handleSave = async () => {
    const userId = face.user_id;
    if (!userId) {
      toast({ title: 'Missing user reference', description: 'Cannot locate this student record.', variant: 'destructive' });
      return;
    }

    // Build metadata patch from filled fields only
    const patch: Record<string, string> = {};
    for (const label of editableFields) {
      const cfg = FIELD_MAP[label];
      const val = values[label]?.trim();
      if (cfg && val) patch[cfg.key] = val;
    }

    if (Object.keys(patch).length === 0) {
      toast({ title: 'Nothing to save', description: 'Fill at least one field before saving.' });
      return;
    }

    setSaving(true);
    try {
      // Update every attendance_records row for this user (registered + history)
      const { data: rows, error: fetchErr } = await supabase
        .from('attendance_records')
        .select('id, device_info')
        .eq('user_id', userId);
      if (fetchErr) throw fetchErr;

      let updated = 0;
      for (const r of rows || []) {
        const di: any = typeof r.device_info === 'string' ? JSON.parse(r.device_info) : (r.device_info || {});
        const metadata = (di && typeof di.metadata === 'object' && di.metadata) ? di.metadata : {};
        const newDi = { ...di, metadata: { ...metadata, ...patch } };
        const { error: upErr } = await supabase
          .from('attendance_records')
          .update({ device_info: newDi })
          .eq('id', r.id);
        if (!upErr) updated++;
      }

      // Also sync to profiles table for parent-related fields (used by notifications)
      const profilePatch: Record<string, string> = {};
      if (patch.parent_name) profilePatch.parent_name = patch.parent_name;
      if (patch.parent_email) profilePatch.parent_email = patch.parent_email;
      if (patch.parent_phone) profilePatch.parent_phone = patch.parent_phone;
      if (Object.keys(profilePatch).length > 0) {
        await supabase.from('profiles').update(profilePatch).eq('user_id', userId);
      }

      toast({
        title: 'Profile updated',
        description: `Saved ${Object.keys(patch).length} field(s) across ${updated} record(s).`,
      });
      onOpenChange(false);
    } catch (err: any) {
      console.error('Failed to save missing info:', err);
      toast({ title: 'Save failed', description: err.message || 'Try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const studentForCapture = face.user_id
    ? {
        id: face.user_id,
        user_id: face.user_id,
        name: face.name,
        employee_id: face.employee_id,
        roll_number: face.roll_number,
        parent_name: face.parent_name,
        parent_phone: face.parent_phone,
        parent_email: face.parent_email,
      }
    : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <motion.div
                initial={{ scale: 0.8, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0"
              >
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </motion.div>
              <div>
                <DialogTitle>Complete {face.name}'s Profile</DialogTitle>
                <DialogDescription>
                  Fill the missing details below — changes save instantly.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {editableFields.length > 0 && (
              <div className="space-y-3">
                {editableFields.map((label, idx) => {
                  const cfg = FIELD_MAP[label];
                  if (!cfg) return null;
                  return (
                    <motion.div
                      key={label}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      className="space-y-1.5"
                    >
                      <Label htmlFor={`mi-${cfg.key}`} className="text-xs font-medium flex items-center gap-1.5">
                        {label}
                        <Badge
                          variant="outline"
                          className="h-4 px-1.5 text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                        >
                          missing
                        </Badge>
                      </Label>
                      <Input
                        id={`mi-${cfg.key}`}
                        type={cfg.type || 'text'}
                        placeholder={cfg.placeholder}
                        value={values[label] || ''}
                        onChange={(e) => handleChange(label, e.target.value)}
                        className="h-9"
                      />
                    </motion.div>
                  );
                })}
              </div>
            )}

            {photoMissing && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-dashed border-cyan-500/40 bg-cyan-500/5 p-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Camera className="h-4 w-4 text-cyan-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Face Photo</p>
                    <p className="text-xs text-muted-foreground truncate">
                      Run a 3D scan to register this student's face.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCaptureOpen(true)}
                  disabled={!studentForCapture}
                >
                  <Camera className="h-4 w-4 mr-1.5" />
                  Capture
                </Button>
              </motion.div>
            )}

            {editableFields.length === 0 && !photoMissing && (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Profile is complete.
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Close
            </Button>
            {editableFields.length > 0 && (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-1.5" />
                    Save Changes
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CaptureFaceDialog
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        student={studentForCapture}
        onSuccess={() => {
          setCaptureOpen(false);
          onOpenChange(false);
        }}
      />
    </>
  );
};

export default MissingInfoAlert;