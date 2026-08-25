import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Beaker } from 'lucide-react';

/**
 * Pilot Mode Settings
 *
 * Restricts auto parent notifications to a single class+section so the
 * facial-recognition attendance system can be rolled out in one classroom
 * before scaling. Stored in `attendance_settings` under keys:
 *   pilot_enabled, pilot_class, pilot_section
 */
const KEYS = ['pilot_enabled', 'pilot_class', 'pilot_section'] as const;

const PilotModeSettings: React.FC = () => {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [klass, setKlass] = useState('');
  const [section, setSection] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('attendance_settings')
        .select('key,value')
        .in('key', KEYS as unknown as string[]);
      const map = new Map<string, string>((data || []).map((r: any) => [r.key as string, (r.value as string) ?? '']));
      setEnabled((map.get('pilot_enabled') || 'false') === 'true');
      setKlass(map.get('pilot_class') || '');
      setSection(map.get('pilot_section') || '');
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const rows = [
        { key: 'pilot_enabled', value: String(enabled) },
        { key: 'pilot_class', value: klass.trim() },
        { key: 'pilot_section', value: section.trim() },
      ];
      const { error } = await supabase
        .from('attendance_settings')
        .upsert(rows, { onConflict: 'key' });
      if (error) throw error;
      toast({ title: 'Pilot mode saved', description: enabled ? `Notifications limited to ${klass} ${section}` : 'Pilot mode disabled' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Beaker className="w-4 h-4 text-primary" />
          Pilot Mode (Single Class)
          {enabled && <Badge variant="secondary">Active</Badge>}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          When enabled, automatic parent attendance notifications only fire for the
          configured class + section. Use this for the 4-week pilot rollout.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="pilot-enabled">Enable pilot mode</Label>
          <Switch id="pilot-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={loading} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="pilot-class">Class</Label>
            <Input id="pilot-class" placeholder="e.g. 8" value={klass} onChange={(e) => setKlass(e.target.value)} disabled={loading} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pilot-section">Section</Label>
            <Input id="pilot-section" placeholder="e.g. A" value={section} onChange={(e) => setSection(e.target.value)} disabled={loading} />
          </div>
        </div>
        <Button onClick={save} disabled={saving || loading} className="w-full sm:w-auto">
          {saving ? 'Saving…' : 'Save pilot settings'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default PilotModeSettings;