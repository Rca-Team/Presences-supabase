import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { 
  Clock, 
  Camera, 
  Sparkles, 
  HardDrive, 
  RefreshCw, 
  CheckCircle2, 
  Zap, 
  Sun,
  Timer
} from 'lucide-react';
import { useRealtimeSettings } from '@/hooks/useRealtimeSettings';

const PRESET_TIMES = [
  { label: '7:30 AM', value: '07:30' },
  { label: '8:00 AM', value: '08:00' },
  { label: '8:15 AM', value: '08:15' },
  { label: '8:30 AM', value: '08:30' },
  { label: '9:00 AM', value: '09:00' },
];

const AttendanceCutoffSetting: React.FC = () => {
  const {
    settings,
    isLoading,
    isConnected,
    isSaving,
    setCutoffTime,
    setSaveFaceSamples,
  } = useRealtimeSettings();

  // Helper to format 24h string "08:15" to 12h display
  const formatTime12h = (time24: string) => {
    if (!time24) return '8:15 AM';
    const [hStr, mStr] = time24.split(':');
    const h = parseInt(hStr, 10) || 0;
    const m = parseInt(mStr, 10) || 0;
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 || 12;
    const displayMinute = m < 10 ? `0${m}` : m;
    return `${displayHour}:${displayMinute} ${period}`;
  };

  const handleTimeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      setCutoffTime(val);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Realtime Face Sample Auto-Save Setting Card */}
      <Card className="border-border/80 shadow-md relative overflow-hidden">
        <div
          className={`absolute top-0 left-0 right-0 h-1.5 transition-colors duration-300 ${
            settings.saveFaceSamples
              ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500'
              : 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500'
          }`}
        />

        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-xl border transition-colors ${
                  settings.saveFaceSamples
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                }`}
              >
                <Camera className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                  Save Face Photos to Training Dataset
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Save verified attendance face captures to student profiles to continually improve AI accuracy.
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <Badge
                variant="outline"
                className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                  isConnected
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                {isConnected ? 'REALTIME SYNC' : 'CONNECTING'}
              </Badge>
              {isSaving && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                  Saving...
                </span>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-1">
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1 pr-2">
              <Label htmlFor="save-samples-toggle" className="text-sm font-bold cursor-pointer">
                Automatic Face Learning Capture
              </Label>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {settings.saveFaceSamples
                  ? 'ACTIVE: Every high-confidence face scan during attendance or gate entry will save the image to the student\'s progressive training dataset to improve AI accuracy under varied lighting.'
                  : 'PAUSED: Attendance will still be marked and logged normally, but no new face photos will be saved to the training gallery (saves cloud storage & bandwidth).'}
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
              <span className={`text-xs font-bold transition-colors ${settings.saveFaceSamples ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                {settings.saveFaceSamples ? 'ON' : 'OFF'}
              </span>
              <Switch
                id="save-samples-toggle"
                checked={settings.saveFaceSamples}
                onCheckedChange={setSaveFaceSamples}
                disabled={isLoading}
                className="data-[state=checked]:bg-emerald-500 scale-110"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-background border border-border/50">
              <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
              <span><strong>When ON:</strong> Improves recognition under varied lighting & head angles.</span>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-background border border-border/50">
              <HardDrive className="w-4 h-4 text-amber-500 shrink-0" />
              <span><strong>When OFF:</strong> Prevents storage growth on high-volume days.</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Attendance Cutoff Time Card */}
      <Card className="border-border/80 shadow-md relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400" />

        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl border bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  Morning Attendance Cutoff Time
                  <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold text-xs">
                    {formatTime12h(settings.cutoffTime)}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Students scanned after this time will automatically be marked Late instead of Present.
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <Badge
                variant="outline"
                className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                  isConnected
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                {isConnected ? 'AUTO-SAVED LIVE' : 'SYNCING'}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-1">
          {/* Preset Buttons */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">
              Quick Timetable Presets
            </Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_TIMES.map((preset) => {
                const isSelected = settings.cutoffTime === preset.value;
                return (
                  <Button
                    key={preset.value}
                    type="button"
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    className={`rounded-xl text-xs font-medium transition-all ${
                      isSelected
                        ? 'shadow-md shadow-amber-500/20 bg-amber-600 hover:bg-amber-700 text-white'
                        : 'hover:bg-amber-500/10 hover:text-amber-600 hover:border-amber-500/30'
                    }`}
                    onClick={() => setCutoffTime(preset.value)}
                    disabled={isLoading}
                  >
                    <Timer className="w-3.5 h-3.5 mr-1.5" />
                    {preset.label}
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 ml-1.5" />}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Custom Time Selector */}
          <div className="p-3.5 rounded-xl border border-border/70 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label htmlFor="custom-cutoff-time" className="text-sm font-semibold">
                Custom Cutoff Time
              </Label>
              <p className="text-xs text-muted-foreground">
                Enter any specific morning cutoff time (24-hour clock).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="custom-cutoff-time"
                type="time"
                value={settings.cutoffTime}
                onChange={handleTimeInputChange}
                disabled={isLoading}
                className="w-36 h-10 rounded-xl font-mono text-sm font-semibold bg-background"
              />
            </div>
          </div>

          {/* Policy Summary */}
          <div className="rounded-xl border border-border/50 bg-background p-3 flex items-start gap-2.5 text-xs text-muted-foreground">
            <Sun className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <span>
                Arrivals up to <strong>{formatTime12h(settings.cutoffTime)}</strong> will be recorded as 
                <span className="text-emerald-600 font-semibold"> Present</span>.
                Arrivals after <strong>{formatTime12h(settings.cutoffTime)}</strong> will trigger
                <span className="text-amber-600 font-semibold"> Late Arrival </span> notices to parents.
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AttendanceCutoffSetting;
