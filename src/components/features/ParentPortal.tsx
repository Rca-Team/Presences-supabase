import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { 
  Users, 
  UserCheck, 
  UserX, 
  Clock, 
  Calendar,
  TrendingUp,
  Bell,
  Search,
  ChevronRight,
  Phone,
  Mail,
  GraduationCap
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, subDays } from 'date-fns';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

interface ChildInfo {
  id: string;
  name: string;
  employee_id: string;
  category: string;
  image_url: string;
  department?: string;
}

interface AttendanceRecord {
  date: string;
  status: 'present' | 'late' | 'absent';
  time?: string;
}

interface ParentPortalProps {
  parentEmail?: string;
  parentPhone?: string;
}

const ParentPortal: React.FC<ParentPortalProps> = ({ parentEmail, parentPhone }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildInfo | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [stats, setStats] = useState({
    totalDays: 0,
    presentDays: 0,
    lateDays: 0,
    absentDays: 0,
    attendanceRate: 0,
  });
  const [weeklyTrend, setWeeklyTrend] = useState<{ day: string; attendance: number }[]>([]);

  useEffect(() => {
    fetchChildrenData();
  }, [parentEmail, parentPhone]);

  useEffect(() => {
    if (selectedChild) {
      fetchChildAttendance(selectedChild.employee_id);
    }
  }, [selectedChild]);

  const fetchChildrenData = async () => {
    setIsLoading(true);
    try {
      // In real app, this would filter by parent email/phone
      // For now, fetch all registered students to demo
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('status', 'registered')
        .limit(10);

      if (error) throw error;

      const processedChildren: ChildInfo[] = (data || []).map(record => {
        const deviceInfo = record.device_info as any;
        const metadata = deviceInfo?.metadata || {};
        return {
          id: record.id,
          name: metadata.name || 'Student',
          employee_id: metadata.employee_id || 'N/A',
          category: record.category || 'A',
          image_url: record.image_url || '',
          department: metadata.department,
        };
      }).filter(c => c.name !== 'Student');

      setChildren(processedChildren);
      if (processedChildren.length > 0 && !selectedChild) {
        setSelectedChild(processedChildren[0]);
      }
    } catch (error) {
      console.error('Error fetching children:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchChildAttendance = async (employeeId: string) => {
    try {
      const monthStart = startOfMonth(new Date());
      const today = new Date();
      
      // Get working days this month
      const workingDays = eachDayOfInterval({ start: monthStart, end: today })
        .filter(day => !isWeekend(day));

      // Fetch attendance
      const { data: attendance } = await supabase
        .from('attendance_records')
        .select('*')
        .in('status', ['present', 'late'])
        .gte('timestamp', format(monthStart, 'yyyy-MM-dd'))
        .order('timestamp', { ascending: false });

      // Filter for this student
      const studentAttendance = (attendance || []).filter(r => {
        const empId = (r.device_info as any)?.employee_id || (r.device_info as any)?.metadata?.employee_id;
        return empId === employeeId;
      });

      // Build attendance map
      const attendanceMap: Record<string, AttendanceRecord> = {};
      studentAttendance.forEach(record => {
        const dateStr = format(new Date(record.timestamp), 'yyyy-MM-dd');
        if (!attendanceMap[dateStr]) {
          attendanceMap[dateStr] = {
            date: dateStr,
            status: record.status as 'present' | 'late',
            time: format(new Date(record.timestamp), 'HH:mm'),
          };
        }
      });

      // Calculate history
      const history: AttendanceRecord[] = workingDays.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        return attendanceMap[dateStr] || { date: dateStr, status: 'absent' as const };
      }).reverse();

      setAttendanceHistory(history.slice(0, 30));

      // Calculate stats
      const presentDays = history.filter(h => h.status === 'present').length;
      const lateDays = history.filter(h => h.status === 'late').length;
      const absentDays = history.filter(h => h.status === 'absent').length;
      const totalDays = workingDays.length;

      setStats({
        totalDays,
        presentDays,
        lateDays,
        absentDays,
        attendanceRate: totalDays > 0 ? Math.round(((presentDays + lateDays) / totalDays) * 100) : 0,
      });

      // Weekly trend
      const last7Days = eachDayOfInterval({ 
        start: subDays(today, 6), 
        end: today 
      }).filter(day => !isWeekend(day));

      const trend = last7Days.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const record = attendanceMap[dateStr];
        return {
          day: format(day, 'EEE'),
          attendance: record?.status === 'present' ? 100 : record?.status === 'late' ? 75 : 0,
        };
      });

      setWeeklyTrend(trend);
    } catch (error) {
      console.error('Error fetching attendance:', error);
    }
  };

  const filteredChildren = children.filter(child =>
    child.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    child.employee_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Parent Portal
          </h2>
          <p className="text-muted-foreground">Track your child's attendance</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 w-full sm:w-64"
          />
        </div>
      </div>

      {/* Children List */}
      <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
        {filteredChildren.map(child => (
          <button
            key={child.id}
            onClick={() => setSelectedChild(child)}
            className={`flex items-center gap-3 p-3 rounded-lg border min-w-[180px] transition-all ${
              selectedChild?.id === child.id 
                ? 'border-primary bg-primary/5' 
                : 'border-border hover:border-primary/50'
            }`}
          >
            <Avatar className="h-10 w-10">
              <AvatarImage 
                src={child.image_url.startsWith('data:') 
                  ? child.image_url 
                  : child.image_url 
                    ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/face-images/${child.image_url}` 
                    : ''
                } 
              />
              <AvatarFallback>{child.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="text-left">
              <p className="font-medium truncate">{child.name}</p>
              <p className="text-xs text-muted-foreground">Class {child.category}</p>
            </div>
          </button>
        ))}
      </div>

      {selectedChild && (
        <>
          {/* Child Details Card */}
          <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
                  <AvatarImage 
                    src={selectedChild.image_url.startsWith('data:') 
                      ? selectedChild.image_url 
                      : selectedChild.image_url 
                        ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/face-images/${selectedChild.image_url}` 
                        : ''
                    } 
                  />
                  <AvatarFallback className="text-2xl">{selectedChild.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 text-center sm:text-left">
                  <h3 className="text-xl font-bold">{selectedChild.name}</h3>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                    <Badge variant="secondary">
                      <GraduationCap className="h-3 w-3 mr-1" />
                      Class {selectedChild.category}
                    </Badge>
                    <Badge variant="outline">ID: {selectedChild.employee_id}</Badge>
                    {selectedChild.department && (
                      <Badge variant="outline">{selectedChild.department}</Badge>
                    )}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-primary">{stats.attendanceRate}%</div>
                  <p className="text-sm text-muted-foreground">Attendance Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <Calendar className="h-6 w-6 mx-auto mb-2 text-blue-500" />
                <p className="text-2xl font-bold">{stats.totalDays}</p>
                <p className="text-xs text-muted-foreground">Working Days</p>
              </CardContent>
            </Card>
            <Card className="bg-green-500/5 border-green-500/20">
              <CardContent className="p-4 text-center">
                <UserCheck className="h-6 w-6 mx-auto mb-2 text-green-500" />
                <p className="text-2xl font-bold text-green-600">{stats.presentDays}</p>
                <p className="text-xs text-muted-foreground">Present</p>
              </CardContent>
            </Card>
            <Card className="bg-yellow-500/5 border-yellow-500/20">
              <CardContent className="p-4 text-center">
                <Clock className="h-6 w-6 mx-auto mb-2 text-yellow-500" />
                <p className="text-2xl font-bold text-yellow-600">{stats.lateDays}</p>
                <p className="text-xs text-muted-foreground">Late</p>
              </CardContent>
            </Card>
            <Card className="bg-red-500/5 border-red-500/20">
              <CardContent className="p-4 text-center">
                <UserX className="h-6 w-6 mx-auto mb-2 text-red-500" />
                <p className="text-2xl font-bold text-red-600">{stats.absentDays}</p>
                <p className="text-xs text-muted-foreground">Absent</p>
              </CardContent>
            </Card>
          </div>

          {/* Weekly Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Weekly Attendance Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" />
                  <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => [`${value}%`, 'Attendance']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="attendance" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Recent Attendance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Recent Attendance History
              </CardTitle>
              <CardDescription>Last 30 working days</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {attendanceHistory.slice(0, 10).map((record, i) => (
                  <div 
                    key={i}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        record.status === 'present' ? 'bg-green-500' :
                        record.status === 'late' ? 'bg-yellow-500' : 'bg-red-500'
                      }`} />
                      <span>{format(new Date(record.date), 'EEE, MMM d, yyyy')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {record.time && (
                        <span className="text-sm text-muted-foreground">{record.time}</span>
                      )}
                      <Badge 
                        variant={record.status === 'present' ? 'default' : 
                                record.status === 'late' ? 'secondary' : 'destructive'}
                      >
                        {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {children.length === 0 && (
        <Card className="text-center py-12">
          <CardContent>
            <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium">No Students Found</h3>
            <p className="text-muted-foreground">No students are linked to your account yet.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ParentPortal;
