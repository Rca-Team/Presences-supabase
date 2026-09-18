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
  ArrowRight,
  Building2,
  Check,
  FileCheck,
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  GatePass,
  GatePassReason,
  fetchClassGatePasses,
  verifyPassByTeacher,
  approvePassByPrincipal,
  rejectGatePass,
  createGatePass,
  subscribeToGatePasses,
  getGatePassWhatsAppUrl,
  generateGatePassQrPayload,
  isSameDay,
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
  const [filter, setFilter] = useState<'all' | 'pending_teacher' | 'pending_principal' | 'approved' | 'used' | 'rejected'>('pending_teacher');
  const [search, setSearch] = useState('');

  // Forward Modal State
  const [verifyingPass, setVerifyingPass] = useState<GatePass | null>(null);
  const [teacherNote, setTeacherNote] = useState('');

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
  const [pickupIdProof, setPickupIdProof] = useState('Parent ID / Aadhaar Card');
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
    if (filter === 'pending_teacher') {
      list = list.filter((p) => p.status === 'pending_teacher' || p.status === 'pending');
    } else if (filter !== 'all') {
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
      pending_teacher: passes.filter((p) => p.status === 'pending_teacher' || p.status === 'pending').length,
      pending_principal: passes.filter((p) => p.status === 'pending_principal').length,
      approved: passes.filter((p) => p.status === 'approved').length,
      used: passes.filter((p) => p.status === 'used').length,
      rejected: passes.filter((p) => p.status === 'rejected').length,
    };
  }, [passes]);

  // Handle Step 1 Teacher Verification & Forward to Principal
  const handleConfirmTeacherVerify = async () => {
    if (!verifyingPass) return;
    setIsProcessing(true);
    try {
      const ok = await verifyPassByTeacher(
        verifyingPass.id,
        `${teacherName} (Class Teacher)`,
        teacherNote.trim() || 'Class teacher verified reason and identity'
      );

      if (ok) {
        toast({
          title: 'Verified & Forwarded to Principal 🏛️',
          description: `Pass ${verifyingPass.pass_code} for ${verifyingPass.student_name} forwarded to Principal for final sign-off.`,
        });
        setVerifyingPass(null);
        setTeacherNote('');
        await loadPasses();
        setFilter('pending_principal');
      } else {
        throw new Error('Verification failed');
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message || 'Could not verify gate pass.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Direct Teacher Emergency Approval (Bypassing Principal in urgent scenarios)
  const handleDirectEmergencyApprove = async (pass: GatePass) => {
    setIsProcessing(true);
    try {
      const ok = await approvePassByPrincipal(
        pass.id,
        `${teacherName} (Class Teacher - Emergency Authority)`,
        'Direct emergency class teacher override'
      );

      if (ok) {
        toast({
          title: 'Gate Pass Approved & QR Active ✅',
          description: `Pass ${pass.pass_code} for ${pass.student_name} is now immediately active at Gate Security.`,
        });
        await loadPasses();
        setFilter('approved');
      } else {
        throw new Error('Approval failed');
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
      const ok = await rejectGatePass(
        rejectingPass.id,
        `${teacherName} (Class Teacher)`,
        rejectionReason.trim() || 'Disapproved during Class Teacher review.',
        'teacher'
      );

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

  // Check if chosen student already has a valid pass created today
  const selectedStudentPassToday = useMemo(() => {
    if (!selectedStudentId) return null;
    const st = students.find((s) => s.admission_number === selectedStudentId || s.id === selectedStudentId);
    const cleanId = String(st?.admission_number || st?.roll_number || st?.id || selectedStudentId).trim().toLowerCase();
    const today = new Date();
    return (
      passes.find((p) => {
        const pId = String(p.student_id || '').trim().toLowerCase();
        if (pId !== cleanId && p.student_id !== selectedStudentId) return false;
        if (!isSameDay(p.created_at, today)) return false;
        return p.status !== 'rejected' && p.status !== 'expired';
      }) || null
    );
  }, [selectedStudentId, passes, students]);

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
        pickup_person_id_proof: pickupIdProof.trim(),
        reason_category: reasonCategory,
        reason_text: reasonText.trim(),
        expected_pickup_time: pickupTime,
        valid_until: 'End of School Day',
        teacher_verified_by: `${teacherName} (Class Teacher)`,
        teacher_verified_at: new Date().toISOString(),
        status: 'pending_principal', // Forwards to Principal
      });

      if (created) {
        toast({
          title: 'Gate Pass Forwarded to Principal 🏛️',
          description: `Pass ${created.pass_code} for ${st.name} submitted for final Principal sign-off.`,
        });
        setIsIssueModalOpen(false);
        await loadPasses();
        setFilter('pending_principal');
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
              <div class="row"><strong>Guardian ID Proof:</strong> <span>${pass.pickup_person_id_proof || 'Verified'}</span></div>
              <div class="row"><strong>Pickup Reason:</strong> <span>${pass.reason_text}</span></div>
              <div class="row"><strong>Expected Time:</strong> <span>${pass.expected_pickup_time}</span></div>
              <div class="row"><strong>Teacher Verification:</strong> <span>${pass.teacher_verified_by || 'Verified'}</span></div>
              <div class="row"><strong>Principal Approval:</strong> <span>${pass.principal_approved_by || pass.approved_by || 'Principal Office'}</span></div>
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
            <QrCode className="h-5 w-5 text-primary" /> Class {activeClass?.category} Gate Pass Verification (Tier 1)
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Step 1: Review parent pickup requests, verify student safety reason, and forward to Principal for final QR pass authorization.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setIsIssueModalOpen(true)}
            className="rounded-xl text-xs font-bold bg-primary text-white shadow-xs gap-1.5"
          >
            <PlusCircle className="h-4 w-4" /> Issue Medical / Early Pass
          </Button>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            { id: 'pending_teacher', label: '1. Awaiting Teacher', count: counts.pending_teacher, color: 'bg-amber-500' },
            { id: 'pending_principal', label: '2. Forwarded to Principal', count: counts.pending_principal, color: 'bg-blue-500' },
            { id: 'approved', label: '3. Approved (QR Active)', count: counts.approved, color: 'bg-emerald-500' },
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
            <p className="text-xs font-bold text-foreground">No gate passes in this section</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {filter === 'pending_teacher'
                ? 'All parent early pickup requests have been verified and forwarded.'
                : 'No gate pass records match the selected category.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredPasses.map((pass) => {
            const isPendingTeacher = pass.status === 'pending_teacher' || pass.status === 'pending';
            const isPendingPrincipal = pass.status === 'pending_principal';
            const isApproved = pass.status === 'approved';
            const isUsed = pass.status === 'used';
            const isRejected = pass.status === 'rejected';
            const whatsAppUrl = getGatePassWhatsAppUrl(pass);

            return (
              <Card
                key={pass.id}
                className={`rounded-2xl border transition-all ${
                  isPendingTeacher
                    ? 'border-amber-500/40 bg-amber-500/5 shadow-xs'
                    : isPendingPrincipal
                    ? 'border-blue-500/30 bg-blue-500/5'
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
                            : isPendingPrincipal
                            ? 'bg-blue-500/10 text-blue-600 border-blue-500/30'
                            : isPendingTeacher
                            ? 'bg-amber-500/10 text-amber-600 border-amber-500/30 animate-pulse'
                            : isUsed
                            ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30'
                            : 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                        }`}
                      >
                        {isPendingPrincipal
                          ? '2. PENDING PRINCIPAL'
                          : isPendingTeacher
                          ? '1. AWAITING TEACHER'
                          : isApproved
                          ? 'QR READY AT GATE'
                          : pass.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>

                  {/* Student & Guardian Info */}
                  <div className="flex items-start gap-3">
                    <Avatar className="h-11 w-11 rounded-xl border border-border shrink-0">
                      <AvatarImage src={pass.student_image_url} alt={pass.student_name} />
                      <AvatarFallback className="rounded-xl font-bold bg-primary/10 text-primary text-xs">
                        {pass.student_name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-baseline justify-between">
                        <h4 className="text-sm font-black text-foreground truncate">{pass.student_name}</h4>
                        <span className="text-[11px] font-bold text-primary shrink-0">
                          {pass.expected_pickup_time}
                        </span>
                      </div>

                      <div className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{pass.pickup_person_name}</span> ({pass.pickup_person_relation})
                        {pass.pickup_person_phone && (
                          <span className="font-mono text-[11px] ml-1">📱 {pass.pickup_person_phone}</span>
                        )}
                      </div>

                      <p className="text-xs text-foreground/90 bg-muted/30 p-2 rounded-xl border border-border/50">
                        <span className="text-muted-foreground font-medium">Reason: </span>
                        {pass.reason_text}
                      </p>
                    </div>
                  </div>

                  {/* 2-Tier Pipeline Info Badges */}
                  <div className="text-[11px] text-muted-foreground flex flex-wrap gap-2 pt-1 border-t border-border/50">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{format(new Date(pass.created_at), 'dd MMM, hh:mm a')}</span>
                    </div>

                    {pass.teacher_verified_by && (
                      <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                        <Check className="h-3 w-3" />
                        <span>Teacher Verified</span>
                      </div>
                    )}

                    {(pass.principal_approved_by || (isApproved && pass.approved_by)) && (
                      <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Principal Approved</span>
                      </div>
                    )}

                    {isUsed && (
                      <div className="flex items-center gap-1 text-indigo-600 font-bold">
                        <ShieldCheck className="h-3 w-3" />
                        <span>Exited {pass.exit_gate || 'Gate'} at {format(new Date(pass.exit_time || ''), 'hh:mm a')}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions for Class Teacher */}
                  {isPendingTeacher && (
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => setVerifyingPass(pass)}
                        disabled={isProcessing}
                        className="flex-1 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary/90 shadow-sm"
                      >
                        <ArrowRight className="h-3.5 w-3.5 mr-1" /> Verify & Forward to Principal
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRejectingPass(pass)}
                        disabled={isProcessing}
                        className="rounded-xl text-xs font-bold text-rose-600 border-rose-500/30 hover:bg-rose-500/10"
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Decline
                      </Button>
                    </div>
                  )}

                  {/* If forward to principal, teacher can also direct approve in emergency */}
                  {isPendingPrincipal && (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="text-[11px] text-blue-700 dark:text-blue-300 flex items-center gap-1.5 font-medium">
                        <Building2 className="h-3.5 w-3.5 animate-pulse" />
                        Awaiting Principal final approval
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDirectEmergencyApprove(pass)}
                        disabled={isProcessing}
                        className="text-[11px] font-bold text-emerald-600 hover:bg-emerald-500/10 h-7 px-2.5 rounded-lg"
                      >
                        Emergency Bypass
                      </Button>
                    </div>
                  )}

                  {/* Actions for Approved Passes */}
                  {isApproved && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPreviewPass(pass)}
                        className="flex-1 rounded-xl text-xs font-bold gap-1"
                      >
                        <QrCode className="h-3.5 w-3.5" /> View QR
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(whatsAppUrl, '_blank')}
                        className="rounded-xl text-xs font-bold gap-1 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                      >
                        <Share2 className="h-3.5 w-3.5" /> WhatsApp
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePrintSlip(pass)}
                        className="rounded-xl text-xs font-bold gap-1"
                      >
                        <Printer className="h-3.5 w-3.5" /> Print
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Verify & Forward Modal */}
      <Dialog open={Boolean(verifyingPass)} onOpenChange={(open) => !open && setVerifyingPass(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl p-6">
          <DialogHeader>
            <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-2">
              <FileCheck className="h-5 w-5" />
            </div>
            <DialogTitle className="text-base font-black">
              Verify Gate Pass & Forward to Principal
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Confirm early release authorization for <strong>{verifyingPass?.student_name}</strong> (Class {verifyingPass?.class_section}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs my-2">
            <div className="p-3 rounded-2xl bg-muted/40 border border-border/70 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Authorized Guardian:</span>
                <span className="font-bold">{verifyingPass?.pickup_person_name} ({verifyingPass?.pickup_person_relation})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected Time:</span>
                <span className="font-bold text-primary">{verifyingPass?.expected_pickup_time}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reason:</span>
                <span className="font-medium">{verifyingPass?.reason_text}</span>
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold">Class Teacher Remarks (Optional)</Label>
              <Input
                value={teacherNote}
                onChange={(e) => setTeacherNote(e.target.value)}
                placeholder="e.g. Spoke to mother on phone; confirmed appointment."
                className="mt-1 rounded-xl text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVerifyingPass(null)}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmTeacherVerify}
              disabled={isProcessing}
              className="rounded-xl text-xs font-bold bg-primary text-white gap-1.5"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Forward to Principal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Reason Dialog */}
      <Dialog open={Boolean(rejectingPass)} onOpenChange={(open) => !open && setRejectingPass(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-rose-600 flex items-center gap-2">
              <XCircle className="h-5 w-5" /> Disapprove Gate Pass Request
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Please specify the reason for declining gate pass for <strong>{rejectingPass?.student_name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs my-2">
            <div>
              <Label className="text-xs font-bold">Decline Reason *</Label>
              <Input
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Critical test scheduled / Guardian phone could not be verified"
                className="mt-1 rounded-xl text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRejectingPass(null)}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmReject}
              disabled={isProcessing}
              className="rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Disapproval'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Slip Preview Dialog */}
      <Dialog open={Boolean(previewPass)} onOpenChange={(open) => !open && setPreviewPass(null)}>
        <DialogContent className="sm:max-w-sm rounded-3xl p-6 text-center">
          <DialogHeader>
            <DialogTitle className="text-base font-black">Official QR Gate Pass</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Pass Code: <strong className="font-mono text-foreground">{previewPass?.pass_code}</strong>
            </DialogDescription>
          </DialogHeader>

          {previewPass && (
            <div className="space-y-4 my-2">
              <div className="p-4 bg-white rounded-2xl border shadow-md inline-block">
                <QRCodeSVG
                  value={previewPass.qr_payload || generateGatePassQrPayload(previewPass)}
                  size={180}
                  level="H"
                />
              </div>

              <div className="text-xs space-y-1">
                <p className="font-bold text-foreground text-sm">{previewPass.student_name}</p>
                <p className="text-muted-foreground">Class {previewPass.class_section} • Pickup: {previewPass.pickup_person_name}</p>
                <p className="text-emerald-600 font-bold text-[11px]">Ready for Gate Security Guard Scan</p>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handlePrintSlip(previewPass)}
                  className="flex-1 rounded-xl text-xs font-bold bg-primary text-white"
                >
                  <Printer className="h-3.5 w-3.5 mr-1" /> Print Slip
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(getGatePassWhatsAppUrl(previewPass), '_blank')}
                  className="flex-1 rounded-xl text-xs font-bold border-emerald-500/40 text-emerald-600"
                >
                  <Share2 className="h-3.5 w-3.5 mr-1" /> WhatsApp
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Issue Pass Modal */}
      <Dialog open={isIssueModalOpen} onOpenChange={setIsIssueModalOpen}>
        <DialogContent className="sm:max-w-lg rounded-3xl p-6">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <PlusCircle className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-black">
                  Issue Class Gate Pass
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Create an authorized early release pass for Class {activeClass?.category}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleTeacherIssuePass} className="space-y-4 text-xs">
            <div>
              <Label className="text-xs font-bold">Select Student *</Label>
              <select
                value={selectedStudentId}
                onChange={(e) => handleSelectStudentForPass(e.target.value)}
                required
                className="mt-1 w-full h-10 px-3 rounded-xl border border-input bg-background text-xs font-medium focus:ring-2 focus:ring-primary/20"
              >
                <option value="">-- Choose Student from Class {activeClass?.category} --</option>
                {students.map((s) => (
                  <option key={s.id} value={s.admission_number || s.id}>
                    {s.roll_number ? `#${s.roll_number} - ` : ''}{s.name} ({s.admission_number || s.employee_id || 'ID'})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold">Authorized Pickup Person *</Label>
                <Input
                  value={pickupPerson}
                  onChange={(e) => setPickupPerson(e.target.value)}
                  placeholder="Guardian full name"
                  required
                  className="mt-1 rounded-xl text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-bold">Relation *</Label>
                <select
                  value={pickupRelation}
                  onChange={(e) => setPickupRelation(e.target.value)}
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-input bg-background text-xs font-medium focus:ring-2 focus:ring-primary/20"
                >
                  <option value="Father">Father</option>
                  <option value="Mother">Mother</option>
                  <option value="Guardian">Guardian</option>
                  <option value="Self">Self / Senior Student</option>
                  <option value="Other">Other Relative</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold">Guardian Contact Phone *</Label>
                <Input
                  value={pickupPhone}
                  onChange={(e) => setPickupPhone(e.target.value)}
                  placeholder="10-digit number"
                  required
                  className="mt-1 rounded-xl text-xs font-mono"
                />
              </div>
              <div>
                <Label className="text-xs font-bold">Departure Time *</Label>
                <Input
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  required
                  className="mt-1 rounded-xl text-xs"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold">Reason Category *</Label>
              <select
                value={reasonCategory}
                onChange={(e) => setReasonCategory(e.target.value as any)}
                className="mt-1 w-full h-10 px-3 rounded-xl border border-input bg-background text-xs font-medium focus:ring-2 focus:ring-primary/20"
              >
                <option value="illness_at_school">Illness at School / Sick Bay</option>
                <option value="medical">Medical Checkup / Hospital</option>
                <option value="family_emergency">Family Emergency</option>
                <option value="appointment">Official / Competitive Exam</option>
                <option value="other">Other School Authorization</option>
              </select>
            </div>

            <div>
              <Label className="text-xs font-bold">Detailed Reason *</Label>
              <Input
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                required
                className="mt-1 rounded-xl text-xs"
              />
            </div>

            {/* Daily Pass Limit Notice if student already has a pass today */}
            {selectedStudentPassToday && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1 text-amber-800 dark:text-amber-200">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  Pass Already Requested/Active Today
                </p>
                <p className="text-[11px] text-amber-700/90 dark:text-amber-300/90">
                  This student already has gate pass <strong className="font-mono">{selectedStudentPassToday.pass_code}</strong> ({selectedStudentPassToday.status.replace('_', ' ').toUpperCase()}) today. Only 1 gate pass is permitted per student per day.
                </p>
              </div>
            )}

            <DialogFooter className="gap-2 sm:justify-between pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsIssueModalOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isProcessing || Boolean(selectedStudentPassToday)}
                className="rounded-xl text-xs font-bold bg-primary text-white shadow-md disabled:opacity-60"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1" /> Processing...
                  </>
                ) : selectedStudentPassToday ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-1 text-amber-400" /> Pass Already Created Today
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-1" /> Forward to Principal for Approval
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
