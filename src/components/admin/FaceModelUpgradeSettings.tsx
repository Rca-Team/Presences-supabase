import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, BrainCircuit } from 'lucide-react';
import { toast } from 'sonner';
import {
  getFaceModelSettings,
  updateFaceModelSettings,
  type FaceDetectionModel,
} from '@/services/face-recognition/FaceModelSettingsService';

const FaceModelUpgradeSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferredModel, setPreferredModel] = useState<FaceDetectionModel>('ssd');
  const [allowFallback, setAllowFallback] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const settings = await getFaceModelSettings();
        setPreferredModel(settings.preferredModel);
        setAllowFallback(settings.allowFallback);
      } catch (error) {
        console.error('Error loading face model settings:', error);
        toast.error('Failed to load model settings. Using defaults.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const saveSettings = async () => {
    try {
      setSaving(true);
      await updateFaceModelSettings({ preferredModel, allowFallback });
      toast.success('Face model strategy updated successfully.');
    } catch (error) {
      console.error('Error saving face model settings:', error);
      toast.error('Failed to save face model strategy.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <BrainCircuit className="h-5 w-5 mr-2" />
          Face Model Upgrade
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Choose the primary face detector for tracking accuracy and define if automatic fallback is allowed.
            </p>

            <div className="space-y-2">
              <Label>Preferred model</Label>
              <Select value={preferredModel} onValueChange={(value: FaceDetectionModel) => setPreferredModel(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ssd">Best accuracy (SSD MobileNet)</SelectItem>
                  <SelectItem value="tiny">Fast mode (TinyFaceDetector)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">Enable fallback</p>
                <p className="text-xs text-muted-foreground">
                  If the preferred model fails or returns no faces, auto-try the other detector.
                </p>
              </div>
              <Switch checked={allowFallback} onCheckedChange={setAllowFallback} />
            </div>

            <Button onClick={saveSettings} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Model Strategy'
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FaceModelUpgradeSettings;
