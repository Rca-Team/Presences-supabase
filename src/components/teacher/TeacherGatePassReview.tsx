import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  QrCode,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Search,
  PlusCircle,
  AlertCircle,
  Phone,
  User,
  Send,
  Loader2,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  GatePass,
  GatePassReason,
  fetchClassGatePasses,
  updateGatePassStatus,
  createGatePass,
  subscribeToGatePasses,
} from '@/services/gatePassService';
import { ClassStudent, ClassAssignment } from './TeacherAdminWorkspace';

interface TeacherGatePassReviewProps {
  activeClass: ClassAssignment | null;
  teacherName: string;
  teacherEmail: string;
  students: ClassStudent[];
}

export const TeacherGatePassReview: React.FC<TeacherGatePassReviewProps> = ({
  activeClass,
  teacherName,
  teacherEmail,
  students,
}) => {
  const { toast } = useToast();
  const [passes, setPasses] = useState<GatePass[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'used' | 'rejected'>('pending');
  const [search, setSearch] = useState('');

  // Rejection Dialog State
  const [rejectingPass, setRejectingPass] = useState<GatePass | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Teacher Issue Pass Modal State
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [pickupPerson, setPickupPerson] = useState('');
  const [pickupPhone, setPickupPhone] = useState('');
  const [pickupRelation, setPickupRelation] = useState('Parent');
  const [reasonCategory, setReasonCategory] = useState<GatePassReason>('illness_at_school');
  const [reasonText, setReasonText] = useState('High fever / medical attention required at home');
  const [pickupTime, setPickupTime] = useState(format(new Date(), 'hh:mm a'));

  // Load passes for active class
  const loadPasses = useCallback(async () => {
    if (!activeClass?.category) return;
    setIsLoading(true);
    try {
      const data = await fetchClassGatePasses(activeClass.category);
      setPasses(data);
    } catch (e) {
      console.warn('Could not load class gate passes:', e);
    } finally {
      setIsLoading(false);
    }
  }, [activeClass?.category]);

  useEffect(() => {
    loadPasses();
    const unsub = subscribeToGatePasses(() => {
      loadPasses();
    });
    return unsub;
  }, [loadPasses]);

  // Filtered passes
  const filteredPasses = useMemo(() => {
    let list = passes;
    if (filter !== 'all') {
      list = list.filter((p) => p.status === filter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.student_name.toLowerCase().includes(q) ||
          p.student_id.toLowerCase().includes(q) ||
          p.pass_code.toLowerCase().includes(q) ||
          p.pickup_person_name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [passes, filter, search]);

  const counts = useMemo(() => {
    return {
      all: passes.length,
      pending: passes.filter((p) => p.status === 'pending').length,
      approved: passes.filter((p) => p.status === 'approved').length,
      used: passes.filter((p) => p.status === 'used').length,
      rejected: passes.filter((p) => p.status === 'rejected').length,
    };
  }, [passes]);

  // Handle Approve
  const handleApprove = async (pass: GatePass) => {
    setIsProcessing(true);
    try {
      const ok = await updateGatePassStatus(pass.id, 'approved', {
        approved_by: `${teacherName} (Class Teacher)`,
      });

      if (ok) {
        toast({
          title: 'Gate Pass Approved ✅',
          description: `Pass ${pass.pass_code} for ${pass.student_name} is now active at Gate Turnstiles.`,
        });
        await loadPasses();
      } else {
        throw new Error('Update failed');
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message || 'Could not approve gate pass.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Reject Submit
  const handleConfirmReject = async () => {
    if (!rejectingPass) return;
    setIsProcessing(true);
    try {
      const ok = await updateGatePassStatus(rejectingPass.id, 'rejected', {
        rejection_reason: rejectionReason.trim() || 'Disapproved by class teacher.',
      });

      if (ok) {
        toast({
          title: 'Gate Pass Disapproved ❌',
          description: `Pass ${rejectingPass.pass_code} marked as rejected. Parent has been notified.`,
        });
        setRejectingPass(null);
        setRejectionReason('');
        await loadPasses();
      } else {
        throw new Error('Update failed');
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message || 'Could not reject pass.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // When teacher selects student in "Issue Pass" modal
  const handleSelectStudentForPass = (stId: string) => {
    setSelectedStudentId(stId);
    const found = students.find((s) => s.admission_number === stId || s.id === stId);
    if (found) {
      setPickupPerson(found.parent_name || 'Parent / Guardian');
      setPickupPhone(found.parent_phone || '');
    }
  };

  // Teacher Directly Issues Emergency Pass
  const handleTeacherIssuePass = async (e: React.FormEvent) => {
    e.preventDefault();
    const st = students.find((s) => s.admission_number === selectedStudentId || s.id === selectedStudentId);
    if (!st) {
      toast({ title: 'Student Required', description: 'Please select a student.', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    try {
      const created = await createGatePass({
        student_id: st.admission_number || st.roll_number || st.id,
        student_name: st.name,
        class_section: activeClass?.category || '6-A',
        student_image_url: st.photo_url,
        requested_by: 'teacher',
        pickup_person_name: pickupPerson.trim() || st.parent_name || 'Authorized Guardian',
        pickup_person_phone: pickupPhone.trim() || st.parent_phone || '',
        pickup_person_relation: pickupRelation,
        reason_category: reasonCategory,
        reason_text: reasonText.trim(),
        expected_pickup_time: pickupTime,
        valid_until: 'End of School Day',
        approved_by: `${teacherName} (Class Teacher)`,
      });

      if (created) {
        toast({
          title: 'Emergency Gate Pass Issued 🎫',
          description: `Pass ${created.pass_code} for ${st.name} is now immediately active at Gate Security.`,
        });
        setIsIssueModalOpen(false);
        await loadPasses();
        setFilter('approved');
      }
    } catch (err: any) {
      toast({ title: 'Issue Failed', description: err?.message || 'Could not issue pass.', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-card border border-border/70 shadow-xs">
        <div>
          <h3 className="text-base font-black text-foreground flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" /> Class {activeClass?.category} Gate Pass Authorizations
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Review parent pickup requests, digitally authorize early student exits, or issue emergency medical passes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setIsIssueModalOpen(true)}
            className="rounded-xl text-xs font-bold bg-primary text-white shadow-xs gap-1.5"
          >
            <PlusCircle className="h-4 w-4" /> Issue Sick-Bay Pass
          </Button>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            { id: 'pending', label: 'Pending Review', count: counts.pending, color: 'bg-amber-500' },
            { id: 'approved', label: 'Approved Today', count: counts.approved, color: 'bg-emerald-500' },
            { id: 'used', label: 'Exited Campus', count: counts.used, color: 'bg-indigo-500' },
            { id: 'rejected', label: 'Disapproved', count: counts.rejected, color: 'bg-rose-500' },
            { id: 'all', label: 'All Passes', count: counts.all, color: 'bg-muted-foreground' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 border ${
                filter === tab.id
                  ? 'bg-primary text-white border-primary shadow-xs'
                  : 'bg-background border-border/70 text-muted-foreground hover:bg-muted/40'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  filter === tab.id ? 'bg-white/20 text-white' : `${tab.color}/20 text-foreground`
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student, pass code..."
            className="h-8 pl-8 text-xs rounded-xl bg-background"
          />
        </div>
      </div>

      {/* Passes List */}
      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground flex flex-col items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs font-medium">Syncing class gate passes...</p>
        </div>
      ) : filteredPasses.length === 0 ? (
        <Card className="border-dashed border-border/80 bg-background/40">
          <CardContent className="p-8 text-center">
            <QrCode className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-xs font-bold text-foreground">No {filter} gate passes found</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {filter === 'pending'
                ? 'All parent early pickup requests have been reviewed and cleared.'
                : 'No gate pass records match the selected category.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredPasses.map((pass) => {
            const isPending = pass.status === 'pending';
            const isApproved = pass.status === 'approved';
            const isUsed = pass.status === 'used';

            return (
              <Card
                key={pass.id}
                className={`rounded-2xl border transition-all ${
                  isPending
                    ? 'border-amber-500/40 bg-amber-500/5 shadow-xs'
                    : isApproved
                    ? 'border-emerald-500/30 bg-card'
                    : isUsed
                    ? 'border-indigo-500/30 bg-card/60'
                    : 'border-rose-500/30 bg-rose-500/5'
                }`}
              >
                <CardContent className="p-4 space-y-3">
                  {/* Top Bar: Code + Status Badge */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black px-2.5 py-0.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
                        {pass.pass_code}
                      </span>
                      <span className="text-[11px] text-muted-foreground font-mono">ID: {pass.student_id}</span>
                    </div>

                    <Badge
                      variant="outline"
                      className={`text-[10px] font-extrabold uppercase rounded-full ${
                        isApproved
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                          : isPending
                          ? 'bg-amber-500/10 text-amber-600 border-amber-500/30 animate-pulse'
                          : isUsed
                          ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30'
                          : 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                      }`}
                    >
                      {pass.status}
                    </Badge>
                  </div>

                  {/* Student & Reason Info */}
                  <div>
                    <h4 className="text-sm font-black text-foreground">{pass.student_name}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5 font-medium">{pass.reason_text}</p>
                  </div>

                  {/* Guardian & Timing Details */}
                  <div className="p-2.5 rounded-xl bg-muted/40 border border-border/50 text-[11px] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" /> Pickup Person:
                      </span>
                      <span className="font-bold text-foreground">
                        {pass.pickup_person_name} ({pass.pickup_person_relation})
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" /> Contact Phone:
                      </span>
                      <span className="font-mono font-bold text-foreground">{pass.pickup_person_phone}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Expected Departure:
                      </span>
                      <span className="font-bold text-primary">{pass.expected_pickup_time}</span>
                    </div>

                    {pass.approved_by && (
                      <div className="flex items-center justify-between pt-1 border-t border-border/30">
                        <span className="text-muted-foreground">Authorized By:</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{pass.approved_by}</span>
                      </div>
                    )}

                    {pass.exit_time && (
                      <div className="flex items-center justify-between pt-1 border-t border-border/30 text-indigo-600 dark:text-indigo-400 font-bold">
                        <span>Exited at Gate:</span>
                        <span>{format(new Date(pass.exit_time), 'hh:mm a')} ({pass.exit_gate || 'Main Gate'})</span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons for Pending Passes */}
                  {isPending && (
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        disabled={isProcessing}
                        onClick={() => handleApprove(pass)}
                        className="flex-1 h-8 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1 shadow-xs"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve Pass
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isProcessing}
                        onClick={() => setRejectingPass(pass)}
                        className="h-8 rounded-xl text-xs font-bold border-rose-500/30 text-rose-600 hover:bg-rose-500/10 gap-1"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Disapprove
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Reject Confirmation Dialog */}
      <Dialog open={Boolean(rejectingPass)} onOpenChange={(open) => !open && setRejectingPass(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-foreground">
              Disapprove Gate Pass Request
            </DialogTitle>
            <DialogDescription className="text-xs">
              State the reason for not releasing <strong>{rejectingPass?.student_name}</strong>. This message will be sent to the parent.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 my-2">
            <div className="space-y-1">
              <Label className="text-xs font-bold">Reason for Disapproval</Label>
              <Input
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Exam ongoing until 11:30 AM / Parent not reachable"
                className="h-9 text-xs rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectingPass(null)} className="rounded-xl text-xs flex-1">
              Cancel
            </Button>
            <Button
              disabled={isProcessing}
              onClick={handleConfirmReject}
              className="rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white flex-1"
            >
              {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm Disapproval'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Teacher Direct Issue Emergency Pass Dialog */}
      <Dialog open={isIssueModalOpen} onOpenChange={setIsIssueModalOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-primary" /> Issue Immediate Gate Pass
            </DialogTitle>
            <DialogDescription className="text-xs">
              Issue an official sick-bay / emergency gate pass directly from the teacher desk.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleTeacherIssuePass} className="space-y-3.5 my-2">
            <div className="space-y-1">
              <Label className="text-xs font-bold">Select Student</Label>
              <select
                value={selectedStudentId}
                onChange={(e) => handleSelectStudentForPass(e.target.value)}
                className="h-9 w-full text-xs rounded-xl bg-background border border-input px-3 font-semibold"
                required
              >
                <option value="">-- Choose Student from Class {activeClass?.category} --</option>
                {students.map((st) => (
                  <option key={st.id} value={st.admission_number || st.id}>
                    Roll #{st.roll_number || '-'} • {st.name} (ID: {st.admission_number || st.id})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Pickup Person</Label>
                <Input
                  value={pickupPerson}
                  onChange={(e) => setPickupPerson(e.target.value)}
                  placeholder="e.g. Parent Name"
                  className="h-9 text-xs rounded-xl"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Phone Number</Label>
                <Input
                  value={pickupPhone}
                  onChange={(e) => setPickupPhone(e.target.value)}
                  placeholder="+91..."
                  className="h-9 text-xs rounded-xl font-mono"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Reason / Infirmary Diagnosis</Label>
              <Input
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="e.g. Severe headache / vomiting / sent from school medical room"
                className="h-9 text-xs rounded-xl"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Departure Time</Label>
              <Input
                value={pickupTime}
                onChange={(e) => setPickupTime(e.target.value)}
                className="h-9 text-xs rounded-xl"
                required
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsIssueModalOpen(false)} className="rounded-xl text-xs flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={isProcessing} className="rounded-xl text-xs font-bold bg-primary text-white flex-1">
                {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Issue Active Pass'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
