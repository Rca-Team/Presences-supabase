
import React from 'react';
import { Button } from '@/components/ui/button';
import { Printer, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { generatePrintableReport, exportToCSV } from './utils/reportUtils';
import { FaceInfo } from './utils/attendanceUtils';

interface ReportControlsProps {
  selectedFace: FaceInfo | null;
  workingDays: Date[];
  attendanceDays: Date[];
  lateAttendanceDays: Date[];
  absentDays: Date[];
  selectedDate?: Date;
  dailyAttendance: {
    id: string;
    timestamp: string;
    status: string;
  }[];
}

const ReportControls: React.FC<ReportControlsProps> = (props) => {
  const { toast } = useToast();
  const { selectedFace } = props;

  const handlePrintReport = async () => {
    if (!selectedFace) return;
    
    toast({
      title: "Generating Report",
      description: "Fetching latest attendance data...",
      variant: "default"
    });
    
    const printWindow = await generatePrintableReport(props);
    
    if (!printWindow) {
      toast({
        title: "Error",
        description: "Unable to open print window. Please check your browser settings.",
        variant: "destructive"
      });
      return;
    }
    
    toast({
      title: "Report Generated",
      description: "Attendance report with latest data has been generated in a new tab.",
      variant: "default"
    });
  };

  const handleExportCSV = async () => {
    if (!selectedFace) return;
    
    toast({
      title: "Exporting CSV",
      description: "Fetching latest attendance data...",
      variant: "default"
    });
    
    await exportToCSV(props);
    
    toast({
      title: "CSV Exported",
      description: "Latest attendance data has been exported to CSV.",
      variant: "default"
    });
  };

  return (
    <div className="flex space-x-2">
      <Button 
        variant="outline" 
        size="sm" 
        onClick={handleExportCSV}
        className="flex items-center gap-2"
        title="Export Attendance to CSV"
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">Export CSV</span>
      </Button>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={handlePrintReport}
        className="flex items-center gap-2"
        title="Print Attendance Report"
      >
        <Printer className="h-4 w-4" />
        <span className="hidden sm:inline">Print Report</span>
      </Button>
    </div>
  );
};

export default ReportControls;
