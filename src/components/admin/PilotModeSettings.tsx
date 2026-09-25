import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Beaker, CheckCircle2, Radio, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import { useRealtimeSettings } from '@/hooks/useRealtimeSettings';

/**
 * Pilot Mode Settings (Realtime)
 *
 * Restricts auto parent notifications to a single class+section so the
 * facial-recognition attendance system can be tested in one classroom
 * before rolling out school-wide.
 * Syncs in real-time across all admin screens and devices.
 */
const PilotModeSettings: React.FC = () => {
  const {
    settings,
    isLoading,
    isConnected,
    isSaving,
    setPilotMode,
    setPilotClass,
    setPilotSection,
  } = useRealtimeSettings();

  const handleToggle = (checked: boolean) => {
    setPilotMode(checked);
  };

  return (
    <Card className="border-border/80 shadow-md relative overflow-hidden">
      {/* Decorative top accent */}
      <div
        className={`absolute top-0 left-0 right-0 h-1.5 transition-colors duration-300 ${
          settings.pilotEnabled
            ? 'bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-500'
            : 'bg-muted'
        }`}
      />

      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl border transition-colors ${
                settings.pilotEnabled
                  ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30'
                  : 'bg-muted text-muted-foreground border-border'
              }`}
            >
              <Beaker className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                Pilot Mode (Single Class Rollout)
                {settings.pilotEnabled ? (
                  <Badge variant="secondary" className="bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-300 text-[11px] font-bold">
                    Class {settings.pilotClass || '—'} {settings.pilotSection || '—'} Only
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[11px] text-muted-foreground">
                    All Classes Active
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                When enabled, automated parent notifications (Email/SMS) only fire for students in this test class.
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
        {/* Toggle Switch */}
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/70 bg-muted/20">
          <div className="space-y-0.5 pr-2">
            <Label htmlFor="pilot-enabled" className="text-sm font-semibold cursor-pointer">
              Enable Classroom Isolation
            </Label>
            <p className="text-xs text-muted-foreground">
              {settings.pilotEnabled
                ? `Only parents of Class ${settings.pilotClass || '—'} - Section ${settings.pilotSection || '—'} will receive notifications.`
                : 'Turn this on to safely test scanner accuracy on one classroom without sending notifications to all parents.'}
            </p>
          </div>
          <Switch
            id="pilot-enabled"
            checked={settings.pilotEnabled}
            onCheckedChange={handleToggle}
            disabled={isLoading}
            className="data-[state=checked]:bg-purple-600 scale-105"
          />
        </div>

        {/* Target Class & Section Inputs */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 transition-opacity duration-300 ${settings.pilotEnabled ? 'opacity-100' : 'opacity-60'}`}>
          <div className="space-y-1.5">
            <Label htmlFor="pilot-class" className="text-xs font-semibold">
              Test Class / Grade
            </Label>
            <Input
              id="pilot-class"
              placeholder="e.g. 8, 9, 10"
              value={settings.pilotClass}
              onChange={(e) => setPilotClass(e.target.value)}
              disabled={isLoading || !settings.pilotEnabled}
              className="h-10 rounded-xl"
            />
            <p className="text-[11px] text-muted-foreground">Changes auto-save in real-time.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pilot-section" className="text-xs font-semibold">
              Test Section
            </Label>
            <Input
              id="pilot-section"
              placeholder="e.g. A, B, C"
              value={settings.pilotSection}
              onChange={(e) => setPilotSection(e.target.value)}
              disabled={isLoading || !settings.pilotEnabled}
              className="h-10 rounded-xl"
            />
            <p className="text-[11px] text-muted-foreground">Changes auto-save in real-time.</p>
          </div>
        </div>

        {settings.pilotEnabled && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-300 text-xs">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>
              <strong>Pilot Active:</strong> Face scanner captures all students, but notification dispatch is restricted to Class <strong>{settings.pilotClass}</strong> Section <strong>{settings.pilotSection}</strong>.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PilotModeSettings;