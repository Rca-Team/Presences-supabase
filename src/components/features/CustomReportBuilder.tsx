import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText, 
  Download, 
  CalendarDays, 
  BarChart3,
  PieChart,
  Table,
  Filter,
  Settings2,
  Play,
  Save,
  Trash2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ReportConfig {
  name: string;
  dateRange: { from: Date; to: Date };
  categories: string[];
  statuses: string[];
  groupBy: 'day' | 'week' | 'month' | 'category' | 'user';
  includeCharts: boolean;
  includeSummary: boolean;
  includeDetails: boolean;
  format: 'pdf' | 'excel' | 'csv';
}

interface SavedReport {
  id: string;
  name: string;
  config: ReportConfig;
  createdAt: Date;
}

const CATEGORIES = ['A', 'B', 'C', 'D', 'Teacher'];
const STATUSES = ['present', 'late', 'absent', 'registered'];

const CustomReportBuilder: React.FC = () => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  
  const [config, setConfig] = useState<ReportConfig>({
    name: 'Custom Report',
    dateRange: { from: subDays(new Date(), 30), to: new Date() },
    categories: [...CATEGORIES],
    statuses: ['present', 'late', 'absent'],
    groupBy: 'day',
    includeCharts: true,
    includeSummary: true,
    includeDetails: true,
    format: 'csv',
  });

  const toggleCategory = (category: string) => {
    setConfig(prev => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...prev.categories, category]
    }));
  };

  const toggleStatus = (status: string) => {
    setConfig(prev => ({
      ...prev,
      statuses: prev.statuses.includes(status)
        ? prev.statuses.filter(s => s !== status)
        : [...prev.statuses, status]
    }));
  };

  const generateReport = async () => {
    setIsGenerating(true);
    try {
      // Fetch data based on config
      let query = supabase
        .from('attendance_records')
        .select('*')
        .gte('timestamp', format(config.dateRange.from, 'yyyy-MM-dd'))
        .lte('timestamp', format(config.dateRange.to, 'yyyy-MM-dd'));

      if (config.categories.length < CATEGORIES.length) {
        query = query.in('category', config.categories);
      }

      if (config.statuses.length > 0) {
        query = query.in('status', config.statuses);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Process data for report
      const processedData = processReportData(data || [], config);
      setReportData(processedData);

      toast({
        title: "Report Generated",
        description: `Found ${data?.length || 0} records matching your criteria.`,
      });
    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: "Error",
        description: "Failed to generate report",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const processReportData = (data: any[], config: ReportConfig) => {
    const grouped: Record<string, any[]> = {};
    
    data.forEach(record => {
      let key: string;
      const date = new Date(record.timestamp);
      
      switch (config.groupBy) {
        case 'day':
          key = format(date, 'yyyy-MM-dd');
          break;
        case 'week':
          key = `Week ${format(date, 'w, yyyy')}`;
          break;
        case 'month':
          key = format(date, 'MMM yyyy');
          break;
        case 'category':
          key = record.category || 'Unknown';
          break;
        case 'user':
          key = (record.device_info as any)?.metadata?.name || 'Unknown';
          break;
        default:
          key = 'all';
      }
      
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(record);
    });

    // Calculate summary
    const summary = {
      totalRecords: data.length,
      present: data.filter(r => r.status === 'present').length,
      late: data.filter(r => r.status === 'late').length,
      absent: data.filter(r => r.status === 'absent').length,
      registered: data.filter(r => r.status === 'registered').length,
      byCategory: CATEGORIES.reduce((acc, cat) => {
        acc[cat] = data.filter(r => r.category === cat).length;
        return acc;
      }, {} as Record<string, number>),
    };

    return { grouped, summary, raw: data };
  };

  const downloadReport = () => {
    if (!reportData) return;

    const { raw } = reportData;
    
    if (config.format === 'csv') {
      // Generate CSV
      const headers = ['Date', 'Time', 'Name', 'ID', 'Category', 'Status'];
      const rows = raw.map((r: any) => {
        const deviceInfo = r.device_info as any;
        return [
          format(new Date(r.timestamp), 'yyyy-MM-dd'),
          format(new Date(r.timestamp), 'HH:mm:ss'),
          deviceInfo?.metadata?.name || 'Unknown',
          deviceInfo?.metadata?.employee_id || 'N/A',
          r.category || 'N/A',
          r.status,
        ].join(',');
      });

      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${config.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Report Downloaded",
        description: "CSV file has been downloaded successfully.",
      });
    }
  };

  const saveReportConfig = () => {
    const newReport: SavedReport = {
      id: Date.now().toString(),
      name: config.name,
      config: { ...config },
      createdAt: new Date(),
    };
    setSavedReports(prev => [...prev, newReport]);
    toast({
      title: "Report Saved",
      description: "Report configuration saved for future use.",
    });
  };

  return (
    <div className="space-y-6">
      <Card className="glass-panel">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Custom Report Builder
              </CardTitle>
              <CardDescription>
                Create tailored attendance reports with flexible filters
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={saveReportConfig}>
              <Save className="h-4 w-4 mr-1" />
              Save Config
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Report Name */}
          <div className="space-y-2">
            <Label>Report Name</Label>
            <Input
              value={config.name}
              onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter report name..."
            />
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>From Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarDays className="h-4 w-4 mr-2" />
                    {format(config.dateRange.from, 'PPP')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={config.dateRange.from}
                    onSelect={(date) => date && setConfig(prev => ({
                      ...prev,
                      dateRange: { ...prev.dateRange, from: date }
                    }))}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>To Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarDays className="h-4 w-4 mr-2" />
                    {format(config.dateRange.to, 'PPP')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={config.dateRange.to}
                    onSelect={(date) => date && setConfig(prev => ({
                      ...prev,
                      dateRange: { ...prev.dateRange, to: date }
                    }))}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Categories */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Categories
              </Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(cat => (
                  <Badge
                    key={cat}
                    variant={config.categories.includes(cat) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleCategory(cat)}
                  >
                    {cat === 'Teacher' ? 'Teacher' : `Class ${cat}`}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Statuses */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Status Types
              </Label>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map(status => (
                  <Badge
                    key={status}
                    variant={config.statuses.includes(status) ? 'default' : 'outline'}
                    className="cursor-pointer capitalize"
                    onClick={() => toggleStatus(status)}
                  >
                    {status}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Group By & Format */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Group By</Label>
              <Select
                value={config.groupBy}
                onValueChange={(value: any) => setConfig(prev => ({ ...prev, groupBy: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="category">Category</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Export Format</Label>
              <Select
                value={config.format}
                onValueChange={(value: any) => setConfig(prev => ({ ...prev, format: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="excel">Excel</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Options */}
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="charts"
                checked={config.includeCharts}
                onCheckedChange={(checked) => 
                  setConfig(prev => ({ ...prev, includeCharts: !!checked }))
                }
              />
              <label htmlFor="charts" className="text-sm cursor-pointer">Include Charts</label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="summary"
                checked={config.includeSummary}
                onCheckedChange={(checked) => 
                  setConfig(prev => ({ ...prev, includeSummary: !!checked }))
                }
              />
              <label htmlFor="summary" className="text-sm cursor-pointer">Include Summary</label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="details"
                checked={config.includeDetails}
                onCheckedChange={(checked) => 
                  setConfig(prev => ({ ...prev, includeDetails: !!checked }))
                }
              />
              <label htmlFor="details" className="text-sm cursor-pointer">Include Details</label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button onClick={generateReport} disabled={isGenerating} className="flex-1">
              <Play className="h-4 w-4 mr-2" />
              {isGenerating ? 'Generating...' : 'Generate Report'}
            </Button>
            {reportData && (
              <Button variant="secondary" onClick={downloadReport}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Report Preview */}
      {reportData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Table className="h-5 w-5" />
              Report Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Summary */}
            {config.includeSummary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">{reportData.summary.totalRecords}</p>
                  <p className="text-xs text-muted-foreground">Total Records</p>
                </div>
                <div className="p-4 bg-green-500/10 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-600">{reportData.summary.present}</p>
                  <p className="text-xs text-muted-foreground">Present</p>
                </div>
                <div className="p-4 bg-yellow-500/10 rounded-lg text-center">
                  <p className="text-2xl font-bold text-yellow-600">{reportData.summary.late}</p>
                  <p className="text-xs text-muted-foreground">Late</p>
                </div>
                <div className="p-4 bg-red-500/10 rounded-lg text-center">
                  <p className="text-2xl font-bold text-red-600">{reportData.summary.absent}</p>
                  <p className="text-xs text-muted-foreground">Absent</p>
                </div>
              </div>
            )}

            {/* Grouped Data */}
            {config.includeDetails && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {Object.entries(reportData.grouped).slice(0, 10).map(([key, records]: [string, any]) => (
                  <div key={key} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="font-medium">{key}</span>
                    <Badge variant="secondary">{records.length} records</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Saved Reports */}
      {savedReports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Saved Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {savedReports.map(report => (
                <div key={report.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{report.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Created {format(report.createdAt, 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setConfig(report.config)}
                    >
                      Load
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => setSavedReports(prev => prev.filter(r => r.id !== report.id))}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CustomReportBuilder;
