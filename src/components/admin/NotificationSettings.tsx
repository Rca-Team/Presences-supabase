import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Bell, Mail, MessageSquare, Smartphone, Loader2, ShieldAlert, Save } from 'lucide-react';

const KEYS = [
  'cutoff_time',
  'notify_channels',
  'twilio_account_sid',
  'twilio_auth_token',
  'twilio_from_number',
  'msg_template_present',
  'msg_template_late',
  'msg_template_absent',
] as const;

type SettingKey = typeof KEYS[number];

interface Channels { email: boolean; inapp: boolean; sms: boolean; }

const NotificationSettings: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cutoff, setCutoff] = useState('09:15');
  const [channels, setChannels] = useState<Channels>({ email: true, inapp: true, sms: false });
  const [twilio, setTwilio] = useState({ sid: '', token: '', from: '' });
  const [tplPresent, setTplPresent] = useState('');
  const [tplLate, setTplLate] = useState('');
  const [tplAbsent, setTplAbsent] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);

  const runTest = async () => {
    if (!testPhone.trim()) {
      toast({ title: 'Enter a phone number', description: 'Include country code, e.g. +919876543210', variant: 'destructive' });
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          phoneNumber: testPhone.trim(),
          studentName: 'Test Student',
          parentName: 'Parent',
          className: '10',
          section: 'A',
          status: 'present',
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast({ title: 'WhatsApp sent ✅', description: `Message ID: ${data.messageId || 'ok'}` });
      } else {
        toast({ title: 'WhatsApp failed', description: data?.error || 'Unknown error', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Test failed', description: e.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('attendance_settings')
        .select('key,value')
        .in('key', KEYS as unknown as string[]);
      const map = new Map<string, string>((data || []).map((r: any) => [r.key, r.value ?? '']));
      setCutoff(map.get('cutoff_time') || '09:15');
      try {
        const ch = JSON.parse(map.get('notify_channels') || '{}');
        setChannels({ email: !!ch.email, inapp: !!ch.inapp, sms: !!ch.sms });
      } catch { /* keep default */ }
      setTwilio({
        sid: map.get('twilio_account_sid') || '',
        token: map.get('twilio_auth_token') || '',
        from: map.get('twilio_from_number') || '',
      });
      setTplPresent(map.get('msg_template_present') || '');
      setTplLate(map.get('msg_template_late') || '');
      setTplAbsent(map.get('msg_template_absent') || '');
      setLoading(false);
    })();
  }, []);

  const upsert = async (key: SettingKey, value: string) => {
    const { data: existing } = await supabase
      .from('attendance_settings').select('id').eq('key', key).maybeSingle();
    if (existing?.id) {
      await supabase.from('attendance_settings').update({ value }).eq('id', existing.id);
    } else {
      await supabase.from('attendance_settings').insert({ key, value });
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all([
        upsert('cutoff_time', cutoff),
        upsert('notify_channels', JSON.stringify(channels)),
        upsert('twilio_account_sid', twilio.sid.trim()),
        upsert('twilio_auth_token', twilio.token.trim()),
        upsert('twilio_from_number', twilio.from.trim()),
        upsert('msg_template_present', tplPresent),
        upsert('msg_template_late', tplLate),
        upsert('msg_template_absent', tplAbsent),
      ]);
      toast({ title: 'Saved', description: 'Notification settings updated.' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cutoff & channels */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Attendance cutoff & channels</CardTitle>
          <CardDescription>
            After cutoff, late arrivals are flagged and the daily absence sweep runs.
            All parents in pilot classes receive a notification on every status change.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cutoff">Daily cutoff time</Label>
              <Input id="cutoff" type="time" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Students arriving after this time are marked late.</p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <Label>Channels</Label>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3"><Mail className="h-4 w-4" /><div><p className="font-medium text-sm">Email</p><p className="text-xs text-muted-foreground">Sent via the school's verified address.</p></div></div>
              <Switch checked={channels.email} onCheckedChange={(v) => setChannels((c) => ({ ...c, email: v }))} />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3"><Smartphone className="h-4 w-4" /><div><p className="font-medium text-sm">In-app (Parent Portal)</p><p className="text-xs text-muted-foreground">Realtime alerts inside parent dashboard.</p></div></div>
              <Switch checked={channels.inapp} onCheckedChange={(v) => setChannels((c) => ({ ...c, inapp: v }))} />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3"><MessageSquare className="h-4 w-4" /><div><p className="font-medium text-sm">SMS (Twilio)</p><p className="text-xs text-muted-foreground">Requires Twilio credentials below.</p></div></div>
              <Switch checked={channels.sms} onCheckedChange={(v) => setChannels((c) => ({ ...c, sms: v }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Twilio */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" /> Twilio (SMS)</CardTitle>
          <CardDescription>
            Add your Twilio Account SID, Auth Token and a verified sender number to send parent SMS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 p-3 flex gap-2 text-xs text-amber-800 dark:text-amber-200">
            <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>For production deployments we recommend storing the Auth Token as an encrypted secret instead of a settings row. Restrict admin access tightly.</span>
          </div>
          <div>
            <Label>Account SID</Label>
            <Input value={twilio.sid} onChange={(e) => setTwilio({ ...twilio, sid: e.target.value })} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" autoComplete="off" />
          </div>
          <div>
            <Label>Auth Token</Label>
            <Input type="password" value={twilio.token} onChange={(e) => setTwilio({ ...twilio, token: e.target.value })} placeholder="••••••••" autoComplete="off" />
          </div>
          <div>
            <Label>From number</Label>
            <Input value={twilio.from} onChange={(e) => setTwilio({ ...twilio, from: e.target.value })} placeholder="+1XXXXXXXXXX" />
          </div>
        </CardContent>
      </Card>

      {/* Templates */}
      <Card>
        <CardHeader>
          <CardTitle>Message templates</CardTitle>
          <div className="text-sm text-muted-foreground">
            Available variables: <Badge variant="outline">{'{parent}'}</Badge> <Badge variant="outline">{'{student}'}</Badge> <Badge variant="outline">{'{class}'}</Badge> <Badge variant="outline">{'{section}'}</Badge> <Badge variant="outline">{'{time}'}</Badge> <Badge variant="outline">{'{date}'}</Badge> <Badge variant="outline">{'{cutoff}'}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Present</Label><Textarea rows={2} value={tplPresent} onChange={(e) => setTplPresent(e.target.value)} /></div>
          <div><Label>Late</Label><Textarea rows={2} value={tplLate} onChange={(e) => setTplLate(e.target.value)} /></div>
          <div><Label>Absent</Label><Textarea rows={2} value={tplAbsent} onChange={(e) => setTplAbsent(e.target.value)} /></div>
        </CardContent>
      </Card>

      {/* Test services */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" /> Test services</CardTitle>
          <CardDescription>
            Send a live test WhatsApp message using the approved <code>attendance_notification</code> template.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <Label>Test phone (with country code)</Label>
              <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+919876543210" />
            </div>
            <Button variant="secondary" onClick={runTest} disabled={testing}>
              {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-2" />}
              Send test WhatsApp
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Uses your saved WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID. Template must be approved in Meta Business Manager.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save settings
        </Button>
      </div>
    </div>
  );
};

export default NotificationSettings;