import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { pushNotificationService } from '@/services/PushNotificationService';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Send, 
  Mail, 
  Users, 
  User, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  Sparkles,
  Bell,
  MessageSquare,
  Search,
  Wand2
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ParentContactImporter from '@/components/admin/ParentContactImporter';

interface AdminNotificationSenderProps {
  availableFaces: { id: string; user_id?: string; name: string; employee_id: string }[];
}

const AdminNotificationSender: React.FC<AdminNotificationSenderProps> = ({ availableFaces }) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'single' | 'bulk' | 'broadcast'>('single');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiContext, setAiContext] = useState('');
  const [showAiInput, setShowAiInput] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sendStatus, setSendStatus] = useState<{ success: number; failed: number } | null>(null);

  const filteredFaces = availableFaces.filter(face =>
    face.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    face.employee_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedStudents(filteredFaces.map(face => face.id));
    } else {
      setSelectedStudents([]);
    }
  };

  const handleStudentToggle = (studentId: string, checked: boolean) => {
    if (checked) {
      setSelectedStudents(prev => [...prev, studentId]);
    } else {
      setSelectedStudents(prev => prev.filter(id => id !== studentId));
    }
  };

  const personalizeMessage = (template: string, studentName: string, studentId: string) => {
    return template
      .replace(/\{STUDENT_NAME\}/g, studentName)
      .replace(/\{STUDENT_ID\}/g, studentId);
  };

  const handleAIGenerate = async () => {
    setIsAILoading(true);
    try {
      const selectedNames = availableFaces
        .filter(f => selectedStudents.includes(f.id))
        .map(f => f.name)
        .slice(0, 5);

      const { data, error } = await supabase.functions.invoke('generate-notification', {
        body: {
          context: aiContext,
          studentNames: selectedNames.length > 0 ? selectedNames : ['Student'],
          notificationType: activeTab,
        },
      });

      if (error) throw error;

      if (data?.error) {
        toast({
          title: 'AI Error',
          description: data.error,
          variant: 'destructive',
        });
        return;
      }

      if (data?.subject) setSubject(data.subject);
      if (data?.message) setMessage(data.message);

      toast({
        title: '✨ AI Generated',
        description: 'Subject and message auto-filled. Review and edit before sending.',
      });

      setShowAiInput(false);
      setAiContext('');
    } catch (error) {
      console.error('AI generation error:', error);
      toast({
        title: 'Generation Failed',
        description: 'Could not generate notification. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsAILoading(false);
    }
  };

  const sendNotifications = async () => {
    if (!subject.trim() || !message.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter both subject and message.",
        variant: "destructive",
      });
      return;
    }

    const targetStudents = activeTab === 'broadcast' 
      ? availableFaces 
      : activeTab === 'bulk' 
        ? availableFaces.filter(f => selectedStudents.includes(f.id))
        : availableFaces.filter(f => selectedStudents.includes(f.id)).slice(0, 1);

    if (targetStudents.length === 0) {
      toast({
        title: "No Recipients",
        description: "Please select at least one student to notify.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setSendStatus(null);
    let successCount = 0;
    let failedCount = 0;

    try {
      for (const student of targetStudents) {
        try {
          const targetUserId = student.user_id || student.id;
          const personalizedSubject = personalizeMessage(subject, student.name, student.employee_id);
          const personalizedMessage = personalizeMessage(message, student.name, student.employee_id);

          const { error: inAppError } = await supabase.from('notifications').insert({
            user_id: targetUserId,
            title: personalizedSubject,
            message: personalizedMessage,
            type: activeTab === 'broadcast' ? 'broadcast' : 'admin_notification',
            is_read: false,
            metadata: {
              source: 'admin_notification_sender',
              mode: activeTab,
              employee_id: student.employee_id,
              student_name: student.name,
            },
          });

          if (inAppError) throw inAppError;

          let { data: profile } = await supabase
            .from('profiles')
            .select('parent_email, parent_name, parent_phone, phone, metadata, display_name')
            .eq('user_id', targetUserId)
            .maybeSingle();

          if (!profile) {
            const result = await supabase
              .from('profiles')
              .select('parent_email, parent_name, parent_phone, phone, metadata, display_name')
              .eq('id', student.id)
              .maybeSingle();
            profile = result.data;
          }

          const parentEmail = profile?.parent_email?.trim() || '';
          const parentPhone = (profile as any)?.parent_phone || (profile as any)?.metadata?.parent_phone || profile?.phone || '';


          const { data: delivery, error } = await supabase.functions.invoke('send-notification', {
            body: {
              recipient: {
                email: parentEmail || null,
                name: profile?.parent_name || `Parent of ${student.name}`,
                phone: typeof parentPhone === 'string' && parentPhone.trim() ? parentPhone.trim() : null,
              },
              message: {
                subject: personalizedSubject,
                body: personalizedMessage
              },
              student: {
                id: student.employee_id || targetUserId,
                name: student.name,
                status: 'notification'
              },
              targetUserId
            }
          });

          if (error) throw error;
          if (!delivery?.delivered) {
            const channelError = delivery?.channels?.email?.error
              || delivery?.channels?.sms?.error
              || delivery?.channels?.whatsapp?.error
              || 'No delivery channel succeeded';
            throw new Error(channelError);
          }
          successCount++;
        } catch (error) {
          console.error(`Failed to send to ${student.name}:`, error);
          failedCount++;
        }
      }

      setSendStatus({ success: successCount, failed: failedCount });

      if (successCount > 0) {
        pushNotificationService.showLocalNotification('📣 Admin notifications sent', {
          body: `${successCount} delivered${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
        }).catch(() => undefined);
      }
      
      toast({
        title: successCount > 0 ? "Notifications Sent" : "Send Failed",
        description: `Realtime in-app delivered to ${successCount} student account(s). ${failedCount > 0 ? `${failedCount} failed.` : ''}`,
        variant: successCount > 0 ? "default" : "destructive",
      });

      if (successCount > 0) {
        setSubject('');
        setMessage('');
        setSelectedStudents([]);
      }
    } catch (error) {
      console.error('Error sending notifications:', error);
      toast({
        title: "Error",
        description: "Failed to send notifications. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Notification Type Selector */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-3 bg-muted/50">
          <TabsTrigger value="single" className="flex items-center gap-2">
            <User className="w-4 h-4" />
            <span className="hidden sm:inline">Single</span>
          </TabsTrigger>
          <TabsTrigger value="bulk" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Bulk</span>
          </TabsTrigger>
          <TabsTrigger value="broadcast" className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            <span className="hidden sm:inline">Broadcast</span>
          </TabsTrigger>
        </TabsList>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
          <p className="text-xs text-muted-foreground">
            Emails go to the parent address on file (student account email is used as fallback).
          </p>
          <ParentContactImporter />
        </div>


        {/* Student Selection for Single/Bulk */}
        <AnimatePresence mode="wait">
          {(activeTab === 'single' || activeTab === 'bulk') && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 space-y-3"
            >
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search students..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {activeTab === 'bulk' && (
                <div className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedStudents.length === filteredFaces.length && filteredFaces.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                    <span className="text-sm font-medium">Select All ({filteredFaces.length})</span>
                  </div>
                  <Badge variant="secondary">
                    {selectedStudents.length} selected
                  </Badge>
                </div>
              )}

              <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                {filteredFaces.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    No students found
                  </div>
                ) : (
                  filteredFaces.map((face) => (
                    <motion.div
                      key={face.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors cursor-pointer ${
                        selectedStudents.includes(face.id) ? 'bg-blue-50 dark:bg-blue-950/30' : ''
                      }`}
                      onClick={() => {
                        if (activeTab === 'single') {
                          setSelectedStudents([face.id]);
                        } else {
                          handleStudentToggle(face.id, !selectedStudents.includes(face.id));
                        }
                      }}
                    >
                      <Checkbox
                        checked={selectedStudents.includes(face.id)}
                        onCheckedChange={(checked) => {
                          if (activeTab === 'single') {
                            setSelectedStudents(checked ? [face.id] : []);
                          } else {
                            handleStudentToggle(face.id, checked as boolean);
                          }
                        }}
                      />
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold">
                        {face.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{face.name}</p>
                        <p className="text-xs text-muted-foreground">ID: {face.employee_id}</p>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'broadcast' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4"
            >
              <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/30">
                <Bell className="w-4 h-4 text-blue-500" />
                <AlertDescription className="text-sm">
                  <strong>Broadcast Mode:</strong> This sends realtime in-app updates to all {availableFaces.length} registered students. Email/WhatsApp/SMS are sent when parent contact details exist.
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>
      </Tabs>

      {/* AI Auto-fill Section */}
      <div className="space-y-2">
        <AnimatePresence>
          {showAiInput && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-primary" />
                  What's this notification about? <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  placeholder="e.g. Tomorrow is a holiday, attendance reminder, exam schedule..."
                  value={aiContext}
                  onChange={(e) => setAiContext(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAIGenerate()}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={handleAIGenerate}
                    disabled={isAILoading}
                    size="sm"
                    className="bg-gradient-to-r from-violet-600 to-primary hover:from-violet-700 hover:to-primary/90"
                  >
                    {isAILoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-1.5" />
                        Generate
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setShowAiInput(false); setAiContext(''); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!showAiInput && (
          <Button
            variant="outline"
            onClick={() => setShowAiInput(true)}
            className="w-full gap-2 border-dashed border-primary/30 text-primary hover:bg-primary/5"
          >
            <Wand2 className="w-4 h-4" />
            AI Auto-fill Subject & Message
          </Button>
        )}
      </div>

      {/* Message Composition */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="subject" className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Subject
          </Label>
          <Input
            id="subject"
            placeholder="Enter notification subject..."
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="message" className="flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Message
          </Label>
          <Textarea
            id="message"
            placeholder="Enter your message. Use {STUDENT_NAME} and {STUDENT_ID} for personalization."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
          />
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Use <code className="px-1 bg-muted rounded">{'{STUDENT_NAME}'}</code> and <code className="px-1 bg-muted rounded">{'{STUDENT_ID}'}</code> for personalization
          </p>
        </div>
      </div>

      {/* Send Status */}
      <AnimatePresence>
        {sendStatus && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Alert className={sendStatus.success > 0 ? 'border-green-200 bg-green-50 dark:bg-green-950/30' : 'border-red-200 bg-red-50 dark:bg-red-950/30'}>
              <CheckCircle2 className={`w-4 h-4 ${sendStatus.success > 0 ? 'text-green-500' : 'text-red-500'}`} />
              <AlertDescription>
                <strong>{sendStatus.success}</strong> delivered in realtime
                {sendStatus.failed > 0 && (
                  <>, <strong className="text-red-500">{sendStatus.failed}</strong> failed</>
                )}
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Send Button */}
      <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
        <Button
          onClick={sendNotifications}
          disabled={isLoading || (!selectedStudents.length && activeTab !== 'broadcast')}
          className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 shadow-lg shadow-blue-500/25"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="w-5 h-5 mr-2" />
              Send {activeTab === 'broadcast' ? `to All (${availableFaces.length})` : `to ${selectedStudents.length} Student(s)`}
            </>
          )}
        </Button>
      </motion.div>
    </div>
  );
};

export default AdminNotificationSender;
