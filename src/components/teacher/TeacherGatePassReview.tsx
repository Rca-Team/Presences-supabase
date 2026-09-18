import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { QRCodeSVG } from 'qrcode.react';
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
  Printer,
  Share2,
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
  getGatePassWhatsAppUrl,
} from '@/services/gatePassService';
import { ClassStudent, ClassAssignment } from './TeacherAdminWorkspace';
import { sanitizeStudentPhotoUrl } from '@/utils/studentPhotoResolver';

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

  // QR Pass Slip Dialog State
  const [previewPass, setPreviewPass] = useState<GatePass | null>(null);

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
          description: `Pass ${rejectingPass.pass_code} marked as rejected.`,
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
        student_image_url: sanitizeStudentPhotoUrl(st.photo_url),
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
        setPreviewPass(created);
      }
    } catch (err: any) {
      toast({ title: 'Issue Failed', description: err?.message || 'Could not issue pass.', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Print Pass Slip
  const handlePrintSlip = (pass: GatePass) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Official Gate Pass - ${pass.student_name}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 25px; text-align: center; color: #0f172a; background: #fff; }
            .pass-card { border: 2px solid #0284c7; border-radius: 16px; padding: 24px; max-width: 480px; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
            .header-bar { border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px; }
            .school { font-size: 14px; font-weight: 800; color: #0369a1; text-transform: uppercase; letter-spacing: 0.5px; }
            .title { font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 4px; }
            .pass-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 800; margin-top: 8px; text-transform: uppercase; background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
            .info-table { text-align: left; margin: 18px 0; font-size: 12px; background: #f8fafc; padding: 14px; border-radius: 10px; border: 1px solid #e2e8f0; }
            .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .row strong { color: #475569; }
            .row span { font-weight: 700; color: #0f172a; }
            .guard-box { font-size: 11px; color: #0369a1; font-weight: 700; padding: 10px; background: #f0f9ff; border-radius: 8px; border: 1px dashed #7dd3fc; margin-top: 15px; }
            .signatures { display: flex; justify-content: space-between; margin-top: 35px; font-size: 11px; font-weight: 600; color: #64748b; }
            .sign-col { border-top: 1px solid #94a3b8; width: 130px; padding-top: 4px; }
          </style>
        </head>
        <body>
          <div class="pass-card">
            <div class="header-bar">
              <div class="school">PM SHRI KENDRIYA VIDYALAYA NFC VIGYAN VIHAR</div>
              <div class="title">Official Digital Early Exit Gate Pass</div>
              <div class="pass-badge">
                ${pass.status.toUpperCase()} • CODE: ${pass.pass_code}
              </div>
            </div>

            <div class="info-table">
              <div class="row"><strong>Student Name:</strong> <span>${pass.student_name}</span></div>
              <div class="row"><strong>Class & Section:</strong> <span>${pass.class_section}</span></div>
              <div class="row"><strong>Admission / Student ID:</strong> <span>${pass.student_id}</span></div>
              <div class="row"><strong>Authorized Pickup:</strong> <span>${pass.pickup_person_name} (${pass.pickup_person_relation})</span></div>
              <div class="row"><strong>Guardian Phone:</strong> <span>${pass.pickup_person_phone}</span></div>
              <div class="row"><strong>Pickup Reason:</strong> <span>${pass.reason_text}</span></div>
              <div class="row"><strong>Expected Time:</strong> <span>${pass.expected_pickup_time}</span></div>
              <div class="row"><strong>Authorized By:</strong> <span>${pass.approved_by || 'Class Teacher In-Charge'}</span></div>
            </div>

            <div class="guard-box">
              🛡️ Present this pass at Gate Security Guard Turnstile. Guard will verify Pass Code: <strong>${pass.pass_code}</strong>.
            </div>

            <div class="signatures">
              <div class="sign-col">Parent Signature</div>
              <div class="sign-col">Class Teacher Sign</div>
              <div class="sign-col">Gate Security Guard</div>
            </div>
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
            <PlusCircle className="h-4 w-4" /> Issue Emergency Pass
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
            const whatsAppUrl = getGatePassWhatsAppUrl(pass);

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

                    <div className="flex items-center gap-1.5">
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
                  </div>

                  {/* Student & Reason Info */}
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10 rounded-xl border border-border/80 shrink-0">
                      {pass.student_image_url && <AvatarImage src={sanitizeStudentPhotoUrl(pass.student_image_url)} />}
                      <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                        {pass.student_name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-black text-foreground truncate">{pass.student_name}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5 font-medium line-clamp-2">{pass.reason_text}</p>
                    </div>
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

                  {/* Actions Bar */}
                  <div className="flex items-center gap-2 pt-1">
                    {isPending ? (
                      <>
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
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPreviewPass(pass)}
                          className="flex-1 h-8 rounded-xl text-xs font-bold border-border/70 hover:bg-muted/40 gap-1"
                        >
                          <QrCode className="h-3.5 w-3.5 text-primary" /> View Slip
                        </Button>

                        {pass.pickup_person_phone && (
                          <a
                            href={whatsAppUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-8 px-3 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors gap-1"
                          >
                            <Share2 className="h-3.5 w-3.5" /> WhatsApp
                          </a>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* QR Pass Preview & Printable Slip Modal */}
      <Dialog open={Boolean(previewPass)} onOpenChange={(open) => !open && setPreviewPass(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl p-5">
          {previewPass && (
            <div className="space-y-4 text-center">
              <DialogHeader>
                <DialogTitle className="text-base font-black text-foreground">
                  Official Campus Gate Pass Slip
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Valid for turnstile exit clearance at school security gates
                </DialogDescription>
              </DialogHeader>

              {/* QR Code */}
              <div className="p-4 bg-muted/40 border border-border/70 rounded-2xl flex flex-col items-center">
                <div className="p-3 bg-white rounded-xl shadow-xs border border-border/50">
                  <QRCodeSVG
                    value={JSON.stringify({
                      passId: previewPass.id,
                      passCode: previewPass.pass_code,
                      studentId: previewPass.student_id,
                      studentName: previewPass.student_name,
                      classSection: previewPass.class_section,
                      pickupPerson: previewPass.pickup_person_name,
                      pickupPhone: previewPass.pickup_person_phone,
                    })}
                    size={140}
                  />
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <Badge className="font-mono text-xs font-black bg-primary/10 text-primary border-primary/30">
                    CODE: {previewPass.pass_code}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] font-bold">
                    {previewPass.status.toUpperCase()}
                  </Badge>
                </div>
              </div>

              {/* Pass Summary Details */}
              <div className="p-3 rounded-xl bg-background border border-border/60 text-xs text-left space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Student:</span>
                  <span className="font-bold">{previewPass.student_name} ({previewPass.class_section})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Authorized Pickup:</span>
                  <span className="font-bold">{previewPass.pickup_person_name} ({previewPass.pickup_person_relation})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Contact:</span>
                  <span className="font-mono font-bold">{previewPass.pickup_person_phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Departure Time:</span>
                  <span className="font-bold text-primary">{previewPass.expected_pickup_time}</span>
                </div>
                {previewPass.approved_by && (
                  <div className="flex justify-between pt-1 border-t border-border/40">
                    <span className="text-muted-foreground">Approved By:</span>
                    <span className="font-bold text-emerald-600">{previewPass.approved_by}</span>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => handlePrintSlip(previewPass)}
                  className="rounded-xl text-xs font-bold flex-1 gap-1"
                >
                  <Printer className="h-3.5 w-3.5" /> Print Slip
                </Button>
                {previewPass.pickup_person_phone && (
                  <a
                    href={getGatePassWhatsAppUrl(previewPass)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 flex-1 h-9 gap-1"
                  >
                    <Share2 className="h-3.5 w-3.5" /> Send to Parent
                  </a>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Confirmation Dialog */}
      <Dialog open={Boolean(rejectingPass)} onOpenChange={(open) => !open && setRejectingPass(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-foreground">
              Disapprove Gate Pass Request
            </DialogTitle>
            <DialogDescription className="text-xs">
              State the reason for not releasing <strong>{rejectingPass?.student_name}</strong>.
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
                {(students || []).map((st) => (
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

