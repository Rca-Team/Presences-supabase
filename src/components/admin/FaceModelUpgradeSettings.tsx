import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { BrainCircuit, Cpu, Zap, ShieldCheck, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useRealtimeSettings } from '@/hooks/useRealtimeSettings';

const FaceModelUpgradeSettings: React.FC = () => {
  const {
    settings,
    isLoading,
    isConnected,
    isSaving,
    setFaceModelStrategy,
  } = useRealtimeSettings();

  const handleModelChange = (model: 'ssd' | 'tiny') => {
    setFaceModelStrategy(model, settings.faceModelAllowFallback);
  };

  const handleFallbackToggle = (checked: boolean) => {
    setFaceModelStrategy(settings.faceModelPreferred, checked);
  };

  return (
    <Card className="border-border/80 shadow-md relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-500" />

      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl border bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                Face Recognition AI Strategy
                <Badge variant="outline" className="text-[11px] font-semibold">
                  {settings.faceModelPreferred === 'ssd' ? 'SSD MobileNet' : 'TinyFace'}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Configure which neural network model performs face detection on entry cameras and gate scanners.
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Preferred Detector Model */}
          <div className="space-y-2 p-3.5 rounded-xl border border-border/70 bg-muted/20">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-primary" />
                Preferred Detector
              </Label>
              <span className="text-[11px] text-muted-foreground">Auto-saved live</span>
            </div>
            <Select
              value={settings.faceModelPreferred}
              onValueChange={handleModelChange}
              disabled={isLoading}
            >
              <SelectTrigger className="h-10 rounded-xl bg-background">
                <SelectValue placeholder="Select face detector" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ssd">
                  <div className="flex flex-col text-left py-0.5">
                    <span className="font-semibold text-xs">SSD MobileNet V1 (Recommended)</span>
                    <span className="text-[10px] text-muted-foreground">Maximum precision, angles & occlusion resilience</span>
                  </div>
                </SelectItem>
                <SelectItem value="tiny">
                  <div className="flex flex-col text-left py-0.5">
                    <span className="font-semibold text-xs">TinyFaceDetector (Fast / Low Spec)</span>
                    <span className="text-[10px] text-muted-foreground">Ultralight for older phones & tablets</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {settings.faceModelPreferred === 'ssd'
                ? 'High accuracy mode is active. Optimal for standard gates and tablets.'
                : 'Speed mode is active. Faster FPS, suitable for low-power hardware.'}
            </p>
          </div>

          {/* Automatic Detector Fallback Switch */}
          <div className="flex flex-col justify-between p-3.5 rounded-xl border border-border/70 bg-muted/20 space-y-2">
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="fallback-switch" className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  Auto-Recovery Fallback
                </Label>
                <Switch
                  id="fallback-switch"
                  checked={settings.faceModelAllowFallback}
                  onCheckedChange={handleFallbackToggle}
                  disabled={isLoading}
                  className="data-[state=checked]:bg-blue-600"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                If the preferred detector encounters unexpected frame dropouts, smoothly fallback to the secondary detector without interrupting student entry.
              </p>
            </div>
            <div className="pt-1 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{settings.faceModelAllowFallback ? 'Zero-downtime fallback enabled' : 'Strict single detector mode'}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default FaceModelUpgradeSettings;
