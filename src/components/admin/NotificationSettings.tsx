import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Bell, 
  Mail, 
  MessageSquare, 
  Smartphone, 
  Loader2, 
  ShieldAlert, 
  Save, 
  CheckCircle2, 
  RefreshCw,
  Send,
  Sparkles
} from 'lucide-react';
import DailyEmailFrequencySetting from '@/components/admin/DailyEmailFrequencySetting';
import { useRealtimeSettings } from '@/hooks/useRealtimeSettings';

const NotificationSettings: React.FC = () => {
  const {
    settings,
    isLoading,
    isConnected,
    isSaving,
    setNotifyChannel,
    setTwilioConfig,
    setMessageTemplate,
  } = useRealtimeSettings();

  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);

  const runTest = async () => {
    if (!testPhone.trim()) {
      toast.error('Enter a phone number', {
        description: 'Include country code, e.g. +919876543210',
      });
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
        toast.success('WhatsApp test message sent successfully!', {
          description: `Message ID: ${data.messageId || 'ok'}`,
        });
      } else {
        toast.error('WhatsApp failed', {
          description: data?.error || 'Unknown error occurred.',
        });
      }
    } catch (e: any) {
      toast.error('Test failed', { description: e.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Daily Email Rate Limiter Realtime Control */}
      <DailyEmailFrequencySetting />

      {/* 2. Parent Notification Channels (Realtime) */}
      <Card className="border-border/80 shadow-md relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500" />

        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl border bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  Parent Notification Channels
                  <Badge variant="outline" className="text-[11px] font-semibold">
                    Realtime Auto-Save
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Select which transmission channels notify parents when their child's attendance is verified.
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
                {isConnected ? 'LIVE SYNC ACTIVE' : 'CONNECTING'}
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

        <CardContent className="space-y-3 pt-1">
          {/* Email Channel */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/70 bg-muted/20">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-sm">Email Alerts</p>
                <p className="text-xs text-muted-foreground">Sent via Resend / official school email domain.</p>
              </div>
            </div>
            <Switch
              checked={settings.notifyChannels.email}
              onCheckedChange={(v) => setNotifyChannel('email', v)}
              disabled={isLoading}
              className="data-[state=checked]:bg-emerald-500"
            />
          </div>

          {/* In-app Portal Channel */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/70 bg-muted/20">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
                <Smartphone className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-sm">In-App (Parent Portal & PWA)</p>
                <p className="text-xs text-muted-foreground">Instant push and realtime alerts inside the Parent Dashboard.</p>
              </div>
            </div>
            <Switch
              checked={settings.notifyChannels.inapp}
              onCheckedChange={(v) => setNotifyChannel('inapp', v)}
              disabled={isLoading}
              className="data-[state=checked]:bg-blue-600"
            />
          </div>

          {/* SMS Channel */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/70 bg-muted/20">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600">
                <MessageSquare className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-sm">SMS (Twilio)</p>
                <p className="text-xs text-muted-foreground">Direct SMS to parent mobile number. Requires Twilio credentials below.</p>
              </div>
            </div>
            <Switch
              checked={settings.notifyChannels.sms}
              onCheckedChange={(v) => setNotifyChannel('sms', v)}
              disabled={isLoading}
              className="data-[state=checked]:bg-amber-600"
            />
          </div>
        </CardContent>
      </Card>

      {/* 3. Twilio SMS Integration */}
      <Card className="border-border/80 shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <MessageSquare className="h-5 w-5 text-amber-600" />
            Twilio (SMS Gateway Settings)
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Configure Twilio Account SID, Auth Token and registered Sender Number for parent SMS dispatch.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-xl border bg-amber-500/10 border-amber-500/30 p-3 flex gap-2.5 text-xs text-amber-800 dark:text-amber-200">
            <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-600" />
            <span>Settings auto-save as you type. Restrict school admin access tightly to keep API keys secure.</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Account SID</Label>
              <Input
                value={settings.twilioSid}
                onChange={(e) => setTwilioConfig({ sid: e.target.value })}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                autoComplete="off"
                className="h-10 rounded-xl font-mono text-xs mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Auth Token</Label>
              <Input
                type="password"
                value={settings.twilioToken}
                onChange={(e) => setTwilioConfig({ token: e.target.value })}
                placeholder="••••••••••••••••••••••••"
                autoComplete="off"
                className="h-10 rounded-xl font-mono text-xs mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold">From Number / Sender ID</Label>
            <Input
              value={settings.twilioFrom}
              onChange={(e) => setTwilioConfig({ from: e.target.value })}
              placeholder="+1XXXXXXXXXX"
              className="h-10 rounded-xl font-mono text-xs mt-1 max-w-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* 4. Notification Message Templates */}
      <Card className="border-border/80 shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Message Templates</CardTitle>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-1.5 items-center pt-1">
            <span>Available variables:</span>
            <Badge variant="outline" className="text-[10px] font-mono">{'{student_name}'}</Badge>
            <Badge variant="outline" className="text-[10px] font-mono">{'{time}'}</Badge>
            <Badge variant="outline" className="text-[10px] font-mono">{'{date}'}</Badge>
            <Badge variant="outline" className="text-[10px] font-mono">{'{class}'}</Badge>
            <Badge variant="outline" className="text-[10px] font-mono">{'{section}'}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-emerald-600">On Time Arrival (Present)</Label>
            <Textarea
              rows={2}
              value={settings.msgTemplatePresent}
              onChange={(e) => setMessageTemplate('present', e.target.value)}
              className="rounded-xl text-xs resize-none"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-amber-600">Late Arrival</Label>
            <Textarea
              rows={2}
              value={settings.msgTemplateLate}
              onChange={(e) => setMessageTemplate('late', e.target.value)}
              className="rounded-xl text-xs resize-none"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-rose-600">Absence Notice (Post-Cutoff)</Label>
            <Textarea
              rows={2}
              value={settings.msgTemplateAbsent}
              onChange={(e) => setMessageTemplate('absent', e.target.value)}
              className="rounded-xl text-xs resize-none"
            />
          </div>
        </CardContent>
      </Card>

      {/* 5. Live WhatsApp Diagnostics / Test Service */}
      <Card className="border-border/80 shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Send className="h-5 w-5 text-emerald-600" />
            Live WhatsApp Service Test
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Send an instant test WhatsApp message to verify Meta Business webhook connectivity.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <Label className="text-xs font-semibold">Test Mobile Number (with country code)</Label>
              <Input
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="+919876543210"
                className="h-10 rounded-xl font-mono text-xs mt-1"
              />
            </div>
            <Button
              variant="outline"
              onClick={runTest}
              disabled={testing}
              className="h-10 rounded-xl text-xs font-semibold border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
            >
              {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send Test WhatsApp
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Uses your school's WhatsApp Cloud API configuration.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default NotificationSettings;