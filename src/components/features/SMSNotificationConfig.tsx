import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, Send, Globe, Phone, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const SMS_TEMPLATES = {
  arrival_en: 'Dear Parent, your child {name} has arrived at school at {time}. - {school}',
  arrival_hi: 'प्रिय अभिभावक, आपका बच्चा {name} {time} बजे स्कूल पहुंच गया है। - {school}',
  late_en: 'Dear Parent, your child {name} arrived late at {time}. Reason: {reason}. - {school}',
  late_hi: 'प्रिय अभिभावक, आपका बच्चा {name} {time} बजे देर से पहुंचा। कारण: {reason}। - {school}',
  absent_en: 'Dear Parent, your child {name} was marked absent today ({date}). Please contact school if needed. - {school}',
  absent_hi: 'प्रिय अभिभावक, आपका बच्चा {name} आज ({date}) अनुपस्थित है। कृपया आवश्यकता पर स्कूल से संपर्क करें। - {school}',
  stranger_en: 'ALERT: An unregistered person was detected at {gate} at {time}. Security has been notified. - {school}',
  fee_en: 'Reminder: Fee payment of Rs.{amount} for {name} is pending. Last date: {date}. - {school}',
  fee_hi: 'अनुस्मारक: {name} की Rs.{amount} की फीस लंबित है। अंतिम तिथि: {date}। - {school}',
};

const SMSNotificationConfig = () => {
  const [language, setLanguage] = useState('en');
  const [testPhone, setTestPhone] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('arrival');
  const [sending, setSending] = useState(false);

  const sendTest = async () => {
    if (!testPhone) return;
    setSending(true);
    try {
      const templateKey = `${selectedTemplate}_${language}` as keyof typeof SMS_TEMPLATES;
      const message = (SMS_TEMPLATES[templateKey] || SMS_TEMPLATES[`${selectedTemplate}_en` as keyof typeof SMS_TEMPLATES])
        .replace('{name}', 'Test Student')
        .replace('{time}', new Date().toLocaleTimeString('en-IN'))
        .replace('{school}', 'Presence School')
        .replace('{date}', new Date().toLocaleDateString('en-IN'))
        .replace('{reason}', 'Test')
        .replace('{gate}', 'Main Gate')
        .replace('{amount}', '5000');

      const { error } = await supabase.functions.invoke('send-sms', {
        body: { phoneNumber: testPhone, message }
      });
      if (error) throw error;
      toast.success('Test SMS sent!');
    } catch {
      toast.error('Failed to send SMS. Check gateway configuration.');
    }
    setSending(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-green-500" />
          SMS / WhatsApp Configuration
        </h2>
        <p className="text-sm text-muted-foreground">Configure bilingual notification templates</p>
      </div>

      {/* Gateway status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Gateway Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="gap-1">
              <Phone className="h-3 w-3" /> Fast2SMS
              <CheckCircle2 className="h-3 w-3 text-green-500 ml-1" />
            </Badge>
            <span className="text-sm text-muted-foreground">Indian SMS gateway configured</span>
          </div>
        </CardContent>
      </Card>

      {/* Templates */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Message Templates</CardTitle>
          <CardDescription>Hindi + English bilingual support</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button variant={language === 'en' ? 'default' : 'outline'} size="sm" onClick={() => setLanguage('en')}>
              <Globe className="h-3 w-3 mr-1" /> English
            </Button>
            <Button variant={language === 'hi' ? 'default' : 'outline'} size="sm" onClick={() => setLanguage('hi')}>
              <Globe className="h-3 w-3 mr-1" /> हिंदी
            </Button>
          </div>

          <div className="space-y-3">
            {['arrival', 'late', 'absent', 'fee'].map(type => {
              const key = `${type}_${language}` as keyof typeof SMS_TEMPLATES;
              const template = SMS_TEMPLATES[key] || SMS_TEMPLATES[`${type}_en` as keyof typeof SMS_TEMPLATES];
              return (
                <div key={type} className="p-3 rounded-lg bg-accent/30 border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="secondary" className="text-xs capitalize">{type}</Badge>
                  </div>
                  <p className="text-sm text-foreground">{template}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Test SMS */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Send Test SMS</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="+91XXXXXXXXXX"
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              className="flex-1"
            />
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="arrival">Arrival</SelectItem>
                <SelectItem value="late">Late</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
                <SelectItem value="fee">Fee</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={sendTest} disabled={sending || !testPhone}>
              <Send className="h-4 w-4 mr-1" /> {sending ? 'Sending...' : 'Send'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SMSNotificationConfig;
