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
} from 'lucide-react';
import { ChildProfile } from '@/hooks/useParentPortal';
import { format } from 'date-fns';
import {
  GatePass,
  GatePassReason,
  createGatePass,
  fetchStudentGatePasses,
  subscribeToGatePasses,
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
          (p) => p.status === 'approved' || p.status === 'pending'
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

  // Find the primary active pass (approved first, or pending, or most recent)
  const activePass = useMemo(() => {
    if (passes.length === 0) return null;
    const approved = passes.find((p) => p.status === 'approved');
    if (approved) return approved;
    const pending = passes.find((p) => p.status === 'pending');
    if (pending) return pending;
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
        reason_category: reasonCategory,
        reason_text: reasonText.trim(),
        expected_pickup_time: pickupTime,
        valid_until: 'End of School Day',
      });

      if (created) {
        toast({
          title: 'Gate Pass Requested ✅',
          description: `Pass ${created.pass_code} submitted to Class Teacher for instant authorization.`,
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
    return JSON.stringify({
      passId: activePass.id,
      passCode: activePass.pass_code,
      studentId: activePass.student_id,
      studentName: activePass.student_name,
      classSection: activePass.class_section,
      pickupPerson: activePass.pickup_person_name,
      pickupPhone: activePass.pickup_person_phone,
      relation: activePass.pickup_person_relation,
      status: activePass.status,
      approvedBy: activePass.approved_by || 'Pending Review',
      reason: activePass.reason_text,
      time: activePass.expected_pickup_time,
      school: 'PM Shri KV NFC Vigyan Vihar',
      issuedAt: activePass.created_at,
    });
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
              <div class="title">Official Digital Early Exit Gate Pass</div>
              <div class="pass-badge ${isApproved ? 'approved' : isUsed ? 'used' : 'pending'}">
                ${activePass.status.toUpperCase()} • CODE: ${activePass.pass_code}
              </div>
            </div>

            <div class="info-table">
              <div class="row"><strong>Student Name:</strong> <span>${activePass.student_name}</span></div>
              <div class="row"><strong>Class & Section:</strong> <span>${activePass.class_section}</span></div>
              <div class="row"><strong>Admission / Student ID:</strong> <span>${activePass.student_id}</span></div>
              <div class="row"><strong>Authorized Pickup:</strong> <span>${activePass.pickup_person_name} (${activePass.pickup_person_relation})</span></div>
              <div class="row"><strong>Guardian Phone:</strong> <span>${activePass.pickup_person_phone}</span></div>
              <div class="row"><strong>Pickup Reason:</strong> <span>${activePass.reason_text}</span></div>
              <div class="row"><strong>Expected Time:</strong> <span>${activePass.expected_pickup_time}</span></div>
              <div class="row"><strong>Authorized By:</strong> <span>${activePass.approved_by || 'Class Teacher In-Charge'}</span></div>
              ${activePass.exit_time ? `<div class="row"><strong>Exit Recorded:</strong> <span>${format(new Date(activePass.exit_time), 'hh:mm a, dd MMM yyyy')} (${activePass.exit_gate || 'Gate 1'})</span></div>` : ''}
            </div>

            <div class="guard-box">
              🛡️ Present this pass at Gate Security Guard Turnstile. Guard will scan QR code or verify Code: <strong>${activePass.pass_code}</strong>.
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
                  Official early pickup and gate exit manager for {child.name}
                </DialogDescription>
              </div>
            </div>
            {activePass && (
              <Badge
                variant="outline"
                className={`font-mono text-xs font-bold rounded-full ${
                  activePass.status === 'approved'
                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                    : activePass.status === 'pending'
                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                    : activePass.status === 'used'
                    ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30'
                    : 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                }`}
              >
                {activePass.status.toUpperCase()}
              </Badge>
            )}
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full mt-3">
            <TabsList className="grid grid-cols-3 h-9 bg-background/80 p-1 rounded-xl border border-border/60">
              <TabsTrigger value="view" className="rounded-lg text-xs font-bold gap-1">
                <QrCode className="h-3.5 w-3.5" /> Active Pass
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
          {/* TAB 1: VIEW ACTIVE PASS */}
          {activeTab === 'view' && (
            <div className="space-y-4">
              {isLoading ? (
                <div className="py-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-xs font-medium">Checking active gate passes...</p>
                </div>
              ) : !activePass ? (
                <div className="py-10 text-center rounded-2xl border border-dashed border-border/80 bg-muted/20 p-6 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto">
                    <QrCode className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">No Active Gate Pass Found</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                      Need to pick up {child.name} early today? Submit an early exit request for instant class teacher authorization.
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
                  {/* Status Banner */}
                  <div
                    className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
                      activePass.status === 'approved'
                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300'
                        : activePass.status === 'pending'
                        ? 'bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-300'
                        : activePass.status === 'used'
                        ? 'bg-indigo-500/10 border-indigo-500/25 text-indigo-700 dark:text-indigo-300'
                        : 'bg-rose-500/10 border-rose-500/25 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {activePass.status === 'approved' ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : activePass.status === 'pending' ? (
                        <Clock className="h-4 w-4 shrink-0 text-amber-600 animate-pulse" />
                      ) : activePass.status === 'used' ? (
                        <ShieldCheck className="h-4 w-4 shrink-0 text-indigo-600" />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0 text-rose-600" />
                      )}
                      <div>
                        <p className="font-bold">
                          {activePass.status === 'approved'
                            ? 'Authorized & Ready at Gate'
                            : activePass.status === 'pending'
                            ? 'Pending Class Teacher Approval'
                            : activePass.status === 'used'
                            ? 'Student Exit Completed'
                            : 'Pass Disapproved'}
                        </p>
                        <p className="text-[11px] opacity-90">
                          {activePass.status === 'approved'
                            ? `Approved by ${activePass.approved_by || 'Class Teacher'}. Valid for exit today.`
                            : activePass.status === 'pending'
                            ? `Waiting for ${child.class_teacher_name || 'Class Teacher'} to sign off.`
                            : activePass.status === 'used'
                            ? `Exited ${activePass.exit_gate || 'Main Gate'} at ${format(new Date(activePass.exit_time || ''), 'hh:mm a')}.`
                            : activePass.rejection_reason || 'Please contact school administration.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* QR Code Container */}
                  <div className="p-4 rounded-3xl bg-muted/40 border border-border/80 flex flex-col items-center text-center">
                    <div className="p-3 bg-white rounded-2xl shadow-md border border-border/60">
                      <QRCodeSVG value={qrPayload} size={155} level="H" />
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <Badge className="font-mono text-xs font-black px-3 py-1 bg-primary/10 text-primary border-primary/30">
                        PASS CODE: {activePass.pass_code}
                      </Badge>
                      <Badge variant="outline" className="text-[11px] text-muted-foreground font-mono">
                        ID: {activePass.student_id}
                      </Badge>
                    </div>

                    <p className="text-[11px] text-muted-foreground mt-1.5 max-w-xs">
                      Present this QR code or Code <strong className="text-foreground">{activePass.pass_code}</strong> to the Gate Security Guard Turnstile.
                    </p>
                  </div>

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
                      <span className="text-muted-foreground font-medium">Guardian Contact:</span>
                      <span className="font-mono font-bold text-foreground">{activePass.pickup_person_phone}</span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-border/50">
                      <span className="text-muted-foreground font-medium">Pickup Reason:</span>
                      <span className="font-medium text-foreground">{activePass.reason_text}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground font-medium">Requested Pickup Time:</span>
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
                  Gate pass requests are verified by <strong>{child.class_teacher_name || 'Class Teacher'}</strong> and Gate Security prior to student release.
                </span>
              </div>

              {/* Reason Category Pills */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Reason Category</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'medical', label: '🏥 Medical / Sick', desc: 'Illness or doctor' },
                    { id: 'family_emergency', label: '🚨 Family Emergency', desc: 'Urgent family pickup' },
                    { id: 'appointment', label: '📅 Scheduled Appointment', desc: 'Pre-planned checkup' },
                    { id: 'school_event', label: '🏆 Official Event', desc: 'Inter-school activity' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setReasonCategory(cat.id as GatePassReason)}
                      className={`p-2 rounded-xl text-left border transition-all ${
                        reasonCategory === cat.id
                          ? 'border-primary bg-primary/10 text-foreground font-bold shadow-xs'
                          : 'border-border/70 bg-background/60 text-muted-foreground hover:bg-muted/40'
                      }`}
                    >
                      <div className="text-xs">{cat.label}</div>
                      <div className="text-[10px] text-muted-foreground font-normal">{cat.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Pickup Person Name & Relation */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Authorized Pickup Person</Label>
                  <Input
                    value={pickupPersonName}
                    onChange={(e) => setPickupPersonName(e.target.value)}
                    className="h-9 text-xs rounded-xl bg-background"
                    placeholder="e.g. Sachin Kumar"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Relation</Label>
                  <select
                    value={pickupRelation}
                    onChange={(e) => setPickupRelation(e.target.value as any)}
                    className="h-9 w-full text-xs rounded-xl bg-background border border-input px-3"
                  >
                    <option value="Father">Father</option>
                    <option value="Mother">Mother</option>
                    <option value="Guardian">Legal Guardian</option>
                    <option value="Other">Authorized Relative</option>
                  </select>
                </div>
              </div>

              {/* Guardian Phone & Expected Time */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Guardian Phone Number</Label>
                  <Input
                    value={pickupPersonPhone}
                    onChange={(e) => setPickupPersonPhone(e.target.value)}
                    className="h-9 text-xs rounded-xl bg-background font-mono"
                    placeholder="+91 98765 43210"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Expected Pickup Time</Label>
                  <Input
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                    className="h-9 text-xs rounded-xl bg-background"
                    placeholder="e.g. 10:30 AM"
                    required
                  />
                </div>
              </div>

              {/* Detailed Reason */}
              <div className="space-y-1">
                <Label className="text-xs font-bold">Detailed Reason for Early Departure</Label>
                <Input
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  className="h-9 text-xs rounded-xl bg-background"
                  placeholder="e.g. Severe fever, doctor consultation scheduled at 11:00 AM"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-10 rounded-xl text-xs font-bold bg-primary text-white shadow-md shadow-primary/20 gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Submitting to Class Teacher...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" /> Submit Gate Pass Application
                  </>
                )}
              </Button>
            </form>
          )}

          {/* TAB 3: PASS HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-2.5">
              {passes.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No historical gate passes recorded.
                </div>
              ) : (
                passes.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-2xl border border-border/70 bg-background/60 hover:bg-muted/30 transition-all text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-foreground flex items-center gap-1.5">
                        <QrCode className="h-3.5 w-3.5 text-primary" /> {item.pass_code}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold rounded-full ${
                          item.status === 'approved'
                            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                            : item.status === 'used'
                            ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30'
                            : item.status === 'pending'
                            ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                            : 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                        }`}
                      >
                        {item.status.toUpperCase()}
                      </Badge>
                    </div>

                    <p className="text-foreground font-medium">{item.reason_text}</p>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                      <span>Pickup: {item.pickup_person_name} ({item.pickup_person_relation})</span>
                      <span>{format(new Date(item.created_at), 'dd MMM yyyy, hh:mm a')}</span>
                    </div>

                    {item.exit_time && (
                      <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 px-2 py-0.5 rounded-lg">
                        Exited {item.exit_gate || 'Main Gate'} at {format(new Date(item.exit_time), 'hh:mm a')}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t border-border/60 bg-muted/20 flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl text-xs flex-1">
            Close
          </Button>
          {activePass && activeTab === 'view' && (
            <Button
              onClick={handlePrintPass}
              className="rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white flex-1 shadow-md shadow-blue-500/25 border-0"
            >
              <Printer className="mr-1.5 h-4 w-4 text-white" /> Print Official Slip
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
