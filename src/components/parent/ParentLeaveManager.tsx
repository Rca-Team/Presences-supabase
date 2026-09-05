import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  AlertCircle,
  PlusCircle,
  FileText,
  Send,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChildProfile, LeaveRequest } from '@/hooks/useParentPortal';
import { format, addDays } from 'date-fns';

interface ParentLeaveManagerProps {
  child: ChildProfile;
  leaves: LeaveRequest[];
  onSubmitLeave: (leave: Omit<LeaveRequest, 'id' | 'created_at' | 'status'>) => Promise<boolean>;
}

const REASON_CATEGORIES = [
  { value: 'medical', label: '🏥 Medical / Sick Leave (Fever, Doctor visit)' },
  { value: 'family', label: '👨‍👩‍👧‍👦 Family Event / Wedding' },
  { value: 'urgent', label: '⚠️ Urgent Personal Work' },
  { value: 'travel', label: '✈️ Out of Station / Travel' },
  { value: 'other', label: '📝 Other Reason' },
];

export const ParentLeaveManager: React.FC<ParentLeaveManagerProps> = ({
  child,
  leaves,
  onSubmitLeave,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [startDate, setStartDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [reasonCategory, setReasonCategory] = useState('medical');
  const [reasonText, setReasonText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) return;

    setIsSubmitting(true);
    const success = await onSubmitLeave({
      student_id: child.employee_id,
      student_name: child.name,
      start_date: startDate,
      end_date: endDate,
      reason_category: reasonCategory,
      reason_text: reasonText.trim() || 'Parent requested absence',
    });

    if (success) {
      setShowForm(false);
      setReasonText('');
    }
    setIsSubmitting(false);
  };

  return (
    <Card className="rounded-3xl border-border/80 bg-card shadow-sm overflow-hidden">
      <CardHeader className="p-4 sm:p-6 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-black text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Student Leave Requests
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Notify the class teacher in advance for planned or medical absences.
            </CardDescription>
          </div>

          <Button
            onClick={() => setShowForm(!showForm)}
            size="sm"
            className="rounded-2xl text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/25 h-9 border-0"
          >
            <PlusCircle className="mr-1.5 h-4 w-4 text-white" />
            {showForm ? 'Cancel Application' : 'Apply for New Leave'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 pt-1 space-y-4">
        {/* Animated Leave Application Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <form
                onSubmit={handleSubmit}
                className="p-4 sm:p-5 rounded-2xl bg-muted/40 border border-border/80 space-y-4 mb-3"
              >
                <div className="flex items-center gap-2 pb-1 border-b border-border/60 text-xs font-bold text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" /> New Leave Application for {child.name}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Leave Start Date</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="rounded-xl h-10 text-xs bg-background"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Leave End Date</Label>
                    <Input
                      type="date"
                      value={endDate}
                      min={startDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="rounded-xl h-10 text-xs bg-background"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Reason Category</Label>
                  <Select value={reasonCategory} onValueChange={setReasonCategory}>
                    <SelectTrigger className="rounded-xl h-10 text-xs bg-background">
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {REASON_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value} className="text-xs">
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Note for Class Teacher (Optional)</Label>
                  <Textarea
                    placeholder="e.g. Rahul has a doctor appointment for fever on Tuesday morning."
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    className="rounded-xl text-xs bg-background min-h-[70px]"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white shadow-md shadow-blue-500/25 border-0"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" /> Submitting Request...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4 text-white" /> Send Leave Request to Class Teacher
                    </>
                  )}
                </Button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Existing Leaves List */}
        <div className="space-y-2.5">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Past & Submitted Applications ({leaves.length})
          </p>

          {leaves.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-dashed border-border/80 bg-background/40">
              <CalendarIcon className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-xs font-bold text-foreground">No Leave Requests Yet</p>
              <p className="text-[11px] text-muted-foreground max-w-xs mx-auto mt-0.5">
                When your child needs time off, submit an application here to keep teachers informed and avoid unauthorized absences.
              </p>
            </div>
          ) : (
            leaves.map((leave) => {
              const statusChip = {
                pending: {
                  label: 'Pending Teacher Approval',
                  cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
                  icon: Clock,
                },
                approved: {
                  label: 'Approved & Excused',
                  cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
                  icon: CheckCircle2,
                },
                rejected: {
                  label: 'Rejected',
                  cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
                  icon: AlertCircle,
                },
              }[leave.status] || {
                label: 'Pending',
                cls: 'bg-muted text-muted-foreground',
                icon: Clock,
              };

              const StatusIcon = statusChip.icon;

              return (
                <div
                  key={leave.id}
                  className="p-3.5 rounded-2xl border border-border/70 bg-background/60 hover:bg-muted/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-foreground">
                        {format(new Date(leave.start_date), 'dd MMM yyyy')}
                        {leave.start_date !== leave.end_date &&
                          ` – ${format(new Date(leave.end_date), 'dd MMM yyyy')}`}
                      </span>
                      <Badge className={`text-[10px] font-bold rounded-full border ${statusChip.cls}`}>
                        <StatusIcon className="h-3 w-3 mr-1 inline-block" /> {statusChip.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground font-medium">
                      {leave.reason_text || 'Absence requested'}
                    </p>
                  </div>

                  <span className="text-[10px] text-muted-foreground font-mono self-start sm:self-center">
                    Applied {format(new Date(leave.created_at), 'dd MMM')}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
};
