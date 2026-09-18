import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Building2,
  Calendar,
  Sparkles,
  Printer,
  Share2,
  ArrowRight,
  Filter,
  Check,
  Loader2,
  DoorOpen,
  UserCheck,
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  GatePass,
  fetchAllGatePasses,
  approvePassByPrincipal,
  rejectGatePass,
  subscribeToGatePasses,
  getGatePassWhatsAppUrl,
  generateGatePassQrPayload,
} from '@/services/gatePassService';

export const GatePassManager: React.FC = () => {
  const { toast } = useToast();
  const [passes, setPasses] = useState<GatePass[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<'pending_principal' | 'approved' | 'used' | 'pending_teacher' | 'rejected' | 'all'>('pending_principal');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');

  // Approve Modal State
  const [approvingPass, setApprovingPass] = useState<GatePass | null>(null);
  const [principalNotes, setPrincipalNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Reject Modal State
  const [rejectingPass, setRejectingPass] = useState<GatePass | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Preview Pass State
  const [previewPass, setPreviewPass] = useState<GatePass | null>(null);

  const loadPasses = useCallback(async () => {
    setIsLoading(true);
    try {
      const all = await fetchAllGatePasses();
      setPasses(all);
    } catch (e) {
      console.warn('Could not load all gate passes:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPasses();
    const unsub = subscribeToGatePasses(() => {
      loadPasses();
    });
    return unsub;
  }, [loadPasses]);

  // Unique classes in passes
  const uniqueClasses = useMemo(() => {
    const set = new Set<string>();
    passes.forEach((p) => {
      if (p.class_section) set.add(p.class_section);
    });
    return Array.from(set).sort();
  }, [passes]);

  // Filtered passes
  const filteredPasses = useMemo(() => {
    let list = passes;

    if (filter === 'pending_principal') {
      list = list.filter((p) => p.status === 'pending_principal');
    } else if (filter === 'pending_teacher') {
      list = list.filter((p) => p.status === 'pending_teacher' || p.status === 'pending');
    } else if (filter !== 'all') {
      list = list.filter((p) => p.status === filter);
    }

    if (classFilter !== 'all') {
      list = list.filter((p) => p.class_section === classFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.student_name.toLowerCase().includes(q) ||
          p.student_id.toLowerCase().includes(q) ||
          p.pass_code.toLowerCase().includes(q) ||
          p.pickup_person_name.toLowerCase().includes(q) ||
          p.class_section.toLowerCase().includes(q)
      );
    }

    return list;
  }, [passes, filter, classFilter, search]);

  const counts = useMemo(() => {
    return {
      all: passes.length,
      pending_principal: passes.filter((p) => p.status === 'pending_principal').length,
      pending_teacher: passes.filter((p) => p.status === 'pending_teacher' || p.status === 'pending').length,
      approved: passes.filter((p) => p.status === 'approved').length,
      used: passes.filter((p) => p.status === 'used').length,
      rejected: passes.filter((p) => p.status === 'rejected').length,
    };
  }, [passes]);

  // Handle Principal Final Approval
  const handleConfirmApproval = async () => {
    if (!approvingPass) return;
    setIsProcessing(true);
    try {
      const updated = await approvePassByPrincipal(
        approvingPass.id,
        'Principal Office (Authorized)',
        principalNotes.trim() || 'Approved by Principal'
      );

      if (updated) {
        toast({
          title: 'Gate Pass Approved & QR Generated! 🎫',
          description: `Pass ${updated.pass_code} for ${updated.student_name} is now active for Gate Guard verification.`,
        });
        setApprovingPass(null);
        setPrincipalNotes('');
        await loadPasses();
        setFilter('approved');
        setPreviewPass(updated);
      } else {
        throw new Error('Approval failed');
      }
    } catch (err: any) {
      toast({
        title: 'Approval Failed',
        description: err?.message || 'Could not approve gate pass.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Reject
  const handleConfirmReject = async () => {
    if (!rejectingPass) return;
    setIsProcessing(true);
    try {
      const ok = await rejectGatePass(
        rejectingPass.id,
        'Principal Office',
        rejectionReason.trim() || 'Disapproved by Principal Office',
        'principal'
      );

      if (ok) {
        toast({
          title: 'Pass Disapproved ❌',
          description: `Pass ${rejectingPass.pass_code} marked as rejected.`,
        });
        setRejectingPass(null);
        setRejectionReason('');
        await loadPasses();
      } else {
        throw new Error('Reject failed');
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

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-purple-600/10 border border-border/80 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-foreground flex items-center gap-2">
              Principal & Admin Gate Pass Authority (Tier 2)
            </h2>
            <p className="text-xs text-muted-foreground">
              Final authorization stage: review class teacher verified requests, issue active QR security tokens, and monitor gate exits.
            </p>
          </div>
        </div>

        {/* Quick Stats Badges */}
        <div className="flex items-center gap-2">
          <div className="px-3.5 py-2 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-center">
            <p className="text-xs font-bold text-amber-600">Pending Review</p>
            <p className="text-base font-black text-amber-700 dark:text-amber-400">{counts.pending_principal}</p>
          </div>
          <div className="px-3.5 py-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center">
            <p className="text-xs font-bold text-emerald-600">Active QR Passes</p>
            <p className="text-base font-black text-emerald-700 dark:text-emerald-400">{counts.approved}</p>
          </div>
          <div className="px-3.5 py-2 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-center">
            <p className="text-xs font-bold text-indigo-600">Exited Today</p>
            <p className="text-base font-black text-indigo-700 dark:text-indigo-400">{counts.used}</p>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            { id: 'pending_principal', label: '1. Awaiting Principal Final Approval', count: counts.pending_principal, color: 'bg-amber-500' },
            { id: 'approved', label: '2. Active QR Passes', count: counts.approved, color: 'bg-emerald-500' },
            { id: 'used', label: '3. Exited Campus', count: counts.used, color: 'bg-indigo-500' },
            { id: 'pending_teacher', label: 'Awaiting Teacher (Tier 1)', count: counts.pending_teacher, color: 'bg-slate-500' },
            { id: 'rejected', label: 'Disapproved', count: counts.rejected, color: 'bg-rose-500' },
            { id: 'all', label: 'All Passes', count: counts.all, color: 'bg-muted-foreground' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 border ${
                filter === tab.id
                  ? 'bg-primary text-white border-primary shadow-sm'
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

        <div className="flex items-center gap-2">
          {uniqueClasses.length > 0 && (
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="h-8 px-2.5 rounded-xl border border-input bg-background text-xs font-semibold"
            >
              <option value="all">All Classes</option>
              {uniqueClasses.map((cls) => (
                <option key={cls} value={cls}>
                  Class {cls}
                </option>
              ))}
            </select>
          )}

          <div className="relative w-full sm:w-60">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student, pass code..."
              className="h-8 pl-8 text-xs rounded-xl bg-background"
            />
          </div>
        </div>
      </div>

      {/* Passes Grid */}
      {isLoading ? (
        <div className="py-20 text-center text-muted-foreground flex flex-col items-center gap-2">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-xs font-medium">Syncing school gate passes...</p>
        </div>
      ) : filteredPasses.length === 0 ? (
        <Card className="border-dashed border-border/80 bg-background/40">
          <CardContent className="p-12 text-center space-y-2">
            <Building2 className="h-10 w-10 text-muted-foreground/40 mx-auto" />
            <p className="text-sm font-bold text-foreground">No gate passes in this view</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {filter === 'pending_principal'
                ? 'All teacher-verified requests have been reviewed and approved.'
                : 'No gate passes matching your current filters.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPasses.map((pass) => {
            const isPendingPrincipal = pass.status === 'pending_principal';
            const isPendingTeacher = pass.status === 'pending_teacher' || pass.status === 'pending';
            const isApproved = pass.status === 'approved';
            const isUsed = pass.status === 'used';

            return (
              <Card
                key={pass.id}
                className={`rounded-3xl border transition-all ${
                  isPendingPrincipal
                    ? 'border-amber-500/50 bg-amber-500/5 shadow-md shadow-amber-500/5'
                    : isApproved
                    ? 'border-emerald-500/30 bg-card'
                    : isUsed
                    ? 'border-indigo-500/30 bg-card/60'
                    : 'border-border/80 bg-card/40'
                }`}
              >
                <CardContent className="p-4 space-y-3">
                  {/* Top Bar */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-black px-2.5 py-0.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
                        {pass.pass_code}
                      </span>
                      <span className="text-[11px] font-bold text-muted-foreground">Class {pass.class_section}</span>
                    </div>

                    <Badge
                      variant="outline"
                      className={`text-[10px] font-extrabold uppercase rounded-full ${
                        isApproved
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                          : isPendingPrincipal
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 animate-pulse'
                          : isPendingTeacher
                          ? 'bg-slate-500/10 text-slate-600 border-slate-500/30'
                          : isUsed
                          ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30'
                          : 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                      }`}
                    >
                      {isPendingPrincipal ? 'AWAITING PRINCIPAL SEAL' : pass.status.toUpperCase()}
                    </Badge>
                  </div>

                  {/* Student & Guardian Header */}
                  <div className="flex items-start gap-3">
                    <Avatar className="h-11 w-11 rounded-2xl border border-border shrink-0">
                      <AvatarImage src={pass.student_image_url} alt={pass.student_name} />
                      <AvatarFallback className="rounded-2xl font-black bg-primary/10 text-primary text-xs">
                        {pass.student_name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <h4 className="text-sm font-black text-foreground truncate">{pass.student_name}</h4>
                      <p className="text-xs text-muted-foreground">
                        Pickup: <strong className="text-foreground">{pass.pickup_person_name}</strong> ({pass.pickup_person_relation})
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        📱 {pass.pickup_person_phone} • Proof: {pass.pickup_person_id_proof || 'Verified'}
                      </p>
                    </div>
                  </div>

                  {/* Reason Box */}
                  <div className="text-xs bg-muted/40 p-2.5 rounded-2xl border border-border/60 space-y-1">
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>Reason: <strong className="text-foreground">{pass.reason_category}</strong></span>
                      <span className="font-bold text-primary">{pass.expected_pickup_time}</span>
                    </div>
                    <p className="text-foreground/90 font-medium text-[11px]">{pass.reason_text}</p>
                  </div>

                  {/* 2-Tier Traceability */}
                  <div className="text-[11px] space-y-1 bg-background/80 p-2.5 rounded-2xl border border-border/50">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Class Teacher:</span>
                      <span className={pass.teacher_verified_by ? 'text-emerald-600 font-bold' : 'text-amber-600 font-medium'}>
                        {pass.teacher_verified_by ? `✓ Verified by ${pass.teacher_verified_by}` : 'Pending Teacher Sign-off'}
                      </span>
                    </div>

                    {pass.teacher_notes && (
                      <p className="text-[10px] text-muted-foreground italic pl-2 border-l border-primary/30">
                        "{pass.teacher_notes}"
                      </p>
                    )}

                    {pass.principal_approved_by && (
                      <div className="flex items-center justify-between pt-1 border-t border-border/40">
                        <span className="text-muted-foreground">Principal Approval:</span>
                        <span className="text-emerald-600 font-bold">✓ {pass.principal_approved_by}</span>
                      </div>
                    )}

                    {isUsed && (
                      <div className="flex items-center justify-between pt-1 border-t border-border/40 text-indigo-600 font-bold">
                        <span>Departed Campus:</span>
                        <span>{format(new Date(pass.exit_time || ''), 'hh:mm a')} ({pass.exit_gate || 'Main Gate'})</span>
                      </div>
                    )}
                  </div>

                  {/* Tier 2 Principal Actions */}
                  {isPendingPrincipal && (
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => setApprovingPass(pass)}
                        disabled={isProcessing}
                        className="flex-1 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary/90 shadow-md gap-1.5"
                      >
                        <Check className="h-4 w-4" /> Approve & Issue QR Pass
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRejectingPass(pass)}
                        disabled={isProcessing}
                        className="rounded-xl text-xs font-bold text-rose-600 border-rose-500/30 hover:bg-rose-500/10"
                      >
                        <XCircle className="h-4 w-4" />
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
                        <QrCode className="h-3.5 w-3.5" /> View Active QR
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(getGatePassWhatsAppUrl(pass), '_blank')}
                        className="rounded-xl text-xs font-bold gap-1 border-emerald-500/30 text-emerald-600"
                      >
                        <Share2 className="h-3.5 w-3.5" /> WhatsApp
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Principal Approval Confirmation Modal */}
      <Dialog open={Boolean(approvingPass)} onOpenChange={(open) => !open && setApprovingPass(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl p-6">
          <DialogHeader>
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 mb-2">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <DialogTitle className="text-base font-black">
              Authorize Early Exit & Generate QR Pass
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Official seal for <strong>{approvingPass?.student_name}</strong> (Class {approvingPass?.class_section}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs my-2">
            <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/70 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pickup Guardian:</span>
                <span className="font-bold">{approvingPass?.pickup_person_name} ({approvingPass?.pickup_person_relation})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Class Teacher Verified:</span>
                <span className="font-bold text-emerald-600">{approvingPass?.teacher_verified_by || 'Yes'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected Departure:</span>
                <span className="font-bold text-primary">{approvingPass?.expected_pickup_time}</span>
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold">Principal Office Remarks (Optional)</Label>
              <Input
                value={principalNotes}
                onChange={(e) => setPrincipalNotes(e.target.value)}
                placeholder="e.g. Authorized by Principal Office. Valid for exit today."
                className="mt-1 rounded-xl text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setApprovingPass(null)}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmApproval}
              disabled={isProcessing}
              className="rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-md gap-1.5"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Authorize & Generate QR Token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Reason Dialog */}
      <Dialog open={Boolean(rejectingPass)} onOpenChange={(open) => !open && setRejectingPass(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-rose-600 flex items-center gap-2">
              <XCircle className="h-5 w-5" /> Decline Gate Pass Authorization
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Decline early release request for <strong>{rejectingPass?.student_name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs my-2">
            <div>
              <Label className="text-xs font-bold">Reason for Disapproval *</Label>
              <Input
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Unauthorized guardian / Incomplete documents"
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

      {/* Active QR Slip Modal */}
      <Dialog open={Boolean(previewPass)} onOpenChange={(open) => !open && setPreviewPass(null)}>
        <DialogContent className="sm:max-w-sm rounded-3xl p-6 text-center">
          <DialogHeader>
            <DialogTitle className="text-base font-black">Official Active QR Gate Pass</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Code: <strong className="font-mono text-foreground">{previewPass?.pass_code}</strong>
            </DialogDescription>
          </DialogHeader>

          {previewPass && (
            <div className="space-y-4 my-2">
              <div className="p-4 bg-white rounded-2xl border shadow-xl inline-block">
                <QRCodeSVG
                  value={previewPass.qr_payload || generateGatePassQrPayload(previewPass)}
                  size={190}
                  level="H"
                />
              </div>

              <div className="text-xs space-y-1">
                <p className="font-black text-foreground text-sm">{previewPass.student_name}</p>
                <p className="text-muted-foreground">Class {previewPass.class_section} • Pickup: {previewPass.pickup_person_name}</p>
                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[11px] font-bold">
                  ✓ Ready for Gate Guard Scanning
                </Badge>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(getGatePassWhatsAppUrl(previewPass), '_blank')}
                  className="flex-1 rounded-xl text-xs font-bold border-emerald-500/40 text-emerald-600"
                >
                  <Share2 className="h-3.5 w-3.5 mr-1" /> WhatsApp
                </Button>
                <Button
                  size="sm"
                  onClick={() => setPreviewPass(null)}
                  className="flex-1 rounded-xl text-xs font-bold bg-primary text-white"
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GatePassManager;
