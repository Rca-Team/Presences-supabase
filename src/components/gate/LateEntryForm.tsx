import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { GateEntry } from '@/pages/GateMode';

interface LateEntryFormProps {
  student: GateEntry;
  onSubmit: (reason: string, detail: string) => Promise<void>;
  onDismiss: () => void;
}

const LATE_REASONS = [
  { value: 'traffic',   label: 'Traffic' },
  { value: 'medical',   label: 'Medical / Health' },
  { value: 'transport', label: 'Transport issue' },
  { value: 'weather',   label: 'Weather' },
  { value: 'personal',  label: 'Personal' },
  { value: 'other',     label: 'Other' },
];

/**
 * Non-blocking slide-in panel (bottom-right corner) for late entry reason capture.
 * Does NOT block the camera feed — gate operator can continue scanning.
 */
const LateEntryForm = ({ student, onSubmit, onDismiss }: LateEntryFormProps) => {
  const [reason,     setReason]     = useState('');
  const [detail,     setDetail]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    try { await onSubmit(reason, detail); }
    finally { setSubmitting(false); }
  };

  return (
    <motion.div
      initial={{ x: 80, opacity: 0 }}
      animate={{ x: 0,  opacity: 1 }}
      exit={{    x: 80, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 360, damping: 30 }}
      className="fixed bottom-20 right-4 sm:bottom-6 z-[55] w-72 sm:w-80 pointer-events-auto"
    >
      <div className="bg-card/98 backdrop-blur-2xl rounded-2xl border border-amber-500/40 shadow-2xl overflow-hidden">
        {/* Amber accent bar */}
        <div className="h-1 w-full bg-amber-500" />

        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="font-bold text-sm text-foreground">Late Entry</p>
                <p className="text-[11px] text-muted-foreground truncate max-w-[140px]">{student.studentName}</p>
              </div>
            </div>
            <button
              onClick={onDismiss}
              className="h-7 w-7 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>

          {/* Reason selector */}
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Select reason…" />
            </SelectTrigger>
            <SelectContent>
              {LATE_REASONS.map(r => (
                <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Optional detail */}
          <Textarea
            placeholder="Additional details (optional)"
            value={detail}
            onChange={e => setDetail(e.target.value)}
            rows={2}
            className="text-xs resize-none"
          />

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={onDismiss}>
              Skip
            </Button>
            <Button
              size="sm"
              className="flex-1 text-xs h-8 bg-amber-500 hover:bg-amber-600 text-white"
              onClick={handleSubmit}
              disabled={!reason || submitting}
            >
              {submitting ? 'Saving…' : 'Record'}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default LateEntryForm;
