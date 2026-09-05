import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Printer,
  FileText,
  Download,
  CheckCircle2,
  Calendar,
  Building,
  GraduationCap,
} from 'lucide-react';
import { ChildProfile, ParentSummaryStats, AttendanceItem } from '@/hooks/useParentPortal';
import { format } from 'date-fns';

interface ParentReportCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  child: ChildProfile;
  summary: ParentSummaryStats;
  attendance: AttendanceItem[];
}

export const ParentReportCardModal: React.FC<ParentReportCardModalProps> = ({
  isOpen,
  onClose,
  child,
  summary,
  attendance,
}) => {
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Attendance Statement - ${child.name} (${child.category})</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              padding: 40px;
              color: #0f172a;
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 15px;
              margin-bottom: 25px;
            }
            .school-name {
              font-size: 20px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .doc-title {
              font-size: 14px;
              font-weight: 600;
              color: #475569;
              margin-top: 4px;
            }
            .student-info {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 16px;
              margin-bottom: 25px;
              font-size: 13px;
            }
            .info-item strong {
              color: #334155;
            }
            .metrics-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 12px;
              margin-bottom: 25px;
              text-align: center;
            }
            .metric-card {
              border: 1px solid #cbd5e1;
              border-radius: 8px;
              padding: 12px;
              background: #ffffff;
            }
            .metric-val {
              font-size: 22px;
              font-weight: 800;
              color: #0284c7;
              margin-top: 4px;
            }
            .metric-lbl {
              font-size: 11px;
              font-weight: 600;
              color: #64748b;
              text-transform: uppercase;
            }
            .compliance-box {
              background: #ecfdf5;
              border: 1px solid #a7f3d0;
              border-radius: 8px;
              padding: 14px;
              font-size: 13px;
              color: #065f46;
              font-weight: 600;
              margin-bottom: 40px;
            }
            .signatures {
              display: flex;
              justify-content: space-between;
              margin-top: 60px;
              font-size: 12px;
              color: #475569;
            }
            .sign-line {
              border-top: 1px solid #94a3b8;
              width: 180px;
              text-align: center;
              padding-top: 6px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="school-name">PM Shri Kendriya Vidyalaya NFC Vigyan Vihar</div>
            <div class="doc-title">Official Student Attendance & Presence Statement • Academic Session 2026–2027</div>
          </div>

          <div class="student-info">
            <div class="info-item"><strong>Student Name:</strong> ${child.name}</div>
            <div class="info-item"><strong>Class & Section:</strong> ${child.category}</div>
            <div class="info-item"><strong>Student ID:</strong> ${child.employee_id}</div>
            <div class="info-item"><strong>Report Generated:</strong> ${format(new Date(), 'dd MMMM yyyy, hh:mm a')}</div>
          </div>

          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-lbl">Total Working Days</div>
              <div class="metric-val">${summary.workingDays}</div>
            </div>
            <div class="metric-card">
              <div class="metric-lbl">Present Days</div>
              <div class="metric-val" style="color: #059669;">${summary.presentDays}</div>
            </div>
            <div class="metric-card">
              <div class="metric-lbl">Late Arrivals</div>
              <div class="metric-val" style="color: #d97706;">${summary.lateDays}</div>
            </div>
            <div class="metric-card">
              <div class="metric-lbl">Attendance Rate</div>
              <div class="metric-val">${summary.attendanceRate}%</div>
            </div>
          </div>

          <div class="compliance-box">
            ${
              summary.attendanceRate >= 75
                ? '✅ CERTIFIED: Student satisfies the minimum 75% mandatory attendance requirement as per CBSE and KV board guidelines.'
                : '⚠️ NOTICE: Attendance is currently below 75%. Regular attendance is required to maintain board examination eligibility.'
            }
          </div>

          <div class="signatures">
            <div class="sign-line">Parent / Guardian</div>
            <div class="sign-line">Class Teacher In-Charge</div>
            <div class="sign-line">Principal Signature</div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-base font-black flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Official Attendance Statement
          </DialogTitle>
          <DialogDescription className="text-xs">
            Download or print official monthly attendance summary for {child.name}.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 rounded-2xl bg-muted/40 border border-border/80 space-y-3.5 my-2">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <div>
              <p className="text-sm font-black text-foreground">{child.name}</p>
              <p className="text-xs text-muted-foreground">Class {child.category} • ID: {child.employee_id}</p>
            </div>
            <Badge className="bg-primary/10 text-primary border-primary/30 text-xs font-bold">
              {summary.attendanceRate}% Rate
            </Badge>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-background border border-border/60">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase">Working Days</span>
              <p className="text-base font-bold text-foreground mt-0.5">{summary.workingDays}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-background border border-border/60">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase">Present</span>
              <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{summary.presentDays}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-background border border-border/60">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase">Late</span>
              <p className="text-base font-bold text-amber-600 dark:text-amber-400 mt-0.5">{summary.lateDays}</p>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Verified by School Biometric Recognition Engine
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl text-xs flex-1">
            Close
          </Button>
          <Button
            onClick={handlePrint}
            className="rounded-xl text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground flex-1 shadow-md shadow-primary/20"
          >
            <Printer className="mr-1.5 h-4 w-4" /> Print / Save as PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
