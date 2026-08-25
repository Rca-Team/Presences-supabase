import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { pushNotificationService } from '@/services/PushNotificationService';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, AlertCircle, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface NotificationServiceProps {
  studentId?: string;
  studentName?: string;
  attendanceStatus?: string;
}

const NotificationService: React.FC<NotificationServiceProps> = ({ 
  studentId, 
  studentName, 
  attendanceStatus: propAttendanceStatus
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasParentEmail, setHasParentEmail] = useState(false);
  const [parentEmail, setParentEmail] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentName, setParentName] = useState('');
  const [actualStatus, setActualStatus] = useState<string>('absent');

  const getDefaultMessage = () => {
    const status = actualStatus?.toLowerCase();
    if (status === 'present') {
      return `Dear Parent/Guardian,\n\nThis is to inform you that ${studentName} has arrived at school safely today.\n\nTime: ${new Date().toLocaleTimeString()}\nDate: ${new Date().toLocaleDateString()}\n\nBest regards,\nSchool Administration`;
    } else if (status === 'late') {
      return `Dear Parent/Guardian,\n\nThis is to inform you that ${studentName} arrived late to school today.\n\nTime: ${new Date().toLocaleTimeString()}\nDate: ${new Date().toLocaleDateString()}\n\nPlease ensure punctuality in the future.\n\nBest regards,\nSchool Administration`;
    } else if (status === 'absent') {
      return `Dear Parent/Guardian,\n\nThis is to inform you that ${studentName} was marked absent today.\n\nDate: ${new Date().toLocaleDateString()}\n\nIf this is unexpected, please contact the school immediately.\n\nBest regards,\nSchool Administration`;
    }
    return `Dear Parent/Guardian,\n\nThis is a notification regarding your child ${studentName}.\n\nBest regards,\nSchool Administration`;
  };

  const getDefaultSubject = () => {
    return `School Attendance Notification - ${studentName}`;
  };

  const resolveParentContact = async (lookupId: string, lookupName?: string) => {
    // 1) profile by user_id
    let { data: profile } = await supabase
      .from('profiles')
      .select('parent_email, parent_name, parent_phone, phone, metadata, display_name')
      .eq('user_id', lookupId)
      .maybeSingle();

    // 2) profile by id
    if (!profile) {
      const result = await supabase
        .from('profiles')
        .select('parent_email, parent_name, parent_phone, phone, metadata, display_name')
        .eq('id', lookupId)
        .maybeSingle();
      profile = result.data;
    }

    // 3) profile by display_name
    if (!profile && lookupName) {
      const result = await supabase
        .from('profiles')
        .select('parent_email, parent_name, parent_phone, phone, metadata, display_name')
        .ilike('display_name', lookupName)
        .maybeSingle();
      profile = result.data;
    }

    const profilePhone = (profile as any)?.parent_phone || (profile as any)?.metadata?.parent_phone || (profile as any)?.phone || '';
    if ((profile?.parent_email && profile.parent_email.trim() !== '') || (typeof profilePhone === 'string' && profilePhone.trim() !== '')) {
      return {
        parent_email: profile?.parent_email?.trim() || '',
        parent_phone: typeof profilePhone === 'string' ? profilePhone.trim() : '',
        parent_name: profile.parent_name || `Parent of ${profile.display_name || lookupName || 'Student'}`,
      };
    }

    // 4) fallback to attendance metadata (for already-available details saved with records)
    const byRecord = await supabase
      .from('attendance_records')
      .select('device_info')
      .eq('id', lookupId)
      .maybeSingle();

    const byUser = await supabase
      .from('attendance_records')
      .select('device_info')
      .eq('user_id', lookupId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    const recordDeviceInfo = (byRecord.data?.device_info || byUser.data?.device_info) as any;
    const metadata = recordDeviceInfo?.metadata && typeof recordDeviceInfo.metadata === 'object'
      ? recordDeviceInfo.metadata
      : {};

    const fallbackEmail = metadata.parent_email;
    const fallbackPhone = metadata.parent_phone;
    if ((typeof fallbackEmail === 'string' && fallbackEmail.trim() !== '') || (typeof fallbackPhone === 'string' && fallbackPhone.trim() !== '')) {
      return {
        parent_email: typeof fallbackEmail === 'string' ? fallbackEmail.trim() : '',
        parent_phone: typeof fallbackPhone === 'string' ? fallbackPhone.trim() : '',
        parent_name: metadata.parent_name || `Parent of ${lookupName || metadata.name || 'Student'}`,
      };
    }

    return null;
  };

  const sendEmailNotification = async () => {
    if (!studentId) {
      toast({
        title: "Error",
        description: "Student ID is required",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const parentInfo = await resolveParentContact(studentId, studentName);

      if (!parentInfo) {
        toast({
          title: "Missing Contact Information",
          description: "Parent contact info not found. Add parent email or phone first.",
          variant: "destructive",
        });
        return;
      }

      if (!parentInfo.parent_email && !parentInfo.parent_phone) {
        toast({
          title: "Missing Contact Information",
          description: "Add at least one parent channel: email or phone.",
          variant: "destructive",
        });
        return;
      }

      // Call Supabase Edge Function for email notification
      const { data, error } = await supabase.functions.invoke('send-notification', {
        body: {
          recipient: {
            email: parentInfo.parent_email || null,
            name: parentInfo.parent_name,
            phone: parentInfo.parent_phone || null,
          },
          message: {
            subject: subject || getDefaultSubject(),
            body: message || getDefaultMessage()
          },
          student: {
            id: studentId,
            name: studentName,
            status: actualStatus
          }
        }
      });

      if (error) throw error;

      const waSent = !!data?.channels?.whatsapp?.sent;
      const waError = data?.channels?.whatsapp?.error;

      pushNotificationService.showLocalNotification('✅ Parent notification sent', {
        body: `${studentName || 'Student'} notification processed${waSent ? ' (Email + WhatsApp + SMS)' : ''}`,
      }).catch(() => undefined);

      toast({
        title: "Notification Sent",
        description: waSent
          ? "Email + WhatsApp + SMS notification processed for parent."
          : `Notification processed, but WhatsApp was not delivered${waError ? `: ${waError}` : ''}`,
      });
      
      setOpen(false);
      setMessage('');
      setSubject('');
    } catch (error) {
      console.error('Error sending notification:', error);
      toast({
        title: "Notification Failed",
        description: "Unable to send notification. Please try again or contact support.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const checkParentDetailsAndStatus = async () => {
      if (open && studentId) {
        const parentInfo = await resolveParentContact(studentId, studentName);
        setHasParentEmail(!!parentInfo?.parent_email || !!parentInfo?.parent_phone);
        setParentEmail(parentInfo?.parent_email || '');
        setParentPhone(parentInfo?.parent_phone || '');
        setParentName(parentInfo?.parent_name || '');

        // Fetch actual attendance status for today
        const today = new Date().toISOString().split('T')[0];
        const { data: attendanceRecord } = await supabase
          .from('attendance_records')
          .select('status')
          .eq('user_id', studentId)
          .gte('timestamp', `${today}T00:00:00`)
          .lte('timestamp', `${today}T23:59:59`)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Set actual status: use database record if exists, otherwise absent
        const detectedStatus = attendanceRecord?.status || 'absent';
        setActualStatus(detectedStatus);
      }
    };

    if (open) {
      checkParentDetailsAndStatus();
    }
  }, [open, studentId]);

  // Update message and subject when status changes
  useEffect(() => {
    if (open) {
      setMessage(getDefaultMessage());
      setSubject(getDefaultSubject());
    }
  }, [open, actualStatus, studentName]);

  const handleSaveParentDetails = async () => {
    if (!studentId || (!parentEmail.trim() && !parentPhone.trim())) {
      toast({
        title: "Error",
        description: "Parent email or phone is required",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Try multiple lookup strategies to find or create profile
      let { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, user_id')
        .eq('user_id', studentId)
        .maybeSingle();

      // Try by id if not found
      if (!existingProfile) {
        const { data: profileById } = await supabase
          .from('profiles')
          .select('id, user_id')
          .eq('id', studentId)
          .maybeSingle();
        existingProfile = profileById;
      }

      // Try by display_name if still not found
      if (!existingProfile && studentName) {
        const { data: profileByName } = await supabase
          .from('profiles')
          .select('id, user_id')
          .ilike('display_name', studentName)
          .maybeSingle();
        existingProfile = profileByName;
      }

      let result;
      if (existingProfile) {
        // Update existing profile
        result = await supabase
          .from('profiles')
          .update({
            parent_email: parentEmail.trim() || null,
            parent_phone: parentPhone.trim() || null,
            parent_name: parentName.trim() || null
          })
          .eq('id', existingProfile.id)
          .select();
      } else {
        // Create new profile for this student
        result = await supabase
          .from('profiles')
          .insert({
            user_id: studentId,
            display_name: studentName || 'Student',
            parent_email: parentEmail.trim() || null,
            parent_phone: parentPhone.trim() || null,
            parent_name: parentName.trim() || null
          })
          .select();
      }

      if (result.error) {
        console.error('Database error:', result.error);
        throw new Error(result.error.message);
      }

      if (!result.data || result.data.length === 0) {
        throw new Error('Failed to save parent details');
      }

      setHasParentEmail(true);
      toast({
        title: "Success",
        description: "Parent details saved successfully. You can now send notifications.",
      });
    } catch (error: any) {
      console.error('Error saving parent details:', error);
      toast({
        title: "Failed to Save",
        description: "Unable to save contact details. Please try again or contact support.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Mail className="h-4 w-4 mr-2" />
          Notify Parent
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Parent Notification (Email + WhatsApp)</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 pt-4">
          {!hasParentEmail ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="ml-2">
                <div className="space-y-2">
                  <p className="font-medium">Parent contact not found for this student</p>
                  <p className="text-sm">Please add parent email or phone to send notifications:</p>
                  <div className="space-y-2 mt-3">
                    <div>
                      <Label htmlFor="parent_email" className="text-xs">Parent Email</Label>
                      <Input
                        id="parent_email"
                        type="email"
                        value={parentEmail}
                        onChange={(e) => setParentEmail(e.target.value)}
                        placeholder="parent@example.com"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="parent_phone" className="text-xs">Parent Phone</Label>
                      <Input
                        id="parent_phone"
                        value={parentPhone}
                        onChange={(e) => setParentPhone(e.target.value)}
                        placeholder="e.g. 919414741664"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="parent_name" className="text-xs">Parent Name (Optional)</Label>
                      <Input
                        id="parent_name"
                        value={parentName}
                        onChange={(e) => setParentName(e.target.value)}
                        placeholder="Parent's full name"
                        className="mt-1"
                      />
                    </div>
                    <Button 
                      size="sm" 
                      onClick={handleSaveParentDetails}
                      disabled={isLoading}
                      className="w-full mt-2"
                    >
                      {isLoading ? "Saving..." : "Save Parent Details"}
                    </Button>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="subject">Notification Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter email subject"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="message">Notification Message</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter email message"
              rows={8}
            />
          </div>

          <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
            <p className="font-medium">📧 + 💬 Dual Channel:</p>
            <p className="text-xs text-muted-foreground">This sends email and WhatsApp together when contact details are available.</p>
          </div>
          
          <div className="flex justify-end space-x-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={sendEmailNotification} 
              disabled={isLoading || !hasParentEmail}
            >
              <Mail className="h-4 w-4 mr-2" />
              {isLoading ? "Sending..." : "Send Notification"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NotificationService;