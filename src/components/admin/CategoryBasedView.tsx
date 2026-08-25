import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Users, User, Printer, Calendar, Bell, ChevronLeft, GraduationCap,
  FileText, Download, FolderInput, MoreVertical, CalendarClock
} from 'lucide-react';
import ClassTeacherManager from './ClassTeacherManager';
import FullTimetableManager from './TimetableManager';
import { supabase } from '@/integrations/supabase/client';
import { pushNotificationService } from '@/services/PushNotificationService';
import { useToast } from '@/hooks/use-toast';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { filterWorkingDaysForSchool } from '@/utils/workingDays';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import ChangeCategoryDialog from './ChangeCategoryDialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  CLASSES, SECTIONS, CLASS_COLORS, getCategoryLabel, getCategoryShortLabel,
  type Category 
} from '@/constants/schoolConfig';

interface CategoryUser {
  id: string;
  user_id?: string;
  name: string;
  employee_id: string;
  department: string;
  image_url: string;
  category: string;
  total_attendance: number;
}

const CategoryBasedView: React.FC = () => {
  const { toast } = useToast();
  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [users, setUsers] = useState<CategoryUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationSubject, setNotificationSubject] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [sendingNotification, setSendingNotification] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [showTeacherManager, setShowTeacherManager] = useState(false);
  const [fullTimetableOpen, setFullTimetableOpen] = useState(false);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('id, user_id, device_info, image_url, category, timestamp')
        .eq('status', 'registered')
        .order('timestamp', { ascending: false });
      if (error) throw error;
      if (data) {
        const processedUsers: CategoryUser[] = data
          .map(record => {
            const deviceInfo = record.device_info as any;
            const metadata = deviceInfo?.metadata || {};
            return {
              id: record.id,
              user_id: record.user_id || undefined,
              name: metadata.name || 'Unknown',
              employee_id: metadata.employee_id || 'N/A',
              department: metadata.department || 'N/A',
              image_url: record.image_url || metadata.firebase_image_url || '',
              category: record.category || '6-A',
              total_attendance: 0,
            };
          })
          .filter(user => user.name !== 'Unknown');
        setUsers(processedUsers);

        const counts: Record<string, number> = {};
        processedUsers.forEach(user => {
          counts[user.category] = (counts[user.category] || 0) + 1;
        });
        setCategoryCounts(counts);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({ title: 'Error', description: 'Failed to load users', variant: 'destructive' });
    } finally { setIsLoading(false); }
  };

  const filteredUsers = useMemo(() => {
    if (!selectedCategory) return [];
    return users.filter(user => user.category === selectedCategory);
  }, [users, selectedCategory]);

  const classCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    CLASSES.forEach(cls => {
      counts[cls] = users.filter(u => u.category.startsWith(`${cls}-`)).length;
    });
    return counts;
  }, [users]);

  const teacherCount = useMemo(() => users.filter(u => u.category === 'Teacher').length, [users]);

  const handlePrintDailyAttendance = async () => {
    if (!selectedCategory) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const categoryUsers = filteredUsers;
    const { data: attendanceData } = await supabase
      .from('attendance_records')
      .select('*')
      .in('status', ['present', 'late'])
      .gte('timestamp', `${today}T00:00:00`)
      .lte('timestamp', `${today}T23:59:59`);

    const presentIds = new Set(
      (attendanceData || []).map(r => (r.device_info as any)?.employee_id).filter(Boolean)
    );

    const printContent = `
      <html><head>
        <title>Daily Attendance - ${getCategoryLabel(selectedCategory)} - ${format(new Date(), 'dd MMM yyyy')}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { text-align: center; color: #333; }
          h2 { color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
          th { background-color: #f5f5f5; }
          .present { color: green; } .absent { color: red; }
          .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #888; }
        </style>
      </head><body>
        <h1>Daily Attendance Report</h1>
        <h2>${getCategoryLabel(selectedCategory)} | ${format(new Date(), 'dd MMMM yyyy')}</h2>
        <p>Total Students: ${categoryUsers.length}</p>
        <table><thead><tr><th>S.No</th><th>Name</th><th>ID</th><th>Roll No</th><th>Status</th></tr></thead>
        <tbody>${categoryUsers.map((u, i) => `
          <tr><td>${i+1}</td><td>${u.name}</td><td>${u.employee_id}</td><td>${u.department}</td>
          <td class="${presentIds.has(u.employee_id) ? 'present' : 'absent'}">${presentIds.has(u.employee_id) ? 'Present' : 'Absent'}</td></tr>
        `).join('')}</tbody></table>
        <div class="footer"><p>Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}</p></div>
      </body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(printContent); w.document.close(); w.print(); }
  };

  const handlePrintMonthlyAttendance = async () => {
    if (!selectedCategory) return;
    const categoryUsers = filteredUsers;
    const monthStart = startOfMonth(selectedMonth);
    const monthEnd = endOfMonth(selectedMonth);
    const workingDays = filterWorkingDaysForSchool(
      eachDayOfInterval({ start: monthStart, end: monthEnd })
    );
    const { data: attendanceData } = await supabase
      .from('attendance_records')
      .select('*')
      .in('status', ['present', 'late'])
      .gte('timestamp', format(monthStart, 'yyyy-MM-dd'))
      .lte('timestamp', format(monthEnd, 'yyyy-MM-dd'));

    const attendanceMap: Record<string, Set<string>> = {};
    (attendanceData || []).forEach(r => {
      const empId = (r.device_info as any)?.employee_id;
      if (empId) {
        if (!attendanceMap[empId]) attendanceMap[empId] = new Set();
        attendanceMap[empId].add(format(new Date(r.timestamp), 'yyyy-MM-dd'));
      }
    });

    const printContent = `
      <html><head>
        <title>Monthly - ${getCategoryLabel(selectedCategory)} - ${format(selectedMonth, 'MMMM yyyy')}</title>
        <style>
          body { font-family: Arial; padding: 20px; }
          h1 { text-align: center; } h2 { color: #666; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { border: 1px solid #ddd; padding: 5px; text-align: center; }
          th { background: #f5f5f5; }
          .present { background: #c8e6c9; } .absent { background: #ffcdd2; }
          .name-col { text-align: left; white-space: nowrap; }
        </style>
      </head><body>
        <h1>Monthly Attendance Report</h1>
        <h2>${getCategoryLabel(selectedCategory)} | ${format(selectedMonth, 'MMMM yyyy')}</h2>
        <p>Students: ${categoryUsers.length} | Working Days: ${workingDays.length}</p>
        <table><thead><tr><th>S.No</th><th class="name-col">Name</th><th>ID</th>
        ${workingDays.map(d => `<th>${format(d, 'd')}</th>`).join('')}<th>Total</th><th>%</th></tr></thead>
        <tbody>${categoryUsers.map((u, i) => {
          const ua = attendanceMap[u.employee_id] || new Set();
          const pc = workingDays.filter(d => ua.has(format(d, 'yyyy-MM-dd'))).length;
          const pct = workingDays.length > 0 ? Math.round((pc / workingDays.length) * 100) : 0;
          return `<tr><td>${i+1}</td><td class="name-col">${u.name}</td><td>${u.employee_id}</td>
          ${workingDays.map(d => `<td class="${ua.has(format(d, 'yyyy-MM-dd')) ? 'present' : 'absent'}">${ua.has(format(d, 'yyyy-MM-dd')) ? 'P' : 'A'}</td>`).join('')}
          <td><strong>${pc}</strong></td><td>${pct}%</td></tr>`;
        }).join('')}</tbody></table>
      </body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(printContent); w.document.close(); w.print(); }
  };

  const handleBulkNotification = async () => {
    if (!selectedCategory || !notificationMessage.trim()) return;
    setSendingNotification(true);
    try {
      const categoryUsers = filteredUsers;
      let successCount = 0, failCount = 0;
      for (const user of categoryUsers) {
        if (!user.user_id) continue;
        const { data: profile } = await supabase
          .from('profiles')
          .select('parent_email, parent_name, parent_phone, phone, metadata')
          .eq('user_id', user.user_id)
          .single();
        if (profile?.parent_email) {
          try {
            await supabase.functions.invoke('send-notification', {
              body: {
                recipient: {
                  email: profile.parent_email,
                  name: profile.parent_name || 'Parent',
                  phone: (profile as any)?.parent_phone || (profile as any)?.metadata?.parent_phone || profile.phone || null,
                },
                message: {
                  subject: notificationSubject || `${getCategoryLabel(selectedCategory)} Notification`,
                  body: notificationMessage,
                },
                student: {
                  id: user.user_id || user.id,
                  name: user.name,
                  status: 'notification',
                },
                targetUserId: user.user_id || undefined,
              },
            });
            successCount++;
          } catch { failCount++; }
        }
      }
      toast({ title: 'Notifications Sent', description: `Sent to ${successCount} parents${failCount > 0 ? `, ${failCount} failed` : ''}` });

      if (successCount > 0) {
        pushNotificationService.showLocalNotification('📣 Class notifications sent', {
          body: `${successCount} delivered${failCount > 0 ? `, ${failCount} failed` : ''}`,
        }).catch(() => undefined);
      }

      setNotificationOpen(false);
      setNotificationMessage('');
      setNotificationSubject('');
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to send notifications', variant: 'destructive' });
    } finally { setSendingNotification(false); }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1,2,3,4,5,6,7,8].map(i => (
          <Card key={i}><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  // Teacher Manager View
  if (selectedCategory && showTeacherManager) {
    return (
      <ClassTeacherManager
        category={selectedCategory}
        onBack={() => setShowTeacherManager(false)}
      />
    );
  }

  // Level 3: Show students in a specific class-section
  if (selectedCategory) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => {
              setSelectedCategory(null);
              // Go back to class view, not home
            }}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-xl font-semibold">{getCategoryLabel(selectedCategory)}</h2>
              <p className="text-sm text-muted-foreground">{filteredUsers.length} students</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedCategory !== 'Teacher' && (
              <>
                <Button variant="outline" size="sm" onClick={() => setShowTeacherManager(true)}>
                  <CalendarClock className="h-4 w-4 mr-2" />Timetable
                </Button>
                <Dialog open={fullTimetableOpen} onOpenChange={setFullTimetableOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <CalendarClock className="h-4 w-4 mr-2" />Edit Timetable
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Timetable Editor — {getCategoryLabel(selectedCategory)}</DialogTitle>
                    </DialogHeader>
                    <FullTimetableManager allowedCategories={[selectedCategory]} />
                  </DialogContent>
                </Dialog>
              </>
            )}
            <Button variant="outline" size="sm" onClick={handlePrintDailyAttendance}>
              <Printer className="h-4 w-4 mr-2" />Daily Report
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm"><FileText className="h-4 w-4 mr-2" />Monthly</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Monthly Attendance Report</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Select Month</Label>
                    <Input type="month" value={format(selectedMonth, 'yyyy-MM')} onChange={(e) => setSelectedMonth(new Date(e.target.value + '-01'))} className="mt-1" />
                  </div>
                  <Button onClick={handlePrintMonthlyAttendance} className="w-full"><Download className="h-4 w-4 mr-2" />Generate</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={notificationOpen} onOpenChange={setNotificationOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Bell className="h-4 w-4 mr-2" />Notify</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Notify {getCategoryLabel(selectedCategory)}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Subject</Label>
                    <Input value={notificationSubject} onChange={(e) => setNotificationSubject(e.target.value)} placeholder="Notification subject" className="mt-1" />
                  </div>
                  <div><Label>Message</Label>
                    <Textarea value={notificationMessage} onChange={(e) => setNotificationMessage(e.target.value)} placeholder="Enter your message..." rows={4} className="mt-1" />
                  </div>
                  <p className="text-sm text-muted-foreground">Will send to all {filteredUsers.length} students' parents</p>
                  <Button onClick={handleBulkNotification} disabled={!notificationMessage.trim() || sendingNotification} className="w-full">
                    {sendingNotification ? 'Sending...' : 'Send Notifications'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {filteredUsers.length === 0 ? (
          <Card className="p-8 text-center">
            <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No students in {getCategoryLabel(selectedCategory)}</h3>
            <p className="text-sm text-muted-foreground">Register students to this class-section to see them here</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredUsers.map(user => (
              <Card key={user.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage 
                        src={user.image_url?.startsWith('data:') ? user.image_url : user.image_url ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/face-images/${user.image_url}` : ''} 
                        alt={user.name}
                      />
                      <AvatarFallback><User className="h-6 w-6" /></AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{user.name}</h3>
                      <p className="text-sm text-muted-foreground truncate">{user.employee_id}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.department}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <ChangeCategoryDialog
                          userId={user.id} userName={user.name} currentCategory={user.category}
                          onCategoryChanged={fetchUsers}
                          trigger={
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                              <FolderInput className="h-4 w-4 mr-2" />Change Class
                            </DropdownMenuItem>
                          }
                        />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Level 2: Show sections within a class
  if (selectedClass !== null) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setSelectedClass(null)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-semibold">Class {selectedClass}</h2>
            <p className="text-sm text-muted-foreground">{classCounts[selectedClass] || 0} students total</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {SECTIONS.map(section => {
            const cat = `${selectedClass}-${section}`;
            const count = categoryCounts[cat] || 0;
            return (
              <Card 
                key={section}
                className="cursor-pointer hover:shadow-lg transition-all hover:scale-105"
                onClick={() => setSelectedCategory(cat)}
              >
                <CardContent className="p-6 text-center">
                  <div className={`w-14 h-14 ${CLASS_COLORS[selectedClass]} rounded-full flex items-center justify-center mx-auto mb-3 text-white`}>
                    <span className="font-bold text-xl">{section}</span>
                  </div>
                  <h3 className="font-semibold">Section {section}</h3>
                  <Badge variant="secondary" className="mt-2">
                    <Users className="h-3 w-3 mr-1" />{count} students
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // Level 1: Show all classes + Teacher
  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h2 className="text-xl font-semibold">Select a Class</h2>
        <p className="text-sm text-muted-foreground">View students by class and section</p>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {CLASSES.map(cls => (
          <Card 
            key={cls}
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105"
            onClick={() => setSelectedClass(cls)}
          >
            <CardContent className="p-6 text-center">
              <div className={`w-16 h-16 ${CLASS_COLORS[cls]} rounded-full flex items-center justify-center mx-auto mb-3 text-white`}>
                <span className="font-bold text-2xl">{cls}</span>
              </div>
              <h3 className="font-semibold text-lg">Class {cls}</h3>
              <Badge variant="secondary" className="mt-2">
                <Users className="h-3 w-3 mr-1" />{classCounts[cls] || 0} students
              </Badge>
            </CardContent>
          </Card>
        ))}
        
        {/* Teacher card */}
        <Card 
          className="cursor-pointer hover:shadow-lg transition-all hover:scale-105"
          onClick={() => setSelectedCategory('Teacher')}
        >
          <CardContent className="p-6 text-center">
            <div className="w-16 h-16 bg-purple-500 rounded-full flex items-center justify-center mx-auto mb-3 text-white">
              <GraduationCap className="h-7 w-7" />
            </div>
            <h3 className="font-semibold text-lg">Teachers</h3>
            <Badge variant="secondary" className="mt-2">
              <Users className="h-3 w-3 mr-1" />{teacherCount} teachers
            </Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CategoryBasedView;
