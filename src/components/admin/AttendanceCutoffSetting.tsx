
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { 
  getAttendanceCutoffTime, 
  updateAttendanceCutoffTime,
  formatCutoffTime 
} from '@/services/attendance/AttendanceSettingsService';
import { Loader2, Clock, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const AttendanceCutoffSetting = () => {
  const [hour, setHour] = useState<number>(9);
  const [minute, setMinute] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const loadCutoffTime = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log('Loading cutoff time...');
        const time = await getAttendanceCutoffTime();
        console.log('Loaded cutoff time:', time);
        setHour(time.hour);
        setMinute(time.minute);
      } catch (error) {
        console.error('Error loading cutoff time:', error);
        setError('Failed to load attendance cutoff time. Default values are being shown.');
        toast.error('Failed to load attendance cutoff time.');
      } finally {
        setLoading(false);
      }
    };
    
    loadCutoffTime();
  }, []);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      setError(null);
      
      // Validate inputs
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
      
      console.log('Sending update with values:', { hour, minute });
      await updateAttendanceCutoffTime(hour, minute);
      toast.success('Attendance cutoff time updated successfully.');
      
    } catch (error) {
      console.error('Error updating cutoff time:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(`Failed to update attendance cutoff time. ${errorMessage}`);
      toast.error('Failed to update attendance cutoff time.');
    } finally {
      setSaving(false);
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Clock className="h-5 w-5 mr-2" />
          Attendance Cutoff Time
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Set the cutoff time for attendance. Students recognized after this time will be marked as late.
              Current cutoff time: <span className="font-medium">{formatCutoffTime({ hour, minute })}</span>
            </p>
            
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="hour">Hour (0-23)</Label>
                  <Input
                    id="hour"
                    type="number"
                    min={0}
                    max={23}
                    value={hour}
                    onChange={(e) => setHour(Number(e.target.value))}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="minute">Minute (0-59)</Label>
                  <Input
                    id="minute"
                    type="number"
                    min={0}
                    max={59}
                    value={minute}
                    onChange={(e) => setMinute(Number(e.target.value))}
                    required
                  />
                </div>
              </div>
              
              <Button type="submit" disabled={saving}>
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
  );
};

export default AttendanceCutoffSetting;
