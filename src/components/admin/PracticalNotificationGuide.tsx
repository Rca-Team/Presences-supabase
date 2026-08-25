import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Mail, 
  MessageSquare, 
  Clock, 
  UserCheck, 
  UserX, 
  AlertTriangle,
  CheckCircle,
  Phone,
  Calendar,
  Settings,
  Bell,
  Loader2
} from 'lucide-react';
import NotificationService from './NotificationService';
import { supabase } from '@/integrations/supabase/client';

interface RealStudent {
  id: string;
  name: string;
  status: 'present' | 'late' | 'absent';
  timestamp?: string;
  user_id?: string;
}

const PracticalNotificationGuide = () => {
  const [activeDemo, setActiveDemo] = useState<string | null>(null);
  const [realStudents, setRealStudents] = useState<RealStudent[]>([]);
  const [loading, setLoading] = useState(true);

  const notificationScenarios = [
    {
      id: 'arrival',
      title: 'Safe Arrival Notifications',
      description: 'Automatically notify parents when their child arrives at school',
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      useCases: [
        'Daily arrival confirmations',
        'Early morning drop-offs',
        'After school activities',
        'Field trip departures'
      ],
      timing: 'Immediately when face is recognized',
      channels: ['Email']
    },
    {
      id: 'late',
      title: 'Late Arrival Alerts',
      description: 'Alert parents when students arrive after the cutoff time',
      icon: Clock,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      useCases: [
        'Tardiness tracking',
        'Attendance policy enforcement',
        'Pattern identification',
        'Parent communication'
      ],
      timing: 'When student arrives after 9:00 AM (configurable)',
      channels: ['Email']
    },
    {
      id: 'absent',
      title: 'Absence Notifications',
      description: 'Notify parents about unexpected absences',
      icon: UserX,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      useCases: [
        'Unexcused absences',
        'Safety confirmations',
        'Truancy prevention',
        'Emergency situations'
      ],
      timing: 'After morning attendance window closes',
      channels: ['Email']
    },
    {
      id: 'unauthorized',
      title: 'Security Alerts',
      description: 'Immediate alerts for unrecognized individuals',
      icon: AlertTriangle,
      color: 'text-red-700',
      bgColor: 'bg-red-100',
      borderColor: 'border-red-300',
      useCases: [
        'Unauthorized access attempts',
        'Security breaches',
        'Unknown visitors',
        'Emergency lockdown triggers'
      ],
      timing: 'Immediately upon detection',
      channels: ['Email']
    }
  ];

  useEffect(() => {
    fetchRealStudentData();
  }, []);

  const fetchRealStudentData = async () => {
    try {
      setLoading(true);
      
      // Get recent attendance records with profile data
      const { data: attendanceData, error } = await supabase
        .from('attendance_records')
        .select(`
          id,
          user_id,
          status,
          timestamp,
          device_info
        `)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      // Process and deduplicate students
      const studentMap = new Map<string, RealStudent>();
      
      attendanceData?.forEach((record) => {
        let studentName = 'Unknown Student';
        
        // Try to extract name from device_info
        if (record.device_info) {
          const deviceInfo = typeof record.device_info === 'string' 
            ? JSON.parse(record.device_info) 
            : record.device_info;
          
          if (deviceInfo.metadata?.name && deviceInfo.metadata.name !== 'Unknown') {
            studentName = deviceInfo.metadata.name;
          } else if (deviceInfo.metadata?.employee_id) {
            studentName = `Student ${deviceInfo.metadata.employee_id}`;
          }
        }

        const studentKey = record.user_id || record.id;
        const student: RealStudent = {
          id: studentKey,
          name: studentName,
          status: record.status === 'late' ? 'late' : record.status === 'present' ? 'present' : 'absent',
          timestamp: record.timestamp,
          user_id: record.user_id
        };

        // Keep the most recent record for each student
        if (!studentMap.has(studentKey) || 
            new Date(record.timestamp) > new Date(studentMap.get(studentKey)!.timestamp || '')) {
          studentMap.set(studentKey, student);
        }
      });

      // Add some demo students if no real data
      const students = Array.from(studentMap.values());
      if (students.length === 0) {
        students.push(
          { id: 'demo-1', name: 'Emma Johnson', status: 'present' },
          { id: 'demo-2', name: 'Alex Smith', status: 'late' },
          { id: 'demo-3', name: 'Sarah Davis', status: 'absent' }
        );
      }

      setRealStudents(students.slice(0, 6)); // Show up to 6 students
    } catch (error) {
      console.error('Error fetching student data:', error);
      // Fallback to demo data
      setRealStudents([
        { id: 'demo-1', name: 'Emma Johnson', status: 'present' },
        { id: 'demo-2', name: 'Alex Smith', status: 'late' },
        { id: 'demo-3', name: 'Sarah Davis', status: 'absent' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present': return 'text-green-600';
      case 'late': return 'text-orange-600';
      case 'absent': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusText = (student: RealStudent) => {
    const timeStr = student.timestamp 
      ? new Date(student.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
    
    switch (student.status) {
      case 'present': return `Present ${timeStr ? `(${timeStr})` : ''}`;
      case 'late': return `Late ${timeStr ? `(${timeStr})` : ''}`;
      case 'absent': return 'Absent';
      default: return 'Unknown';
    }
  };

  const scheduledNotifications = [
    {
      time: '8:00 AM',
      type: 'Daily Reminder',
      description: 'Send reminder to parents about school start time',
      frequency: 'Daily'
    },
    {
      time: '9:15 AM',
      type: 'Attendance Summary',
      description: 'Send absence notifications for students not yet arrived',
      frequency: 'Daily'
    },
    {
      time: '3:30 PM',
      type: 'Pickup Reminder',
      description: 'Remind parents about pickup time and procedures',
      frequency: 'Daily'
    },
    {
      time: 'Friday 5:00 PM',
      type: 'Weekly Report',
      description: 'Send weekly attendance summary to parents',
      frequency: 'Weekly'
    }
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Bell className="h-5 w-5 mr-2" />
            Practical Notification Implementation Guide
          </CardTitle>
          <CardDescription>
            Learn how to effectively use email and SMS notifications in your attendance system
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="scenarios" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="scenarios">Notification Scenarios</TabsTrigger>
          <TabsTrigger value="automation">Automation Rules</TabsTrigger>
          <TabsTrigger value="templates">Message Templates</TabsTrigger>
          <TabsTrigger value="demo">Live Demo</TabsTrigger>
        </TabsList>

        <TabsContent value="scenarios" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {notificationScenarios.map((scenario) => {
              const IconComponent = scenario.icon;
              return (
                <Card key={scenario.id} className={`${scenario.borderColor} border-2`}>
                  <CardHeader className={scenario.bgColor}>
                    <CardTitle className="flex items-center text-lg">
                      <IconComponent className={`h-5 w-5 mr-2 ${scenario.color}`} />
                      {scenario.title}
                    </CardTitle>
                    <CardDescription>{scenario.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">Use Cases:</h4>
                      <ul className="text-sm space-y-1">
                        {scenario.useCases.map((useCase, index) => (
                          <li key={index} className="flex items-center">
                            <CheckCircle className="h-3 w-3 mr-2 text-green-500" />
                            {useCase}
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="text-sm">
                        <strong>Timing:</strong> {scenario.timing}
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-1">
                      {scenario.channels.map((channel, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {channel === 'Email' && <Mail className="h-3 w-3 mr-1" />}
                          {channel === 'SMS' && <MessageSquare className="h-3 w-3 mr-1" />}
                          {channel === 'Phone Call' && <Phone className="h-3 w-3 mr-1" />}
                          {channel}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="automation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                Automated Notification Schedule
              </CardTitle>
              <CardDescription>
                Set up automatic notifications based on time and attendance events
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {scheduledNotifications.map((notification, index) => (
                  <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center">
                        <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span className="font-medium">{notification.time}</span>
                      </div>
                      <div>
                        <h4 className="font-medium">{notification.type}</h4>
                        <p className="text-sm text-muted-foreground">{notification.description}</p>
                      </div>
                    </div>
                    <Badge variant="outline">{notification.frequency}</Badge>
                  </div>
                ))}
              </div>
              
              <Alert className="mt-6">
                <Calendar className="h-4 w-4" />
                <AlertDescription>
                  <strong>Pro Tip:</strong> You can customize these schedules in the admin settings. 
                  Different notification types can be enabled/disabled based on your school's policy.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Mail className="h-5 w-5 mr-2" />
                  Email Templates
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium">Safe Arrival Template</h4>
                  <div className="bg-muted p-3 rounded text-sm">
                    <p><strong>Subject:</strong> ✅ [Student Name] - Safe Arrival Confirmation</p>
                    <p className="mt-2">
                      Dear Parent/Guardian,<br/><br/>
                      This is to confirm that [Student Name] has arrived safely at school today.<br/><br/>
                      Time: [Arrival Time]<br/>
                      Date: [Current Date]<br/><br/>
                      Have a great day!<br/>
                      School Administration
                    </p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium">Late Arrival Template</h4>
                  <div className="bg-muted p-3 rounded text-sm">
                    <p><strong>Subject:</strong> ⏰ [Student Name] - Late Arrival Notice</p>
                    <p className="mt-2">
                      Dear Parent/Guardian,<br/><br/>
                      [Student Name] arrived late to school today.<br/><br/>
                      Arrival Time: [Late Time]<br/>
                      School Start Time: 8:00 AM<br/><br/>
                      Please help ensure punctuality.<br/>
                      School Administration
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MessageSquare className="h-5 w-5 mr-2" />
                  SMS Templates
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium">Quick Arrival SMS</h4>
                  <div className="bg-muted p-3 rounded text-sm">
                    ✅ [Student Name] arrived safely at school at [Time]. Have a great day!
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium">Late Arrival SMS</h4>
                  <div className="bg-muted p-3 rounded text-sm">
                    ⏰ [Student Name] arrived late at [Time]. School starts at 8:00 AM. Please ensure punctuality.
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium">Absence Alert SMS</h4>
                  <div className="bg-muted p-3 rounded text-sm">
                    ❌ [Student Name] has not arrived at school today. Please confirm their whereabouts. Call school if needed.
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium">Security Alert SMS</h4>
                  <div className="bg-muted p-3 rounded text-sm border-red-200 border">
                    🚨 SECURITY ALERT: Unrecognized person detected at school entrance. Security has been notified.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="demo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Live Notification Demo</CardTitle>
              <CardDescription>
                Send real notifications to parents using actual student data from your system
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Real Student Data</h4>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={fetchRealStudentData}
                      disabled={loading}
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Refresh Data'
                      )}
                    </Button>
                  </div>
                  
                  {loading ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      Loading student data...
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {realStudents.map((student) => (
                        <div key={student.id} className="flex items-center justify-between p-3 border rounded">
                          <div>
                            <span className="font-medium">{student.name}</span>
                            <span className={`ml-2 text-sm ${getStatusColor(student.status)}`}>
                              {getStatusText(student)}
                            </span>
                          </div>
                          <NotificationService 
                            studentId={student.user_id || student.id}
                            studentName={student.name}
                            attendanceStatus={student.status}
                          />
                        </div>
                      ))}
                      
                      {realStudents.length === 0 && !loading && (
                        <div className="text-center py-8 text-muted-foreground">
                          No recent student attendance data found.
                          <br />
                          Add some attendance records to see real data here.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Notification Features</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center">
                      <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                      Automatic parent contact lookup
                    </div>
                    <div className="flex items-center">
                      <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                      Customizable message templates
                    </div>
                    <div className="flex items-center">
                      <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                      Multi-channel delivery (Email + SMS)
                    </div>
                    <div className="flex items-center">
                      <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                      Real-time delivery confirmation
                    </div>
                    <div className="flex items-center">
                      <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                      Automated attendance-based triggers
                    </div>
                  </div>

                  <Alert>
                    <AlertDescription>
                      <strong>Live Demo:</strong> These notifications will be sent to real email addresses using the Resend service. 
                      Make sure to configure parent contact information in the profiles table for production use.
                    </AlertDescription>
                  </Alert>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PracticalNotificationGuide;