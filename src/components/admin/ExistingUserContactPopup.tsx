import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, UserPlus } from 'lucide-react';

interface UserWithoutContact {
  id: string;
  name: string;
  employee_id?: string;
  department?: string;
}

const ExistingUserContactPopup: React.FC = () => {
  const { toast } = useToast();
  const [showPopup, setShowPopup] = useState(false);
  const [usersWithoutContact, setUsersWithoutContact] = useState<UserWithoutContact[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserWithoutContact | null>(null);
  const [contactData, setContactData] = useState({
    parentName: '',
    parentEmail: '',
    parentPhone: '',
    relationship: '',
    emergencyContact: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    checkUsersWithoutContact();
  }, []);

  const checkUsersWithoutContact = async () => {
    try {
      // Get all attendance records with registration = true
      const { data: registrationRecords, error } = await supabase
        .from('attendance_records')
        .select('device_info, user_id, id')
        .eq('status', 'registered');

      if (error) throw error;

      const usersNeedingContact: UserWithoutContact[] = [];

      for (const record of registrationRecords || []) {
        const deviceInfo = typeof record.device_info === 'string' 
          ? JSON.parse(record.device_info) 
          : record.device_info;

        // Required fields are parent_name + parent_phone (parent_email is optional on the register form).
        // Treat the student as having contact info when both required fields are present.
        const meta = deviceInfo?.metadata || {};
        const hasContactInDeviceInfo = !!(
          (meta.parent_name && (meta.parent_phone || meta.phone))
        );

        let hasContactInProfiles = false;
        if (!hasContactInDeviceInfo && record.user_id) {
          try {
            const { data: profileData, error: profileError } = await supabase
              .from('profiles')
              .select('metadata, phone')
              .eq('user_id', record.user_id)
              .maybeSingle();

            if (!profileError && profileData) {
              const pm: any = profileData.metadata || {};
              hasContactInProfiles = !!(pm.parent_name && (pm.parent_phone || profileData.phone));
            }
          } catch (profileError) {
            console.warn('Error checking profile contact info:', profileError);
          }
        }

        // Only add to list if contact info is missing in both places
        if (!hasContactInDeviceInfo && !hasContactInProfiles) {
          const userName = deviceInfo?.metadata?.name || deviceInfo?.name || 'Unknown User';
          const employeeId = deviceInfo?.metadata?.employee_id || deviceInfo?.employee_id;
          const department = deviceInfo?.metadata?.department || deviceInfo?.department;

          usersNeedingContact.push({
            id: record.user_id || record.id,
            name: userName,
            employee_id: employeeId,
            department: department
          });
        }
      }

      if (usersNeedingContact.length > 0) {
        setUsersWithoutContact(usersNeedingContact);
        setShowPopup(true);
      }
    } catch (error) {
      console.error('Error checking users without contact:', error);
    }
  };

  const handleSaveContact = async () => {
    if (!selectedUser || !contactData.parentName || !contactData.parentEmail || !contactData.parentPhone) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required parent contact fields.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Find the registration record for this user
      const { data: registrationRecord, error: fetchError } = await supabase
        .from('attendance_records')
        .select('device_info, id')
        .eq('user_id', selectedUser.id)
        .eq('status', 'registered')
        .single();

      if (fetchError) throw fetchError;

      // Update the device_info with parent contact information
      const currentDeviceInfo = typeof registrationRecord.device_info === 'string' 
        ? JSON.parse(registrationRecord.device_info) 
        : registrationRecord.device_info;

      const updatedDeviceInfo = {
        ...currentDeviceInfo,
        metadata: {
          ...currentDeviceInfo.metadata,
          parent_name: contactData.parentName,
          parent_email: contactData.parentEmail,
          parent_phone: contactData.parentPhone,
          relationship: contactData.relationship,
          emergency_contact: contactData.emergencyContact
        }
      };

      // Update the record
      const { error: updateError } = await supabase
        .from('attendance_records')
        .update({ device_info: updatedDeviceInfo })
        .eq('id', registrationRecord.id);

      if (updateError) throw updateError;

      toast({
        title: "Contact Information Saved",
        description: `Parent contact details saved for ${selectedUser.name}.`,
      });

      // Remove the user from the list and reset form
      setUsersWithoutContact(prev => prev.filter(user => user.id !== selectedUser.id));
      setSelectedUser(null);
      setContactData({
        parentName: '',
        parentEmail: '',
        parentPhone: '',
        relationship: '',
        emergencyContact: ''
      });

      // If no more users need contact info, close popup
      if (usersWithoutContact.length <= 1) {
        setShowPopup(false);
      }

    } catch (error) {
      console.error('Error saving contact information:', error);
      toast({
        title: "Error",
        description: "Failed to save contact information. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipUser = () => {
    if (selectedUser) {
      setUsersWithoutContact(prev => prev.filter(user => user.id !== selectedUser.id));
      setSelectedUser(null);
      setContactData({
        parentName: '',
        parentEmail: '',
        parentPhone: '',
        relationship: '',
        emergencyContact: ''
      });

      if (usersWithoutContact.length <= 1) {
        setShowPopup(false);
      }
    }
  };

  const handleClosePopup = () => {
    setShowPopup(false);
    setSelectedUser(null);
    setUsersWithoutContact([]);
  };

  if (!showPopup || usersWithoutContact.length === 0) {
    return null;
  }

  return (
    <Dialog open={showPopup} onOpenChange={setShowPopup}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add Parent Contact Information
          </DialogTitle>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {usersWithoutContact.length} student(s) need parent contact information
            </p>
            <Button variant="ghost" size="sm" onClick={handleClosePopup}>
              <X className="h-4 w-4" />
              Close
            </Button>
          </div>
        </DialogHeader>

        {!selectedUser ? (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Select a student to add parent contact:</h3>
            <div className="grid gap-3 max-h-60 overflow-y-auto">
              {usersWithoutContact.map((user) => (
                <Card key={user.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedUser(user)}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="font-medium">{user.name}</h4>
                        <div className="text-sm text-muted-foreground">
                          {user.employee_id && <span>ID: {user.employee_id}</span>}
                          {user.department && <span className="ml-2">Dept: {user.department}</span>}
                        </div>
                      </div>
                      <Button size="sm">
                        Add Contact
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Adding contact for: {selectedUser.name}</CardTitle>
              </CardHeader>
            </Card>

            <div className="grid gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="parentName">Parent/Guardian Name *</Label>
                  <Input
                    id="parentName"
                    value={contactData.parentName}
                    onChange={(e) => setContactData(prev => ({...prev, parentName: e.target.value}))}
                    placeholder="Parent Name"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="relationship">Relationship *</Label>
                  <Select value={contactData.relationship} onValueChange={(value) => setContactData(prev => ({...prev, relationship: value}))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select relationship" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="father">Father</SelectItem>
                      <SelectItem value="mother">Mother</SelectItem>
                      <SelectItem value="guardian">Guardian</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="parentEmail">Parent Email *</Label>
                  <Input
                    id="parentEmail"
                    type="email"
                    value={contactData.parentEmail}
                    onChange={(e) => setContactData(prev => ({...prev, parentEmail: e.target.value}))}
                    placeholder="parent@example.com"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="parentPhone">Parent Phone *</Label>
                  <Input
                    id="parentPhone"
                    type="tel"
                    value={contactData.parentPhone}
                    onChange={(e) => setContactData(prev => ({...prev, parentPhone: e.target.value}))}
                    placeholder="+1234567890"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="emergencyContact">Emergency Contact (Optional)</Label>
                <Input
                  id="emergencyContact"
                  type="tel"
                  value={contactData.emergencyContact}
                  onChange={(e) => setContactData(prev => ({...prev, emergencyContact: e.target.value}))}
                  placeholder="+1234567890"
                />
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setSelectedUser(null)}>
                Back to List
              </Button>
              <div className="space-x-2">
                <Button variant="ghost" onClick={handleSkipUser}>
                  Skip This Student
                </Button>
                <Button onClick={handleSaveContact} disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save Contact Info"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ExistingUserContactPopup;