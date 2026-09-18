import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { QRCodeSVG } from 'qrcode.react';
import {
  QrCode,
  CheckCircle2,
  Clock,
  Printer,
  Sparkles,
  AlertTriangle,
  UserCheck,
  PlusCircle,
  History,
  ShieldCheck,
  Send,
  Loader2,
  Share2,
  XCircle,
  ExternalLink,
  Building2,
  UserCheck2,
  Check,
  ArrowRight,
  ShieldAlert,
  Smartphone,
  Info,
} from 'lucide-react';
import { ChildProfile } from '@/hooks/useParentPortal';
import { format } from 'date-fns';
import {
  GatePass,
  GatePassReason,
  createGatePass,
  fetchStudentGatePasses,
  subscribeToGatePasses,
  getGatePassWhatsAppUrl,
  generateGatePassQrPayload,
} from '@/services/gatePassService';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'view' | 'apply' | 'history'>('view');
  const [passes, setPasses] = useState<GatePass[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [pickupPersonName, setPickupPersonName] = useState(child.parent_name || 'Parent / Authorized Guardian');
  const [pickupPersonPhone, setPickupPersonPhone] = useState(child.parent_phone || '');
  const [pickupRelation, setPickupRelation] = useState<'Father' | 'Mother' | 'Guardian' | 'Other'>('Father');
  const [pickupIdProof, setPickupIdProof] = useState('Parent ID / Aadhaar Card');
  const [reasonCategory, setReasonCategory] = useState<GatePassReason>('medical');
  const [reasonText, setReasonText] = useState('Medical appointment / Family emergency');
  const [pickupTime, setPickupTime] = useState(format(new Date(), 'hh:mm a'));

  // Load passes for active child
  const loadPasses = useCallback(async () => {
    if (!child?.employee_id) return;
    setIsLoading(true);
    try {
      const studentPasses = await fetchStudentGatePasses(child.employee_id);
      setPasses(studentPasses);

      // If there are no passes and currently on 'view', switch to 'apply'
      if (studentPasses.length === 0) {
        setActiveTab('apply');
      } else {
        // If there's an active or pending pass today, stay on 'view'
        const hasActiveToday = studentPasses.some(
          (p) =>
            p.status === 'approved' ||
            p.status === 'pending' ||
            p.status === 'pending_teacher' ||
            p.status === 'pending_principal'
        );
        if (hasActiveToday) {
          setActiveTab('view');
        }
      }
    } catch (e) {
      console.warn('Could not load student gate passes:', e);
    } finally {
      setIsLoading(false);
    }
  }, [child?.employee_id]);

  useEffect(() => {
    if (isOpen) {
      loadPasses();
    }
  }, [isOpen, loadPasses]);

  // Subscribe to realtime pass updates
  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeToGatePasses(() => {
      loadPasses();
    });
    return unsub;
  }, [isOpen, loadPasses]);

  // Find the primary active pass (approved first, then pending_principal, then pending_teacher, or most recent)
  const activePass = useMemo(() => {
    if (passes.length === 0) return null;
    const approved = passes.find((p) => p.status === 'approved');
    if (approved) return approved;
    const pendingPrincipal = passes.find((p) => p.status === 'pending_principal');
    if (pendingPrincipal) return pendingPrincipal;
    const pendingTeacher = passes.find((p) => p.status === 'pending_teacher' || p.status === 'pending');
    if (pendingTeacher) return pendingTeacher;
    return passes[0];
  }, [passes]);

  // Handle New Gate Pass Application
  const handleApplyPass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pickupPersonName.trim() || !pickupPersonPhone.trim() || !reasonText.trim()) {
      toast({
        title: 'Incomplete Request',
        description: 'Please provide guardian name, phone number, and pickup reason.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createGatePass({
        student_id: child.employee_id,
        student_name: child.name,
        class_section: child.category,
        student_image_url: child.image_url,
        requested_by: 'parent',
        pickup_person_name: pickupPersonName.trim(),
        pickup_person_phone: pickupPersonPhone.trim(),
        pickup_person_relation: pickupRelation,
        pickup_person_id_proof: pickupIdProof.trim(),
        reason_category: reasonCategory,
        reason_text: reasonText.trim(),
        expected_pickup_time: pickupTime,
        valid_until: 'End of School Day',
      });

      if (created) {
        toast({
          title: 'Gate Pass Requested ✅',
          description: `Pass ${created.pass_code} submitted to Class Teacher for initial verification.`,
        });
        await loadPasses();
        setActiveTab('view');
      } else {
        throw new Error('Could not create pass record');
      }
    } catch (err: any) {
      toast({
        title: 'Request Failed',
        description: err?.message || 'Could not submit gate pass. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // QR Code Payload for Security Turnstile
  const qrPayload = useMemo(() => {
    if (!activePass) return '';
    return activePass.qr_payload || generateGatePassQrPayload(activePass);
  }, [activePass]);

  // Print Official School Gate Pass Slip
  const handlePrintPass = () => {
    if (!activePass) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const isApproved = activePass.status === 'approved';
    const isUsed = activePass.status === 'used';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Official Gate Pass - ${activePass.student_name}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 25px; text-align: center; color: #0f172a; background: #fff; }
            .pass-card { border: 2px solid #0284c7; border-radius: 16px; padding: 24px; max-width: 480px; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
            .header-bar { border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px; }
            .school { font-size: 14px; font-weight: 800; color: #0369a1; text-transform: uppercase; letter-spacing: 0.5px; }
            .title { font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 4px; }
            .pass-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 800; margin-top: 8px; text-transform: uppercase; }
            .approved { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
            .pending { background: #fef9c3; color: #854d0e; border: 1px solid #fde047; }
            .used { background: #e0e7ff; color: #3730a3; border: 1px solid #a5b4fc; }
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
              <div class="title">Official Early Departure Gate Pass</div>
              <div class="pass-badge ${isApproved ? 'approved' : isUsed ? 'used' : 'pending'}">
                ${activePass.status.toUpperCase()} • CODE: ${activePass.pass_code}
              </div>
            </div>

            <div class="info-table">
              <div class="row"><strong>Student Name:</strong> <span>${activePass.student_name}</span></div>
              <div class="row"><strong>Class & Section:</strong> <span>${activePass.class_section}</span></div>
              <div class="row"><strong>Student ID:</strong> <span>${activePass.student_id}</span></div>
              <div class="row"><strong>Authorized Pickup:</strong> <span>${activePass.pickup_person_name} (${activePass.pickup_person_relation})</span></div>
              <div class="row"><strong>Guardian Phone:</strong> <span>${activePass.pickup_person_phone}</span></div>
              <div class="row"><strong>Guardian ID Proof:</strong> <span>${activePass.pickup_person_id_proof || 'Verified'}</span></div>
              <div class="row"><strong>Pickup Reason:</strong> <span>${activePass.reason_text}</span></div>
              <div class="row"><strong>Expected Time:</strong> <span>${activePass.expected_pickup_time}</span></div>
              <div class="row"><strong>Teacher Verified:</strong> <span>${activePass.teacher_verified_by || 'Verified'}</span></div>
              <div class="row"><strong>Principal Approved:</strong> <span>${activePass.principal_approved_by || activePass.approved_by || 'Authorized'}</span></div>
              ${activePass.exit_time ? `<div class="row"><strong>Exit Recorded:</strong> <span>${format(new Date(activePass.exit_time), 'hh:mm a, dd MMM yyyy')} (${activePass.exit_gate || 'Main Gate 1'})</span></div>` : ''}
            </div>

            <div class="guard-box">
              🛡️ Present this pass at Gate Security Guard Turnstile. Guard will scan QR code or verify Code: <strong>${activePass.pass_code}</strong>.
            </div>

            <div class="signatures">
              <div class="sign-col">Parent Signature</div>
              <div class="sign-col">Teacher Verification</div>
              <div class="sign-col">Principal Approval</div>
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

  const isTeacherApproved = activePass && (
    activePass.status === 'pending_principal' ||
    activePass.status === 'approved' ||
    activePass.status === 'used' ||
    Boolean(activePass.teacher_verified_by)
  );

  const isPrincipalApproved = activePass && (
    activePass.status === 'approved' ||
    activePass.status === 'used' ||
    Boolean(activePass.principal_approved_by)
  );

  const isGateExited = activePass && activePass.status === 'used';
  const isRejected = activePass && activePass.status === 'rejected';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg rounded-3xl p-0 overflow-hidden border-border/80 shadow-2xl">
        <DialogHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <QrCode className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-black text-foreground">
                  Campus Digital Gate Pass
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Official 2-tier verified early exit workflow for {child.name}
                </DialogDescription>
              </div>
            </div>
            {activePass && (
              <Badge
                variant="outline"
                className={`font-mono text-xs font-bold rounded-full ${
                  activePass.status === 'approved'
                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                    : activePass.status === 'pending_principal'
                    ? 'bg-blue-500/10 text-blue-600 border-blue-500/30'
                    : activePass.status === 'pending_teacher' || activePass.status === 'pending'
                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                    : activePass.status === 'used'
                    ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30'
                    : 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                }`}
              >
                {activePass.status === 'pending_principal'
                  ? 'TEACHER VERIFIED'
                  : activePass.status === 'pending_teacher' || activePass.status === 'pending'
                  ? 'PENDING TEACHER'
                  : activePass.status.toUpperCase()}
              </Badge>
            )}
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full mt-3">
            <TabsList className="grid grid-cols-3 h-9 bg-background/80 p-1 rounded-xl border border-border/60">
              <TabsTrigger value="view" className="rounded-lg text-xs font-bold gap-1">
                <QrCode className="h-3.5 w-3.5" /> Track Pass
              </TabsTrigger>
              <TabsTrigger value="apply" className="rounded-lg text-xs font-bold gap-1">
                <PlusCircle className="h-3.5 w-3.5" /> Request Pass
              </TabsTrigger>
              <TabsTrigger value="history" className="rounded-lg text-xs font-bold gap-1">
                <History className="h-3.5 w-3.5" /> History ({passes.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </DialogHeader>

        <div className="p-5 max-h-[72vh] overflow-y-auto">
          {/* TAB 1: VIEW & TRACK ACTIVE PASS */}
          {activeTab === 'view' && (
            <div className="space-y-4">
              {isLoading ? (
                <div className="py-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-xs font-medium">Checking gate pass status...</p>
                </div>
              ) : !activePass ? (
                <div className="py-10 text-center rounded-2xl border border-dashed border-border/80 bg-muted/20 p-6 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto">
                    <QrCode className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">No Active Gate Pass Request</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                      Need to pick up {child.name} early today? Submit a request below to start the 2-step verification process.
                    </p>
                  </div>
                  <Button
                    onClick={() => setActiveTab('apply')}
                    className="rounded-xl text-xs font-bold bg-primary text-white"
                  >
                    <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Create Gate Pass Request
                  </Button>
                </div>
              ) : (
                <>
                  {/* Visual 5-Stage Step Tracker */}
                  <div className="p-4 rounded-2xl border border-border/70 bg-card/80 space-y-3 shadow-sm">
                    <div className="flex items-center justify-between pb-1 border-b border-border/40">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary" /> Live Approval Tracker
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        Code: <strong className="text-foreground font-bold">{activePass.pass_code}</strong>
                      </span>
                    </div>

                    <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/80">
                      {/* Step 1: Parent Request */}
                      <div className="relative flex items-start gap-2.5">
                        <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold shadow">
                          <Check className="h-3 w-3 stroke-[3]" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground">1. Request Submitted by Parent</p>
                          <p className="text-[11px] text-muted-foreground">
                            {format(new Date(activePass.created_at), 'hh:mm a, dd MMM')} • Expected: {activePass.expected_pickup_time}
                          </p>
                        </div>
                      </div>

                      {/* Step 2: Class Teacher Verification */}
                      <div className="relative flex items-start gap-2.5">
                        <div
                          className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shadow ${
                            isTeacherApproved
                              ? 'bg-emerald-500 text-white'
                              : isRejected
                              ? 'bg-rose-500 text-white'
                              : 'bg-amber-500 text-white animate-pulse'
                          }`}
                        >
                          {isTeacherApproved ? (
                            <Check className="h-3 w-3 stroke-[3]" />
                          ) : isRejected ? (
                            <XCircle className="h-3 w-3 stroke-[3]" />
                          ) : (
                            <Clock className="h-3 w-3" />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground">
                            2. Class Teacher Verification
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {activePass.teacher_verified_by ? (
                              <span className="text-emerald-600 font-semibold">
                                Verified by {activePass.teacher_verified_by}
                                {activePass.teacher_verified_at && ` at ${format(new Date(activePass.teacher_verified_at), 'hh:mm a')}`}
                              </span>
                            ) : isRejected ? (
                              <span className="text-rose-600 font-medium">Request disapproved</span>
                            ) : (
                              <span className="text-amber-600 font-medium">Awaiting Class Teacher sign-off...</span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Step 3: Principal / Admin Final Approval */}
                      <div className="relative flex items-start gap-2.5">
                        <div
                          className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shadow ${
                            isPrincipalApproved
                              ? 'bg-emerald-500 text-white'
                              : activePass.status === 'pending_principal'
                              ? 'bg-blue-500 text-white animate-pulse'
                              : isRejected
                              ? 'bg-muted text-muted-foreground'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {isPrincipalApproved ? (
                            <Check className="h-3 w-3 stroke-[3]" />
                          ) : activePass.status === 'pending_principal' ? (
                            <Clock className="h-3 w-3" />
                          ) : (
                            <Building2 className="h-3 w-3" />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground">
                            3. Principal / Admin Final Approval
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {activePass.principal_approved_by || activePass.approved_by ? (
                              <span className="text-emerald-600 font-semibold">
                                Authorized by {activePass.principal_approved_by || activePass.approved_by}
                                {(activePass.principal_approved_at || activePass.approved_at) &&
                                  ` at ${format(new Date(activePass.principal_approved_at || activePass.approved_at || ''), 'hh:mm a')}`}
                              </span>
                            ) : activePass.status === 'pending_principal' ? (
                              <span className="text-blue-600 font-semibold">Forwarded to Principal for final seal</span>
                            ) : isRejected ? (
                              <span className="text-muted-foreground">Not reached</span>
                            ) : (
                              <span className="text-muted-foreground">Pending Step 2 Teacher Verification</span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Step 4: Ready for Gate Guard Scan */}
                      <div className="relative flex items-start gap-2.5">
                        <div
                          className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shadow ${
                            isPrincipalApproved
                              ? 'bg-emerald-500 text-white ring-2 ring-emerald-300'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          <QrCode className="h-3 w-3" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground">
                            4. QR Code Activated & Ready at Gate
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {isPrincipalApproved ? (
                              <span className="text-emerald-600 font-bold">
                                Ready to present to Gate Security Guard Turnstile
                              </span>
                            ) : (
                              <span className="text-muted-foreground">QR code generated after Principal approval</span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Step 5: Physical Exit at Gate */}
                      {isGateExited && (
                        <div className="relative flex items-start gap-2.5">
                          <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shadow">
                            <Check className="h-3 w-3 stroke-[3]" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                              5. Student Exited Campus
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Exited at {activePass.exit_gate || 'Main Gate'} on{' '}
                              {format(new Date(activePass.exit_time || ''), 'hh:mm a')} • Guard: {activePass.security_guard_name || 'Duty Security'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* QR Code Section (Only shown when Principal Approved!) */}
                  {activePass.status === 'approved' && (
                    <div className="p-4 rounded-3xl bg-gradient-to-b from-emerald-500/10 to-transparent border border-emerald-500/30 flex flex-col items-center text-center space-y-3">
                      <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold uppercase">
                        <CheckCircle2 className="h-4 w-4" /> Official Pass Verified & Active
                      </div>

                      <div className="p-3.5 bg-white rounded-2xl shadow-xl border border-border/80 relative">
                        <QRCodeSVG value={qrPayload} size={165} level="H" />
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge className="font-mono text-sm font-black px-4 py-1.5 bg-primary text-white shadow-sm">
                          {activePass.pass_code}
                        </Badge>
                      </div>

                      <p className="text-xs text-muted-foreground max-w-xs">
                        Present this QR code or Code <strong className="text-foreground">{activePass.pass_code}</strong> to the Gate Security Guard to authorize physical departure.
                      </p>

                      <div className="flex gap-2 w-full pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const url = getGatePassWhatsAppUrl(activePass);
                            window.open(url, '_blank');
                          }}
                          className="flex-1 rounded-xl text-xs font-bold border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                        >
                          <Share2 className="h-3.5 w-3.5 mr-1.5" /> Share WhatsApp
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handlePrintPass}
                          className="flex-1 rounded-xl text-xs font-bold"
                        >
                          <Printer className="h-3.5 w-3.5 mr-1.5" /> Print Pass Slip
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Awaiting Review Placeholder if not yet approved */}
                  {activePass.status !== 'approved' && activePass.status !== 'used' && !isRejected && (
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs space-y-2">
                      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-bold">
                        <Clock className="h-4 w-4 animate-spin shrink-0" />
                        {activePass.status === 'pending_principal'
                          ? 'Teacher Verified • Awaiting Principal Authorization'
                          : 'Awaiting Class Teacher Review'}
                      </div>
                      <p className="text-[11px] text-amber-700/90 dark:text-amber-300/90">
                        {activePass.status === 'pending_principal'
                          ? `Class Teacher ${activePass.teacher_verified_by || ''} has verified this request. The QR code will be generated as soon as the Principal signs off.`
                          : `Your request has been delivered to ${child.class_teacher_name || 'Class Teacher'}. You will receive a notification and active QR code once approved.`}
                      </p>
                    </div>
                  )}

                  {/* Rejection notice */}
                  {isRejected && (
                    <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-xs space-y-1 text-rose-800 dark:text-rose-200">
                      <p className="font-bold flex items-center gap-1.5">
                        <ShieldAlert className="h-4 w-4 text-rose-600" /> Pass Request Disapproved
                      </p>
                      <p className="text-[11px]">
                        Reason: {activePass.rejection_reason || 'School authority disapproved early release.'}
                      </p>
                    </div>
                  )}

                  {/* Verified Details Card */}
                  <div className="p-3.5 rounded-2xl border border-border/70 bg-background/60 text-xs space-y-2">
                    <div className="flex justify-between items-center pb-2 border-b border-border/50">
                      <span className="text-muted-foreground font-medium">Student:</span>
                      <span className="font-bold text-foreground">{activePass.student_name} ({activePass.class_section})</span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-border/50">
                      <span className="text-muted-foreground font-medium">Authorized Pickup:</span>
                      <span className="font-bold text-foreground">
                        {activePass.pickup_person_name} ({activePass.pickup_person_relation})
                      </span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-border/50">
                      <span className="text-muted-foreground font-medium">Guardian Phone:</span>
                      <span className="font-mono font-bold text-foreground">{activePass.pickup_person_phone}</span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-border/50">
                      <span className="text-muted-foreground font-medium">ID Proof:</span>
                      <span className="font-medium text-foreground">{activePass.pickup_person_id_proof || 'Verified Parent ID'}</span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-border/50">
                      <span className="text-muted-foreground font-medium">Pickup Reason:</span>
                      <span className="font-medium text-foreground">{activePass.reason_text}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground font-medium">Requested Time:</span>
                      <span className="font-bold text-primary">{activePass.expected_pickup_time}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 2: APPLY FOR GATE PASS */}
          {activeTab === 'apply' && (
            <form onSubmit={handleApplyPass} className="space-y-4">
              <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 text-xs flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>
                  Gate pass follows a secure 2-tier authorization: <strong>1. Class Teacher Verification</strong> → <strong>2. Principal Approval</strong> → <strong>Instant QR Token</strong>.
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <Label className="text-xs font-bold">Child Name & Class</Label>
                  <Input
                    value={`${child.name} (${child.category || 'Class'}) - Admission No: ${child.employee_id}`}
                    disabled
                    className="mt-1 bg-muted/40 font-medium rounded-xl text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-bold">Pickup Person Name *</Label>
                    <Input
                      value={pickupPersonName}
                      onChange={(e) => setPickupPersonName(e.target.value)}
                      placeholder="e.g. Ramesh Panchal"
                      required
                      className="mt-1 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Relation to Student *</Label>
                    <select
                      value={pickupRelation}
                      onChange={(e) => setPickupRelation(e.target.value as any)}
                      className="mt-1 w-full h-10 px-3 rounded-xl border border-input bg-background text-xs font-medium focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="Father">Father</option>
                      <option value="Mother">Mother</option>
                      <option value="Guardian">Guardian</option>
                      <option value="Other">Authorized Relative</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-bold">Pickup Contact Phone *</Label>
                    <Input
                      value={pickupPersonPhone}
                      onChange={(e) => setPickupPersonPhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                      required
                      className="mt-1 rounded-xl text-xs font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Expected Departure Time *</Label>
                    <Input
                      value={pickupTime}
                      onChange={(e) => setPickupTime(e.target.value)}
                      placeholder="e.g. 11:30 AM"
                      required
                      className="mt-1 rounded-xl text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-bold">Guardian ID Proof *</Label>
                  <Input
                    value={pickupIdProof}
                    onChange={(e) => setPickupIdProof(e.target.value)}
                    placeholder="e.g. Aadhaar Card / Parent ID Card / Driving License"
                    required
                    className="mt-1 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold">Reason Category *</Label>
                  <select
                    value={reasonCategory}
                    onChange={(e) => setReasonCategory(e.target.value as any)}
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-input bg-background text-xs font-medium focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="medical">Medical Checkup / Illness</option>
                    <option value="family_emergency">Family Emergency / Urgent Personal</option>
                    <option value="appointment">Official Appointment</option>
                    <option value="school_event">School Event / Competition</option>
                    <option value="other">Other Valid Reason</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-bold">Detailed Reason *</Label>
                  <Input
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    placeholder="State reason for early pickup..."
                    required
                    className="mt-1 rounded-xl text-xs"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-2xl h-11 text-xs font-bold bg-primary text-white shadow-lg"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting Request...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" /> Submit Gate Pass for Teacher Review
                  </>
                )}
              </Button>
            </form>
          )}

          {/* TAB 3: HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              {passes.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-xs">
                  No previous gate pass history found.
                </div>
              ) : (
                passes.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-2xl border border-border/70 bg-card/60 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <Badge className="font-mono text-[11px] font-bold">
                        {p.pass_code}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold ${
                          p.status === 'approved'
                            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                            : p.status === 'used'
                            ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30'
                            : p.status === 'pending_principal'
                            ? 'bg-blue-500/10 text-blue-600 border-blue-500/30'
                            : p.status === 'pending_teacher' || p.status === 'pending'
                            ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                            : 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                        }`}
                      >
                        {p.status === 'pending_principal'
                          ? 'TEACHER VERIFIED'
                          : p.status === 'pending_teacher' || p.status === 'pending'
                          ? 'PENDING TEACHER'
                          : p.status.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="text-[11px] text-muted-foreground">
                      <span>Reason: {p.reason_text}</span>
                      <br />
                      <span>Pickup: {p.pickup_person_name} ({p.pickup_person_relation}) • {p.expected_pickup_time}</span>
                    </div>

                    <div className="text-[10px] text-muted-foreground flex justify-between pt-1 border-t border-border/40">
                      <span>{format(new Date(p.created_at), 'dd MMM yyyy, hh:mm a')}</span>
                      <span>
                        {p.status === 'used'
                          ? `Exited ${p.exit_gate || 'Gate'}`
                          : p.teacher_verified_by
                          ? `Verified by ${p.teacher_verified_by}`
                          : 'Pending'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <DialogFooter className="p-3 border-t border-border/60 bg-muted/20 sm:justify-between">
          <span className="text-[11px] text-muted-foreground self-center">
            🔐 Official KV Early Departure System
          </span>
          <Button variant="ghost" size="sm" onClick={onClose} className="rounded-xl text-xs">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
