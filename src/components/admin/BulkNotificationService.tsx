import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Users, AlertCircle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface BulkNotificationServiceProps {
  availableFaces: { id: string; user_id?: string; name: string; employee_id: string }[];
}

const BulkNotificationService: React.FC<BulkNotificationServiceProps> = ({ availableFaces }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [studentsWithoutEmail, setStudentsWithoutEmail] = useState<string[]>([]);

  // Generate personalized message for each student
  const getPersonalizedMessage = (studentName: string, studentId: string) => {
    return `Dear Parent/Guardian of ${studentName},

This is a notification regarding your ward ${studentName} (ID: ${studentId}).

Date: ${new Date().toLocaleDateString()}
Time: ${new Date().toLocaleTimeString()}

Please contact the school if you have any questions.

Best regards,
School Administration`;
  };

  const getDefaultMessage = () => {
    return `Dear Parent/Guardian of {STUDENT_NAME},

This is a notification regarding your ward {STUDENT_NAME} (ID: {STUDENT_ID}).

Date: ${new Date().toLocaleDateString()}
Time: ${new Date().toLocaleTimeString()}

Please contact the school if you have any questions.

Best regards,
School Administration`;
  };

  const getDefaultSubject = () => {
    return `School Notification for {STUDENT_NAME} - ${new Date().toLocaleDateString()}`;
  };

  // Replace placeholders with actual values
  const personalizeMessage = (template: string, studentName: string, studentId: string) => {
    return template
      .replace(/\{STUDENT_NAME\}/g, studentName)
      .replace(/\{STUDENT_ID\}/g, studentId);
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedStudents(availableFaces.map(face => face.id));
    } else {
      setSelectedStudents([]);
    }
  };

  const handleStudentToggle = (studentId: string, checked: boolean) => {
    if (checked) {
      setSelectedStudents(prev => [...prev, studentId]);
    } else {
      setSelectedStudents(prev => prev.filter(id => id !== studentId));
      setSelectAll(false);
    }
  };

  const sendBulkNotification = async () => {
    if (selectedStudents.length === 0) {
      toast({
        title: "No Students Selected",
        description: "Please select at least one student to send notifications.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      const notificationPromises = selectedStudents.map(async (studentId) => {
        try {
          const selectedFace = availableFaces.find(face => face.id === studentId);
          
          // Get real parent email from profiles table
          // Try to get profile by user_id first, then by id
          const targetUserId = selectedFace?.user_id || studentId;
          let { data: profile } = await supabase
            .from('profiles')
            .select('parent_email, parent_name, parent_phone, phone, metadata, display_name')
            .eq('user_id', targetUserId)
            .maybeSingle();

          // If not found, try by id
          if (!profile) {
            const result = await supabase
              .from('profiles')
              .select('parent_email, parent_name, parent_phone, phone, metadata, display_name')
              .eq('id', studentId)
              .maybeSingle();
            profile = result.data;
          }

          // Only send if parent email exists
          if (!profile?.parent_email || profile.parent_email.trim() === '') {
            console.warn(`No parent email for student ${studentId}, skipping`);
            errorCount++;
            return;
          }

          const parentInfo = {
            parent_email: profile.parent_email,
            parent_name: profile.parent_name || `Parent of ${selectedFace?.name}`,
            parent_phone: (profile as any)?.parent_phone || (profile as any)?.metadata?.parent_phone || profile.phone || null,
          };

          // Personalize message for this student
          const studentName = selectedFace?.name || 'Student';
          const studentEmployeeId = selectedFace?.employee_id || studentId;
          const personalizedSubject = personalizeMessage(subject || getDefaultSubject(), studentName, studentEmployeeId);
          const personalizedBody = personalizeMessage(message || getDefaultMessage(), studentName, studentEmployeeId);

          // Call Supabase Edge Function for email notification
          const { data, error } = await supabase.functions.invoke('send-notification', {
            body: {
              recipient: {
                email: parentInfo.parent_email,
                name: parentInfo.parent_name,
                phone: parentInfo.parent_phone,
              },
              message: {
                subject: personalizedSubject,
                body: personalizedBody
              },
              student: {
                id: selectedFace?.employee_id || studentId,
                name: studentName,
                status: 'notification'
              },
              targetUserId
            }
          });

          if (error) throw error;
          successCount++;
        } catch (error) {
          console.error(`Error sending notification to student ${studentId}:`, error);
          errorCount++;
        }
      });

      await Promise.all(notificationPromises);

      toast({
        title: "Bulk Notification Complete",
        description: `Successfully processed ${successCount} email + WhatsApp + SMS notifications. ${errorCount > 0 ? `${errorCount} failed.` : ''}`,
        variant: errorCount > 0 ? "destructive" : "default",
      });
      
      setOpen(false);
      setMessage('');
      setSubject('');
      setSelectedStudents([]);
      setSelectAll(false);
    } catch (error) {
      console.error('Error sending bulk notifications:', error);
      toast({
        title: "Bulk Notification Failed",
        description: "Failed to send bulk notifications. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const checkParentEmails = async () => {
      if (open) {
        const studentsWithoutEmails: string[] = [];
        
        for (const face of availableFaces) {
          // Try to get profile by user_id first, then by id
            const targetUserId = face.user_id || face.id;
            let { data: profile } = await supabase
            .from('profiles')
            .select('parent_email')
              .eq('user_id', targetUserId)
            .maybeSingle();

          // If not found, try by id
          if (!profile) {
            const result = await supabase
              .from('profiles')
              .select('parent_email')
              .eq('id', face.id)
              .maybeSingle();
            profile = result.data;
          }
          
          if (!profile?.parent_email || profile.parent_email.trim() === '') {
            studentsWithoutEmails.push(face.name);
          }
        }
        
        setStudentsWithoutEmail(studentsWithoutEmails);
      }
    };

    if (open) {
      setMessage(getDefaultMessage());
      setSubject(getDefaultSubject());
      checkParentEmails();
    }
  }, [open, availableFaces]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Users className="h-4 w-4 mr-2" />
          Bulk Notify
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send Bulk Parent Notifications (Email + WhatsApp)</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {studentsWithoutEmail.length > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="ml-2">
                <p className="font-medium text-sm mb-1">⚠️ Missing Parent Emails</p>
                <p className="text-xs">
                  The following students don't have parent emails: <strong>{studentsWithoutEmail.join(', ')}</strong>
                </p>
                <p className="text-xs mt-1">
                  They will be skipped. Please add parent emails in the <a href="https://supabase.com/dashboard/project/tegpyalokurixuvgeuks/editor/29584?schema=public" target="_blank" rel="noopener noreferrer" className="underline">Profiles table</a>.
                </p>
              </AlertDescription>
            </Alert>
          )}
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
              <Label htmlFor="message">
                Notification Message
              <span className="text-xs text-muted-foreground ml-2">
                (Use {'{STUDENT_NAME}'} and {'{STUDENT_ID}'} for personalization)
              </span>
            </Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter email message with {STUDENT_NAME} and {STUDENT_ID} placeholders"
              rows={6}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Select Students</Label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="select-all"
                  checked={selectAll}
                  onCheckedChange={handleSelectAll}
                />
                <Label htmlFor="select-all" className="text-sm">Select All ({availableFaces.length})</Label>
              </div>
            </div>
            
            <div className="max-h-48 overflow-y-auto border rounded-md p-3 space-y-2">
              {availableFaces.map((face) => (
                <div key={face.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={face.id}
                    checked={selectedStudents.includes(face.id)}
                    onCheckedChange={(checked) => handleStudentToggle(face.id, checked as boolean)}
                  />
                  <Label htmlFor={face.id} className="text-sm flex-1">
                    {face.name} (ID: {face.employee_id})
                  </Label>
                </div>
              ))}
            </div>
            
            <p className="text-sm text-muted-foreground">
              {selectedStudents.length} of {availableFaces.length} students selected
            </p>
          </div>
          
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={sendBulkNotification} disabled={isLoading || selectedStudents.length === 0}>
              <Mail className="h-4 w-4 mr-2" />
              {isLoading ? "Sending..." : `Send Notification to ${selectedStudents.length} Students`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BulkNotificationService;