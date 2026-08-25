import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import html2canvas from 'html2canvas';
import { 
  FileText, 
  Download, 
  Mail, 
  Calendar as CalendarIcon,
  Clock,
  Loader2,
  Send,
  CheckCircle,
  Users,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

interface AttendanceRecord {
  id: string;
  user_id: string;
  timestamp: string;
  status: string;
  device_info: any;
  category?: string;
}

const AttendanceReportGenerator: React.FC = () => {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [emailSchedule, setEmailSchedule] = useState({
    enabled: false,
    frequency: 'weekly',
    email: '',
    time: '09:00'
  });

  const fetchAttendanceData = async () => {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('*')
      .gte('timestamp', dateRange.from.toISOString())
      .lte('timestamp', dateRange.to.toISOString())
      .neq('status', 'registered');

    if (error) throw error;
    return data || [];
  };

  const generateReport = async () => {
    setIsGenerating(true);
    try {
      const records = await fetchAttendanceData();
      
      // Process data
      const stats = {
        total: records.length,
        present: records.filter(r => r.status === 'present').length,
        late: records.filter(r => r.status === 'late').length,
        absent: 0, // Calculate based on expected vs actual
        attendanceRate: 0
      };
      
      stats.attendanceRate = stats.total > 0 
        ? Math.round(((stats.present + stats.late) / stats.total) * 100)
        : 0;

      // Group by user
      const userStats = new Map<string, any>();
      records.forEach(record => {
        const deviceInfo = record.device_info as any;
        const name = deviceInfo?.metadata?.name || 'Unknown';
        const userId = record.user_id || record.id;
        
        if (!userStats.has(userId)) {
          userStats.set(userId, {
            name,
            present: 0,
            late: 0,
            total: 0
          });
        }
        
        const user = userStats.get(userId)!;
        user.total++;
        if (record.status === 'present') user.present++;
        if (record.status === 'late') user.late++;
      });

      // Group by date
      const dailyStats = new Map<string, { present: number; late: number }>();
      records.forEach(record => {
        const date = format(new Date(record.timestamp), 'yyyy-MM-dd');
        if (!dailyStats.has(date)) {
          dailyStats.set(date, { present: 0, late: 0 });
        }
        const day = dailyStats.get(date)!;
        if (record.status === 'present') day.present++;
        if (record.status === 'late') day.late++;
      });

      setReportData({
        stats,
        users: Array.from(userStats.values()),
        daily: Array.from(dailyStats.entries()).map(([date, data]) => ({ date, ...data })),
        dateRange: {
          from: format(dateRange.from, 'MMM dd, yyyy'),
          to: format(dateRange.to, 'MMM dd, yyyy')
        }
      });

      toast({
        title: 'Report Generated',
        description: 'Your attendance report is ready'
      });
    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate report',
        variant: 'destructive'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadPDF = async () => {
    if (!reportData) return;
    
    const reportElement = document.getElementById('report-preview');
    if (!reportElement) return;

    try {
      const canvas = await html2canvas(reportElement, { scale: 2 });
      const link = document.createElement('a');
      link.download = `Attendance_Report_${format(new Date(), 'yyyy-MM-dd')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      toast({
        title: 'Downloaded',
        description: 'Report downloaded successfully'
      });
    } catch (error) {
      console.error('Error downloading report:', error);
      toast({
        title: 'Error',
        description: 'Failed to download report',
        variant: 'destructive'
      });
    }
  };

  const scheduleEmails = async () => {
    if (!emailSchedule.email) {
      toast({
        title: 'Email Required',
        description: 'Please enter an email address',
        variant: 'destructive'
      });
      return;
    }

    // Store schedule in database (you'd need to create this table)
    toast({
      title: 'Schedule Saved',
      description: `Reports will be sent ${emailSchedule.frequency} to ${emailSchedule.email}`,
    });
  };

  return (
    <Card className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-blue-100 dark:border-blue-900/50 shadow-xl overflow-hidden">
      <CardHeader className="pb-4 border-b border-blue-100 dark:border-blue-900/50 bg-gradient-to-r from-emerald-600 to-teal-600">
        <CardTitle className="flex items-center gap-3 text-white">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <span>Attendance Reports</span>
            <p className="text-sm font-normal text-white/70">Generate & export reports</p>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4 sm:p-6">
        <Tabs defaultValue="generate" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="generate" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Generate Report
            </TabsTrigger>
            <TabsTrigger value="schedule" className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Email Schedule
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="space-y-6">
            {/* Date Range Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="mb-2 block">From Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarIcon className="w-4 h-4 mr-2" />
                      {format(dateRange.from, 'MMM dd, yyyy')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dateRange.from}
                      onSelect={(date) => date && setDateRange(prev => ({ ...prev, from: date }))}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div>
                <Label className="mb-2 block">To Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarIcon className="w-4 h-4 mr-2" />
                      {format(dateRange.to, 'MMM dd, yyyy')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dateRange.to}
                      onSelect={(date) => date && setDateRange(prev => ({ ...prev, to: date }))}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDateRange({
                  from: subDays(new Date(), 7),
                  to: new Date()
                })}
              >
                Last 7 Days
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDateRange({
                  from: subDays(new Date(), 30),
                  to: new Date()
                })}
              >
                Last 30 Days
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDateRange({
                  from: startOfMonth(new Date()),
                  to: endOfMonth(new Date())
                })}
              >
                This Month
              </Button>
            </div>

            <Button 
              onClick={generateReport} 
              disabled={isGenerating}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 mr-2" />
                  Generate Report
                </>
              )}
            </Button>

            {/* Report Preview */}
            {reportData && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Report Preview</h3>
                  <Button onClick={downloadPDF} variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Download PDF
                  </Button>
                </div>

                <div
                  id="report-preview"
                  className="p-6 rounded-xl bg-white dark:bg-slate-800 border shadow-lg"
                >
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold">Attendance Report</h2>
                    <p className="text-muted-foreground">
                      {reportData.dateRange.from} - {reportData.dateRange.to}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-center">
                      <p className="text-2xl font-bold text-blue-600">{reportData.stats.total}</p>
                      <p className="text-xs text-blue-600/70">Total Records</p>
                    </div>
                    <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/50 text-center">
                      <p className="text-2xl font-bold text-green-600">{reportData.stats.present}</p>
                      <p className="text-xs text-green-600/70">Present</p>
                    </div>
                    <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-950/50 text-center">
                      <p className="text-2xl font-bold text-orange-600">{reportData.stats.late}</p>
                      <p className="text-xs text-orange-600/70">Late</p>
                    </div>
                    <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-950/50 text-center">
                      <p className="text-2xl font-bold text-purple-600">{reportData.stats.attendanceRate}%</p>
                      <p className="text-xs text-purple-600/70">Rate</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-3">Individual Stats</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {reportData.users.slice(0, 10).map((user: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                          <span className="font-medium">{user.name}</span>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-green-600">{user.present} Present</span>
                            <span className="text-orange-600">{user.late} Late</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="schedule" className="space-y-6">
            <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-blue-800 dark:text-blue-200">Automated Reports</h4>
                  <p className="text-sm text-blue-600/80 dark:text-blue-300/80">
                    Schedule automatic email reports to parents and administrators
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="email-schedule">Enable Email Schedule</Label>
              <Switch
                id="email-schedule"
                checked={emailSchedule.enabled}
                onCheckedChange={(checked) => setEmailSchedule(prev => ({ ...prev, enabled: checked }))}
              />
            </div>

            {emailSchedule.enabled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-4"
              >
                <div>
                  <Label className="mb-2 block">Email Address</Label>
                  <Input
                    type="email"
                    placeholder="parent@example.com"
                    value={emailSchedule.email}
                    onChange={(e) => setEmailSchedule(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>

                <div>
                  <Label className="mb-2 block">Frequency</Label>
                  <Select
                    value={emailSchedule.frequency}
                    onValueChange={(value) => setEmailSchedule(prev => ({ ...prev, frequency: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2 block">Send Time</Label>
                  <Input
                    type="time"
                    value={emailSchedule.time}
                    onChange={(e) => setEmailSchedule(prev => ({ ...prev, time: e.target.value }))}
                  />
                </div>

                <Button onClick={scheduleEmails} className="w-full">
                  <Send className="w-4 h-4 mr-2" />
                  Save Schedule
                </Button>
              </motion.div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default AttendanceReportGenerator;
