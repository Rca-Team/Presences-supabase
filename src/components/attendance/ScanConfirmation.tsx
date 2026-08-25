import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, RotateCcw, Clock, UserCheck, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

interface ScanConfirmationProps {
  open: boolean;
  studentName: string;
  studentId: string;
  rollNumber?: string;
  category?: string;
  confidence: number; // 0..1
  status: 'present' | 'late';
  imageUrl: string; // data URL or http URL of full captured frame
  autoConfirmSeconds?: number;
  onConfirm: () => void;
  onRetake: () => void;
}

const ScanConfirmation: React.FC<ScanConfirmationProps> = ({
  open,
  studentName,
  studentId,
  rollNumber,
  category,
  confidence,
  status,
  imageUrl,
  autoConfirmSeconds = 5,
  onConfirm,
  onRetake,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(autoConfirmSeconds);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSecondsLeft(autoConfirmSeconds);
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          onConfirm();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleRetake = async () => {
    setBusy(true);
    setBusy(false);
    onRetake();
  };

  const confidencePct = Math.round(confidence * 100);
  const confColor =
    confidencePct >= 80 ? 'text-emerald-600' :
    confidencePct >= 60 ? 'text-amber-600' : 'text-red-600';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleRetake(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-gradient-to-br from-background to-muted/30 border-2">
        <div className="p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Confirm Attendance
            </DialogTitle>
            <DialogDescription>
              Please verify the match before it is saved permanently.
            </DialogDescription>
          </DialogHeader>

          {/* Face crop preview */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative rounded-2xl overflow-hidden border-4 border-primary/40 bg-black aspect-square w-48 mx-auto shadow-xl"
          >
            {imageUrl ? (
              <img src={imageUrl} alt={studentName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                No preview
              </div>
            )}
            <div className="absolute top-2 right-2">
              <Badge className={status === 'late' ? 'bg-amber-500' : 'bg-emerald-500'}>
                {status === 'late' ? <Clock className="h-3 w-3 mr-1" /> : <UserCheck className="h-3 w-3 mr-1" />}
                {status === 'late' ? 'Late' : 'Present'}
              </Badge>
            </div>
          </motion.div>

          {/* Match details */}
          <div className="text-center space-y-1">
            <p className="text-2xl font-bold">{studentName}</p>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              {rollNumber && <span>Roll: {rollNumber}</span>}
              {category && <Badge variant="outline">{category}</Badge>}
            </div>
          </div>

          {/* Confidence meter */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Match Confidence</span>
              <span className={`font-bold ${confColor}`}>{confidencePct}%</span>
            </div>
            <Progress value={confidencePct} className="h-2" />
          </div>

          {/* Auto-confirm countdown */}
          <div className="bg-muted/50 rounded-lg p-3 text-center text-sm">
            <span className="text-muted-foreground">Auto-saving in </span>
            <span className="font-bold text-primary">{secondsLeft}s</span>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={handleRetake}
              disabled={busy}
              className="border-red-300 text-red-600 hover:bg-red-50"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Wrong / Retake
            </Button>
            <Button onClick={onConfirm} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Confirm
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScanConfirmation;