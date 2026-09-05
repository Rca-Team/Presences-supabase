import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { QRCodeSVG } from 'qrcode.react';
import {
  ShieldAlert,
  QrCode,
  CheckCircle2,
  Clock,
  Printer,
  Sparkles,
  AlertTriangle,
  UserCheck,
} from 'lucide-react';
import { ChildProfile } from '@/hooks/useParentPortal';
import { format } from 'date-fns';

interface ParentEmergencyPassModalProps {
  isOpen: boolean;
  onClose: () => void;
  child: ChildProfile;
}

export const ParentEmergencyPassModal: React.FC<ParentEmergencyPassModalProps> = ({
  isOpen,
  onClose,
  child,
}) => {
  const [parentName, setParentName] = useState(child.parent_name || 'Parent / Authorized Guardian');
  const [pickupReason, setPickupReason] = useState('Medical appointment / Family emergency');
  const [generatedTime, setGeneratedTime] = useState(format(new Date(), 'hh:mm a, dd MMM yyyy'));
  const [passId] = useState(`PASS-${Date.now().toString().slice(-6)}`);

  const qrPayload = JSON.stringify({
    passId,
    studentId: child.employee_id,
    studentName: child.name,
    classCategory: child.category,
    parentName,
    pickupReason,
    generatedAt: new Date().toISOString(),
    validUntil: '12:30 PM Today',
  });

  const handlePrintPass = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Early Exit Gate Pass - ${child.name}</title>
          <style>
            body { font-family: sans-serif; padding: 30px; text-align: center; color: #0f172a; }
            .pass-card { border: 2px dashed #0284c7; border-radius: 16px; padding: 24px; max-width: 480px; margin: 0 auto; }
            .title { font-size: 18px; font-weight: 800; color: #0369a1; text-transform: uppercase; }
            .school { font-size: 13px; font-weight: 600; color: #64748b; margin-top: 4px; }
            .info { text-align: left; margin: 20px 0; font-size: 13px; background: #f8fafc; padding: 12px; border-radius: 8px; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
            .guard-note { font-size: 11px; color: #059669; font-weight: 700; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="pass-card">
            <div class="title">Official Early Exit Gate Pass</div>
            <div class="school">PM Shri Kendriya Vidyalaya NFC Vigyan Vihar</div>
            <div class="info">
              <div class="info-row"><strong>Pass ID:</strong> <span>${passId}</span></div>
              <div class="info-row"><strong>Student:</strong> <span>${child.name} (${child.category})</span></div>
              <div class="info-row"><strong>Student ID:</strong> <span>${child.employee_id}</span></div>
              <div class="info-row"><strong>Pickup By:</strong> <span>${parentName}</span></div>
              <div class="info-row"><strong>Reason:</strong> <span>${pickupReason}</span></div>
              <div class="info-row"><strong>Issued At:</strong> <span>${generatedTime}</span></div>
            </div>
            <div class="guard-note">✅ Present this pass at Gate Security Guard Turnstile for authorized student release.</div>
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
      <DialogContent className="sm:max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-base font-black flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" /> Emergency Early Exit Gate Pass
          </DialogTitle>
          <DialogDescription className="text-xs">
            Generate an authorized digital gate pass for early student pickup from school.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-2">
          {/* QR Code Container */}
          <div className="p-5 rounded-3xl bg-muted/40 border border-border/80 flex flex-col items-center text-center">
            <div className="p-3 bg-white rounded-2xl shadow-md border border-border/60">
              <QRCodeSVG value={qrPayload} size={150} level="H" />
            </div>

            <Badge variant="outline" className="mt-3 font-mono text-xs font-bold border-primary/30 text-primary bg-primary/5">
              {passId}
            </Badge>
            <p className="text-[11px] text-muted-foreground mt-1">
              Valid for gate exit today • Scannable by security staff
            </p>
          </div>

          {/* Quick Edit Details */}
          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-bold">Authorized Parent / Guardian Name</Label>
              <Input
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                className="h-9 text-xs rounded-xl bg-background"
                placeholder="Parent Name"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Early Pickup Reason</Label>
              <Input
                value={pickupReason}
                onChange={(e) => setPickupReason(e.target.value)}
                className="h-9 text-xs rounded-xl bg-background"
                placeholder="e.g. Doctor appointment"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl text-xs flex-1">
            Close
          </Button>
          <Button
            onClick={handlePrintPass}
            className="rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white flex-1 shadow-md shadow-blue-500/25 border-0"
          >
            <Printer className="mr-1.5 h-4 w-4 text-white" /> Print / Save Pass
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
