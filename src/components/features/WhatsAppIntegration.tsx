import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  MessageCircle, Send, Settings, Bell, Check, Clock, AlertCircle, 
  Phone, History, Zap, Mail, MessageSquare, ArrowRight
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  contentHindi: string;
  type: 'attendance' | 'absent' | 'late' | 'custom';
}

interface NotificationLog {
  id: string;
  recipient_phone: string | null;
  message_content: string | null;
  notification_type: string | null;
  status: string | null;
  created_at: string;
  language: string | null;
}

const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: '1',
    name: 'Present Notification',
    content: '✅ Dear Parent, {student_name} has arrived at school at {time}. Have a great day! - Presence',
    contentHindi: '✅ नमस्ते! आपका बच्चा {student_name} आज {time} पर स्कूल पहुंच गया है। - Presence',
    type: 'attendance',
  },
  {
    id: '2',
    name: 'Absent Alert',
    content: '❌ Alert: {student_name} has been marked absent today ({date}). If unexpected, please contact the school. - Presence',
    contentHindi: '❌ सूचना: {student_name} आज ({date}) स्कूल में अनुपस्थित है। कृपया स्कूल से संपर्क करें। - Presence',
    type: 'absent',
  },
  {
    id: '3',
    name: 'Late Arrival',
    content: '⏰ Notice: {student_name} arrived late at {time} today. Please ensure timely arrival. - Presence',
    contentHindi: '⏰ सूचना: {student_name} आज {time} पर देरी से स्कूल पहुंचा/पहुंची। कृपया समय पर भेजें। - Presence',
    type: 'late',
  },
];

const WhatsAppIntegration: React.FC = () => {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<MessageTemplate[]>(DEFAULT_TEMPLATES);
  const [messageLogs, setMessageLogs] = useState<NotificationLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [settings, setSettings] = useState({
    autoNotifyPresent: false,
    autoNotifyAbsent: true,
    autoNotifyLate: true,
    preferredChannel: 'whatsapp' as 'whatsapp' | 'sms' | 'both',
    language: 'en' as 'en' | 'hi',
    quietHoursStart: '21:00',
    quietHoursEnd: '07:00',
  });

  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', content: '', contentHindi: '', type: 'custom' as const });
  const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'hi'>('en');

  useEffect(() => {
    loadSettings();
    loadMessageLogs();
  }, []);

  const loadSettings = () => {
    const saved = localStorage.getItem('whatsapp_settings');
    if (saved) setSettings(JSON.parse(saved));
  };

  const loadMessageLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('notification_log')
        .select('*')
        .in('notification_type', ['whatsapp', 'sms'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (data && !error) {
        setMessageLogs(data);
      }
    } catch (err) {
      console.error('Error loading logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const saveSettings = () => {
    localStorage.setItem('whatsapp_settings', JSON.stringify(settings));
    toast({ title: "Settings Saved", description: "WhatsApp/SMS notification settings updated." });
  };

  const sendTestMessage = async () => {
    if (!testPhone || !testMessage) {
      toast({ title: "Missing Information", description: "Enter phone number and message.", variant: "destructive" });
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          phoneNumber: testPhone,
          message: testMessage,
          language: selectedLanguage,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({ title: "✅ Message Sent", description: `WhatsApp message sent to ${testPhone}` });
        setTestPhone('');
        setTestMessage('');
        loadMessageLogs();
      } else {
        toast({
          title: "Message Failed",
          description: data?.error || "Failed to send. Check WhatsApp API configuration.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Send Failed",
        description: error.message || "Failed to send message.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const addTemplate = () => {
    if (!newTemplate.name || !newTemplate.content) {
      toast({ title: "Missing Information", description: "Fill in template name and content.", variant: "destructive" });
      return;
    }
    setTemplates(prev => [...prev, { id: Date.now().toString(), ...newTemplate }]);
    setNewTemplate({ name: '', content: '', contentHindi: '', type: 'custom' });
    toast({ title: "Template Added", description: "New message template created." });
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'sent':
        return <Badge variant="secondary"><Check className="h-3 w-3 mr-1" />Sent</Badge>;
      case 'delivered':
        return <Badge className="bg-green-600 text-white"><Check className="h-3 w-3 mr-1" />Delivered</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string | null) => {
    if (type === 'whatsapp') return <Badge className="bg-green-600 text-white"><MessageCircle className="h-3 w-3 mr-1" />WhatsApp</Badge>;
    if (type === 'sms') return <Badge variant="secondary"><MessageSquare className="h-3 w-3 mr-1" />SMS</Badge>;
    return <Badge variant="outline">{type}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card className="bg-gradient-to-r from-green-500/10 to-green-500/5 border-green-500/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-green-600 rounded-full">
                <MessageCircle className="h-8 w-8 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold">WhatsApp + SMS Notifications</h2>
                <p className="text-muted-foreground text-sm">
                  Automatic parent alerts via WhatsApp (primary) with SMS fallback
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="py-2 px-3">
                <MessageCircle className="h-3 w-3 mr-1 text-green-600" /> WhatsApp
              </Badge>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <Badge variant="outline" className="py-2 px-3">
                <MessageSquare className="h-3 w-3 mr-1" /> SMS Fallback
              </Badge>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <Badge variant="outline" className="py-2 px-3">
                <Mail className="h-3 w-3 mr-1" /> Email
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* How it works */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong>How it works:</strong> When attendance is marked, the system automatically sends a WhatsApp message to the parent. 
            If WhatsApp fails, it falls back to SMS (via Fast2SMS). Email is also sent if configured. 
            All channels work simultaneously — no manual action needed.
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="send" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="send" className="gap-2"><Send className="h-4 w-4" />Send</TabsTrigger>
          <TabsTrigger value="templates" className="gap-2"><MessageCircle className="h-4 w-4" />Templates</TabsTrigger>
          <TabsTrigger value="settings" className="gap-2"><Settings className="h-4 w-4" />Settings</TabsTrigger>
          <TabsTrigger value="logs" className="gap-2"><History className="h-4 w-4" />Logs</TabsTrigger>
        </TabsList>

        {/* Send Tab */}
        <TabsContent value="send">
          <Card>
            <CardHeader>
              <CardTitle>Send Test WhatsApp Message</CardTitle>
              <CardDescription>Test the WhatsApp integration by sending a real message</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Phone Number (with country code)</Label>
                <div className="flex gap-2">
                  <span className="flex items-center px-3 bg-muted rounded-l-md border border-r-0">
                    <Phone className="h-4 w-4" />
                  </span>
                  <Input
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="rounded-l-none"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant={selectedLanguage === 'en' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedLanguage('en')}
                >English</Button>
                <Button
                  variant={selectedLanguage === 'hi' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedLanguage('hi')}
                >हिंदी</Button>
              </div>

              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="Enter your message..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label>Quick Templates</Label>
                <div className="flex flex-wrap gap-2">
                  {templates.map(template => (
                    <Button
                      key={template.id}
                      variant="outline"
                      size="sm"
                      onClick={() => setTestMessage(
                        selectedLanguage === 'hi' ? template.contentHindi : template.content
                      )}
                    >
                      {template.name}
                    </Button>
                  ))}
                </div>
              </div>

              <Button onClick={sendTestMessage} disabled={isSending} className="w-full bg-green-600 hover:bg-green-700">
                {isSending ? (
                  <><Clock className="h-4 w-4 mr-2 animate-spin" />Sending...</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" />Send via WhatsApp</>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Message Templates (Bilingual)</CardTitle>
                <CardDescription>
                  Variables: {'{student_name}'}, {'{parent_name}'}, {'{time}'}, {'{date}'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {templates.map(template => (
                  <div key={template.id} className="p-4 border rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{template.name}</span>
                      <Badge variant="outline">{template.type}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">🇬🇧 {template.content}</p>
                    {template.contentHindi && (
                      <p className="text-sm text-muted-foreground">🇮🇳 {template.contentHindi}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Add New Template</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Template Name</Label>
                    <Input value={newTemplate.name} onChange={(e) => setNewTemplate(p => ({ ...p, name: e.target.value }))} placeholder="Template name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={newTemplate.type} onValueChange={(v: any) => setNewTemplate(p => ({ ...p, type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="attendance">Attendance</SelectItem>
                        <SelectItem value="absent">Absent</SelectItem>
                        <SelectItem value="late">Late</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>English Message</Label>
                  <Textarea value={newTemplate.content} onChange={(e) => setNewTemplate(p => ({ ...p, content: e.target.value }))} placeholder="English message..." rows={2} />
                </div>
                <div className="space-y-2">
                  <Label>हिंदी Message</Label>
                  <Textarea value={newTemplate.contentHindi} onChange={(e) => setNewTemplate(p => ({ ...p, contentHindi: e.target.value }))} placeholder="हिंदी में संदेश..." rows={2} />
                </div>
                <Button onClick={addTemplate}>Add Template</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Auto-Notification Settings</CardTitle>
              <CardDescription>Configure what triggers WhatsApp/SMS messages automatically</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                {[
                  { key: 'autoNotifyPresent', label: 'Auto-notify on Present', desc: 'Send confirmation when student marks attendance' },
                  { key: 'autoNotifyAbsent', label: 'Auto-notify on Absent', desc: 'Alert parents when student is marked absent' },
                  { key: 'autoNotifyLate', label: 'Auto-notify on Late', desc: 'Notify when student arrives late' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>{item.label}</Label>
                      <p className="text-sm text-muted-foreground">{item.desc}</p>
                    </div>
                    <Switch
                      checked={(settings as any)[item.key]}
                      onCheckedChange={(checked) => setSettings(prev => ({ ...prev, [item.key]: checked }))}
                    />
                  </div>
                ))}
              </div>

              <div className="border-t pt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Default Language</Label>
                  <Select value={settings.language} onValueChange={(v: any) => setSettings(p => ({ ...p, language: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="hi">हिंदी (Hindi)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Preferred Channel</Label>
                  <Select value={settings.preferredChannel} onValueChange={(v: any) => setSettings(p => ({ ...p, preferredChannel: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp (SMS fallback)</SelectItem>
                      <SelectItem value="sms">SMS Only</SelectItem>
                      <SelectItem value="both">Both WhatsApp + SMS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t pt-4">
                <Label className="mb-4 block">Quiet Hours</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm">Start</Label>
                    <Input type="time" value={settings.quietHoursStart} onChange={(e) => setSettings(p => ({ ...p, quietHoursStart: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">End</Label>
                    <Input type="time" value={settings.quietHoursEnd} onChange={(e) => setSettings(p => ({ ...p, quietHoursEnd: e.target.value }))} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">No notifications during quiet hours</p>
              </div>

              <Button onClick={saveSettings} className="w-full">Save Settings</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />Message History</CardTitle>
                <Button variant="outline" size="sm" onClick={loadMessageLogs} disabled={isLoadingLogs}>
                  {isLoadingLogs ? 'Loading...' : 'Refresh'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {messageLogs.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {messageLogs.map(log => (
                    <div key={log.id} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-sm">{log.recipient_phone || 'Unknown'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {getTypeBadge(log.notification_type)}
                          {getStatusBadge(log.status)}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{log.message_content}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(log.created_at), 'dd MMM yyyy, hh:mm a')}
                        {log.language === 'hi' && ' • हिंदी'}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No messages sent yet</p>
                  <p className="text-sm">Messages will appear here when attendance triggers notifications</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WhatsAppIntegration;
