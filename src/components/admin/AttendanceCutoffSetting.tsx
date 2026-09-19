
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  getAttendanceCutoffTime, 
  updateAttendanceCutoffTime,
  formatCutoffTime,
  getSaveAttendanceFaceSamples,
  updateSaveAttendanceFaceSamples,
  isSaveAttendanceFaceSamplesEnabledSync
} from '@/services/attendance/AttendanceSettingsService';
import { supabase } from '@/integrations/supabase/client';
import { 
  Loader2, 
  Clock, 
  AlertTriangle, 
  Camera, 
  Sparkles, 
  CheckCircle2, 
  ShieldCheck, 
  HardDrive, 
  Zap,
  Info,
  Sliders,
  Power
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const AttendanceCutoffSetting = () => {
  const [hour, setHour] = useState<number>(7);
  const [minute, setMinute] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real-time Save Attendance Face Samples Setting State
  const [saveFaceSamples, setSaveFaceSamples] = useState<boolean>(isSaveAttendanceFaceSamplesEnabledSync());
  const [isTogglingSamples, setIsTogglingSamples] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [time, samplesEnabled] = await Promise.all([
        getAttendanceCutoffTime(),
        getSaveAttendanceFaceSamples()
      ]);

      setHour(time.hour);
      setMinute(time.minute);
      setSaveFaceSamples(samplesEnabled);
    } catch (err) {
      console.error('Error loading settings:', err);
      setError('Failed to load settings from server. Default values are shown.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();

    // Listen to local client event changes
    const handleLocalSettingChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ enabled: boolean }>;
      if (typeof customEvent.detail?.enabled === 'boolean') {
        setSaveFaceSamples(customEvent.detail.enabled);
      }
    };
    window.addEventListener('presence:save-samples-setting-changed', handleLocalSettingChange);

    // Realtime Postgres change subscription for live sync across all devices
    const channel = supabase
      .channel('attendance-settings-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_settings' },
        (payload: any) => {
          const newRow = payload.new;
          if (newRow?.key === 'save_attendance_face_samples') {
            const isEnabled = String(newRow.value).toLowerCase() === 'true' || newRow.value === true || newRow.value === '1';
            setSaveFaceSamples(isEnabled);
            toast.info(`Face Sample Saving is now ${isEnabled ? 'ENABLED' : 'DISABLED'} (Synced in Realtime)`);
          } else if (newRow?.key === 'cutoff_time') {
            const timeStr = String(newRow.value || '07:30');
            const [h, m] = timeStr.split(':');
            setHour(parseInt(h) || 7);
            setMinute(parseInt(m) || 30);
          }
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('presence:save-samples-setting-changed', handleLocalSettingChange);
      supabase.removeChannel(channel);
    };
  }, [loadSettings]);

  const handleToggleSaveSamples = async (checked: boolean) => {
    try {
      setIsTogglingSamples(true);
      // Optimistic update
      setSaveFaceSamples(checked);

      await updateSaveAttendanceFaceSamples(checked);

      if (checked) {
        toast.success('Face Sample Photo Saving ENABLED (Realtime Active)', {
          description: 'High-confidence attendance captures will now be saved to student face sample datasets.'
        });
      } else {
        toast.warning('Face Sample Photo Saving PAUSED (Storage Optimized)', {
          description: 'Attendance will still be marked, but no new face photos will be saved to the training dataset.'
        });
      }
    } catch (err: any) {
      console.error('Failed to toggle save face samples:', err);
      // Rollback on error
      setSaveFaceSamples(!checked);
      toast.error('Failed to update setting', {
        description: err.message || 'Please check admin permissions.'
      });
    } finally {
      setIsTogglingSamples(false);
    }
  };

  const handleSubmitCutoff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      
      if (hour < 0 || hour > 23) {
        toast.error('Hours must be between 0 and 23.');
        setError('Hours must be between 0 and 23.');
        return;
      }
      
      if (minute < 0 || minute > 59) {
        toast.error('Minutes must be between 0 and 59.');
        setError('Minutes must be between 0 and 59.');
        return;
      }
      
      await updateAttendanceCutoffTime(hour, minute);
      toast.success('Attendance cutoff time updated successfully.');
    } catch (err: any) {
      console.error('Error updating cutoff time:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(`Failed to update attendance cutoff time. ${errorMessage}`);
      toast.error('Failed to update attendance cutoff time.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Realtime Face Sample Auto-Save Setting Card */}
      <Card className="border-border/80 shadow-md relative overflow-hidden">
        <div className={`absolute top-0 left-0 right-0 h-1.5 transition-colors duration-300 ${saveFaceSamples ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500' : 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500'}`} />
        
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-xl border transition-colors ${saveFaceSamples ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'}`}>
                  <Camera className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                    Save Face Images to Training Samples
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    Control whether face scanner captures are automatically saved to student face sample datasets.
                  </CardDescription>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 self-start sm:self-center">
              <Badge 
                variant="outline" 
                className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                  saveFaceSamples 
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' 
                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${saveFaceSamples ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                {saveFaceSamples ? 'REALTIME ON' : 'REALTIME OFF'}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-1">
          {loading ? (
            <div className="flex justify-center p-6">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1 pr-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="save-samples-toggle" className="text-sm font-bold cursor-pointer">
                      Automatic Face Sample Capture on Attendance
                    </Label>
                    {isTogglingSamples && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {saveFaceSamples
                      ? 'ACTIVE: Every high-confidence face scan during attendance or gate entry will save the image to the student\'s progressive training dataset to improve AI accuracy.'
                      : 'PAUSED: Attendance will still be marked and logged normally, but no new face photos will be saved to the training gallery (saves storage & bandwidth).'}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                  <span className={`text-xs font-bold transition-colors ${saveFaceSamples ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                    {saveFaceSamples ? 'ON' : 'OFF'}
                  </span>
                  <Switch
                    id="save-samples-toggle"
                    checked={saveFaceSamples}
                    onCheckedChange={handleToggleSaveSamples}
                    disabled={isTogglingSamples}
                    className="data-[state=checked]:bg-emerald-500 scale-110"
                  />
                </div>
              </div>

              {/* Information Footnote */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-background border border-border/50">
                  <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span><strong>When ON:</strong> Improves recognition under varied lighting & angles.</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-background border border-border/50">
                  <HardDrive className="w-4 h-4 text-amber-500 shrink-0" />
                  <span><strong>When OFF:</strong> Prevents storage growth on high-volume days.</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Attendance Cutoff Time Card */}
      <Card className="border-border/80 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center text-base sm:text-lg">
            <Clock className="h-5 w-5 mr-2 text-primary" />
            Attendance Cutoff Time & Morning Policies
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Set the morning cutoff time. Students recognized after this time will automatically be marked as Late.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <p className="text-xs sm:text-sm text-muted-foreground mb-4">
                Current official morning cutoff: <span className="font-bold text-foreground">{formatCutoffTime({ hour, minute })}</span>
              </p>
              
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <form onSubmit={handleSubmitCutoff} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hour" className="text-xs font-semibold">Hour (0-23)</Label>
                    <Input
                      id="hour"
                      type="number"
                      min={0}
                      max={23}
                      value={hour}
                      onChange={(e) => setHour(Number(e.target.value))}
                      className="h-10 rounded-xl"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="minute" className="text-xs font-semibold">Minute (0-59)</Label>
                    <Input
                      id="minute"
                      type="number"
                      min={0}
                      max={59}
                      value={minute}
                      onChange={(e) => setMinute(Number(e.target.value))}
                      className="h-10 rounded-xl"
                      required
                    />
                  </div>
                </div>
                
                <Button type="submit" disabled={saving} className="rounded-xl font-bold text-xs h-9">
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Update Cutoff Time'
                  )}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AttendanceCutoffSetting;
