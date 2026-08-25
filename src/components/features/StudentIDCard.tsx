import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { 
  Download, 
  Printer, 
  IdCard, 
  User,
  Building,
  Phone,
  Mail,
  Calendar
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';
import { pickPreferredPhotoCandidate, resolveStudentPhotoUrl } from '@/utils/studentPhotoResolver';

interface StudentData {
  id: string;
  name: string;
  employee_id: string;
  category: string;
  department?: string;
  avatar_url?: string;
  descriptor_image_url?: string;
  registration_image_url?: string;
  image_url?: string;
  parent_phone?: string;
  parent_email?: string;
  created_at?: string;
}

interface StudentIDCardProps {
  student: StudentData;
  schoolName?: string;
  schoolLogo?: string;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  'A': { bg: 'bg-blue-500', text: 'text-blue-500' },
  'B': { bg: 'bg-green-500', text: 'text-green-500' },
  'C': { bg: 'bg-yellow-500', text: 'text-yellow-500' },
  'D': { bg: 'bg-orange-500', text: 'text-orange-500' },
  'Teacher': { bg: 'bg-purple-500', text: 'text-purple-500' },
};

const StudentIDCard: React.FC<StudentIDCardProps> = ({ 
  student, 
  schoolName = "PM SHRI Kendriya Vidyalaya NFC Vigyan Vihar, Delhi",
  schoolLogo 
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const qrWrapperRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [studentPhotoUrl, setStudentPhotoUrl] = useState('');
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
  const [printPreview, setPrintPreview] = useState<{
    imageDataUrl: string;
    safeArea: { top: number; right: number; bottom: number; left: number };
    qrArea: { top: number; left: number; width: number; height: number };
  } | null>(null);

  const categoryColor = CATEGORY_COLORS[student.category] || CATEGORY_COLORS['A'];

  const captureCardImage = async () => {
    if (!cardRef.current) return null;

    const canvas = await html2canvas(cardRef.current, {
      scale: Math.max(3, window.devicePixelRatio * 2),
      backgroundColor: '#0f172a',
      useCORS: true,
      logging: false,
    });

    return canvas.toDataURL('image/png');
  };

  useEffect(() => {
    let active = true;

    const fallbackCandidate = pickPreferredPhotoCandidate(
      student.avatar_url,
      student.descriptor_image_url,
      student.registration_image_url,
      student.image_url,
    );

    resolveStudentPhotoUrl(fallbackCandidate)
      .then((resolved) => {
        if (active) setStudentPhotoUrl(resolved);
      })
      .catch(() => {
        if (active) setStudentPhotoUrl(fallbackCandidate || '');
      });

    return () => {
      active = false;
    };
  }, [student.avatar_url, student.descriptor_image_url, student.registration_image_url, student.image_url]);

  const handleDownload = async () => {
    if (!cardRef.current) return;

    setIsGenerating(true);
    try {
      const imageDataUrl = await captureCardImage();
      if (!imageDataUrl) return;

      const link = document.createElement('a');
      link.download = `ID_Card_${student.name.replace(/\s+/g, '_')}.png`;
      link.href = imageDataUrl;
      link.click();
    } catch (error) {
      console.error('Error generating ID card:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const openPrintPreview = async () => {
    if (!cardRef.current || !qrWrapperRef.current) return;

    setIsGenerating(true);
    try {
      const imageDataUrl = await captureCardImage();
      if (!imageDataUrl) return;

      const cardRect = cardRef.current.getBoundingClientRect();
      const qrRect = qrWrapperRef.current.getBoundingClientRect();

      const safeInsetPx = 16; // p-4 content inset in the live card design
      const safeArea = {
        top: (safeInsetPx / cardRect.height) * 100,
        right: (safeInsetPx / cardRect.width) * 100,
        bottom: (safeInsetPx / cardRect.height) * 100,
        left: (safeInsetPx / cardRect.width) * 100,
      };

      const qrArea = {
        top: ((qrRect.top - cardRect.top) / cardRect.height) * 100,
        left: ((qrRect.left - cardRect.left) / cardRect.width) * 100,
        width: (qrRect.width / cardRect.width) * 100,
        height: (qrRect.height / cardRect.height) * 100,
      };

      setPrintPreview({ imageDataUrl, safeArea, qrArea });
      setIsPrintPreviewOpen(true);
    } catch (error) {
      console.error('Error creating print preview:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = async (imageOverride?: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    setIsGenerating(true);

    try {
      const imageDataUrl = imageOverride || await captureCardImage();
      if (!imageDataUrl) {
        printWindow.close();
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>ID Card - ${student.name}</title>
            <style>
              @page {
                size: A4 portrait;
                margin: 6mm;
              }

              html, body {
                margin: 0;
                padding: 0;
                background: #ffffff;
                width: 100%;
                height: 100%;
              }

              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }

              .print-sheet {
                width: 100%;
                min-height: 100%;
                display: flex;
                justify-content: center;
                align-items: flex-start;
                padding-top: 4mm;
                box-sizing: border-box;
              }

              .card-image {
                width: min(190mm, calc(100vw - 12mm));
                aspect-ratio: 1.586 / 1;
                height: auto;
                display: block;
                border-radius: 4mm;
              }
            </style>
          </head>
          <body>
            <div class="print-sheet">
              <img class="card-image" src="${imageDataUrl}" alt="ID Card ${student.name}" />
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();

      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 300);
    } catch (error) {
      console.error('Error printing ID card:', error);
      printWindow.close();
    } finally {
      setIsGenerating(false);
    }
  };

  const qrData = JSON.stringify({
    id: student.id,
    name: student.name,
    employee_id: student.employee_id,
    category: student.category,
    timestamp: Date.now(),
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <IdCard className="h-5 w-5" />
            Student ID Card
          </CardTitle>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={openPrintPreview}
              disabled={isGenerating}
            >
              <Printer className="h-4 w-4 mr-1" />
              {isGenerating ? 'Preparing...' : 'Preview & Print'}
            </Button>
            <Button 
              size="sm" 
              onClick={handleDownload}
              disabled={isGenerating}
            >
              <Download className="h-4 w-4 mr-1" />
              {isGenerating ? 'Generating...' : 'Download'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* ID Card Design */}
        <div 
          ref={cardRef}
          className="relative w-full max-w-sm mx-auto bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl overflow-hidden shadow-2xl"
          style={{ aspectRatio: '1.586/1' }}
        >
          {/* Top Color Bar */}
          <div className={`absolute top-0 left-0 right-0 h-2 ${categoryColor.bg}`} />
          
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0" style={{ 
              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,.05) 10px, rgba(255,255,255,.05) 20px)' 
            }} />
          </div>

          {/* Content */}
          <div className="relative p-4 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                <Building className="h-6 w-6 text-white/80" />
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">{schoolName}</h3>
                <p className="text-white/60 text-xs">Student Identification Card</p>
              </div>
            </div>

            {/* Main Content */}
            <div className="flex gap-4 flex-1">
              {/* Photo */}
              <div className="flex flex-col items-center">
                <div className="w-20 h-24 bg-white/10 rounded-lg overflow-hidden border-2 border-white/20">
                  {studentPhotoUrl ? (
                    <img 
                      src={studentPhotoUrl}
                      alt={student.name}
                      className="w-full h-full object-cover"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="h-10 w-10 text-white/40" />
                    </div>
                  )}
                </div>
                <Badge className={`mt-2 ${categoryColor.bg} text-white text-xs`}>
                  {student.category === 'Teacher' ? 'Staff' : `Class ${student.category}`}
                </Badge>
              </div>

              {/* Details */}
              <div className="flex-1 space-y-2">
                <div>
                  <p className="text-white/60 text-xs">Name</p>
                  <p className="text-white font-semibold text-sm truncate">{student.name}</p>
                </div>
                <div>
                  <p className="text-white/60 text-xs">ID Number</p>
                  <p className="text-white font-mono text-sm">{student.employee_id}</p>
                </div>
                {student.department && (
                  <div>
                    <p className="text-white/60 text-xs">Department</p>
                    <p className="text-white text-sm truncate">{student.department}</p>
                  </div>
                )}
              </div>

              {/* QR Code */}
              <div className="flex flex-col items-center">
                <div ref={qrWrapperRef} className="bg-white p-1.5 rounded-lg">
                  <QRCodeSVG 
                    value={qrData} 
                    size={84}
                    level="H"
                    marginSize={2}
                  />
                </div>
                <p className="text-white/40 text-[8px] mt-1">Scan to verify</p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10 mt-auto">
              <div className="flex items-center gap-1 text-white/40 text-[10px]">
                <Calendar className="h-3 w-3" />
                Valid: {format(new Date(), 'yyyy')} - {format(new Date().setFullYear(new Date().getFullYear() + 1), 'yyyy')}
              </div>
              <p className="text-white/40 text-[10px]">Powered by RCA · Gaurav Raj & Jatin Dhama</p>
            </div>
          </div>
        </div>
      </CardContent>

      <Dialog open={isPrintPreviewOpen} onOpenChange={setIsPrintPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Print Preview</DialogTitle>
            <DialogDescription>
              Review the safe area and QR placement before printing.
            </DialogDescription>
          </DialogHeader>

          {printPreview && (
            <div className="space-y-4">
              <div className="relative w-full overflow-hidden rounded-lg border bg-slate-950" style={{ aspectRatio: '1.586 / 1' }}>
                <img
                  src={printPreview.imageDataUrl}
                  alt={`Print preview for ${student.name}`}
                  className="w-full h-full object-contain"
                />

                <div
                  className="absolute border-2 border-dashed border-emerald-400 pointer-events-none"
                  style={{
                    top: `${printPreview.safeArea.top}%`,
                    left: `${printPreview.safeArea.left}%`,
                    right: `${printPreview.safeArea.right}%`,
                    bottom: `${printPreview.safeArea.bottom}%`,
                  }}
                />

                <div
                  className="absolute border-2 border-dashed border-cyan-300 pointer-events-none"
                  style={{
                    top: `${printPreview.qrArea.top}%`,
                    left: `${printPreview.qrArea.left}%`,
                    width: `${printPreview.qrArea.width}%`,
                    height: `${printPreview.qrArea.height}%`,
                  }}
                />

                <div className="absolute left-3 bottom-3 rounded bg-slate-900/80 px-2 py-1 text-[11px] text-emerald-300">
                  Safe area
                </div>
                <div className="absolute right-3 bottom-3 rounded bg-slate-900/80 px-2 py-1 text-[11px] text-cyan-300">
                  QR placement
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsPrintPreviewOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    await handlePrint(printPreview.imageDataUrl);
                    setIsPrintPreviewOpen(false);
                  }}
                  disabled={isGenerating}
                >
                  <Printer className="h-4 w-4 mr-1" />
                  Print Now
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default StudentIDCard;
