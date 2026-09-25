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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  GatePass,
  GatePassReason,
  fetchAllGatePasses,
  approvePassByPrincipal,
  rejectGatePass,
  createGatePass,
  subscribeToGatePasses,
  getGatePassWhatsAppUrl,
  generateGatePassQrPayload,
} from '@/services/gatePassService';

type FilterType = 'pending' | 'approved' | 'used' | 'rejected' | 'all';

export const GatePassManager: React.FC = () => {
  const { toast } = useToast();
  const [passes, setPasses] = useState<GatePass[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<FilterType>('pending');
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

  // Create New Pass Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    student_id: '',
    student_name: '',
    class_section: '8-A',
    pickup_person_name: '',
    pickup_person_phone: '',
    pickup_person_relation: 'Father',
    pickup_person_id_proof: 'Parent ID / Aadhaar Card',
    reason_category: 'medical' as GatePassReason,
    reason_text: 'Early departure approved by administration',
    expected_pickup_time: format(new Date(), 'hh:mm a'),
  });

  const loadPasses = useCallback(async (isInitial = false) => {
    if (isInitial) setIsLoading(true);
    try {
      const all = await fetchAllGatePasses();
      setPasses(all);
    } catch (e) {
      console.warn('Could not load all gate passes:', e);
    } finally {
      if (isInitial) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPasses(true);
    const unsub = subscribeToGatePasses(() => {
      loadPasses(false);
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

  // Counts
  const counts = useMemo(() => {
    const pendingTotal = passes.filter(
      (p) => p.status === 'pending_principal' || p.status === 'pending_teacher' || p.status === 'pending'
    ).length;
    return {
      all: passes.length,
      pending: pendingTotal,
      approved: passes.filter((p) => p.status === 'approved').length,
      used: passes.filter((p) => p.status === 'used').length,
      rejected: passes.filter((p) => p.status === 'rejected').length,
    };
  }, [passes]);

  // Filtered passes
  const filteredPasses = useMemo(() => {
    let list = passes;

    if (filter === 'pending') {
      list = list.filter(
        (p) => p.status === 'pending_principal' || p.status === 'pending_teacher' || p.status === 'pending'
      );
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

  // Handle Create Quick Gate Pass
  const handleCreatePass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.student_name.trim() || !createForm.pickup_person_name.trim()) {
      toast({ title: 'Missing details', description: 'Please fill student name and pickup guardian name.', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    try {
      const created = await createGatePass({
        student_id: createForm.student_id.trim() || `KV-${Math.floor(10000 + Math.random() * 90000)}`,
        student_name: createForm.student_name.trim().toUpperCase(),
        class_section: createForm.class_section.trim(),
        requested_by: 'admin',
        pickup_person_name: createForm.pickup_person_name.trim(),
        pickup_person_phone: createForm.pickup_person_phone.trim() || 'Not Provided',
        pickup_person_relation: createForm.pickup_person_relation,
        pickup_person_id_proof: createForm.pickup_person_id_proof,
        reason_category: createForm.reason_category,
        reason_text: createForm.reason_text.trim(),
        expected_pickup_time: createForm.expected_pickup_time,
        valid_until: 'End of School Day',
        status: 'approved',
        principal_approved_by: 'Principal Office (Direct Issue)',
        principal_approved_at: new Date().toISOString(),
        teacher_verified_by: 'Authorized Administrator',
        teacher_verified_at: new Date().toISOString(),
        bypass_daily_limit: true,
      });

      if (created) {
        toast({
          title: 'Gate Pass Created & Issued! 🎫',
          description: `Pass ${created.pass_code} for ${created.student_name} is active for security scanner.`,
        });
        setIsCreateOpen(false);
        await loadPasses();
        setFilter('approved');
        setPreviewPass(created);
      }
    } catch (err: any) {
      toast({ title: 'Creation failed', description: err.message || 'Could not issue pass', variant: 'destructive' });
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
              Principal & Admin Gate Pass Authority
              <Badge variant="outline" className="text-[10px] font-bold border-emerald-500/30 text-emerald-600 bg-emerald-500/10">
                Live Turnstile Sync Active
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground">
              Review parent requests, issue instant QR gate passes, and authorize physical turnstile exits in real-time.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
          <Button
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            className="rounded-xl text-xs font-bold gap-1.5 bg-primary text-white shadow-md shadow-primary/25"
          >
            <PlusCircle className="h-4 w-4" /> Issue Gate Pass
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => loadPasses(true)}
            disabled={isLoading}
            className="rounded-xl text-xs font-semibold gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-primary' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            { id: 'pending' as FilterType, label: 'Action Required (Pending)', count: counts.pending, color: 'bg-amber-500' },
            { id: 'approved' as FilterType, label: 'Active QR Passes', count: counts.approved, color: 'bg-emerald-500' },
            { id: 'used' as FilterType, label: 'Departed Today', count: counts.used, color: 'bg-indigo-500' },
            { id: 'rejected' as FilterType, label: 'Disapproved', count: counts.rejected, color: 'bg-rose-500' },
            { id: 'all' as FilterType, label: 'All History', count: counts.all, color: 'bg-slate-500' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              className={`h-9 px-3.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                filter === t.id
                  ? 'bg-primary text-white shadow-md shadow-primary/20 scale-[1.02]'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <span>{t.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                  filter === t.id ? 'bg-white/20 text-white' : 'bg-background text-muted-foreground border'
                }`}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search & Class Dropdown */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-60">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code, student, guardian..."
              className="h-9 pl-9 pr-3 rounded-2xl text-xs"
            />
          </div>

          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="h-9 w-28 rounded-2xl text-xs">
              <SelectValue placeholder="Class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {uniqueClasses.map((cls) => (
                <SelectItem key={cls} value={cls}>
                  Class {cls}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Gate Pass Cards List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Loading gate passes from cloud storage...</p>
        </div>
      ) : filteredPasses.length === 0 ? (
        <Card className="rounded-3xl border border-dashed border-border/80 p-12 text-center">
          <DoorOpen className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="text-base font-bold text-foreground">No Gate Passes in this view</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
            {filter === 'pending'
              ? 'No pending student early departure requests awaiting review.'
              : 'Try selecting a different filter or clearing your search keywords.'}
          </p>
          <div className="mt-4">
            <Button size="sm" onClick={() => setIsCreateOpen(true)} className="rounded-xl text-xs font-semibold">
              <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> Issue a Gate Pass
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPasses.map((pass) => {
            const isApproved = pass.status === 'approved';
            const isPending = pass.status === 'pending_principal' || pass.status === 'pending_teacher' || pass.status === 'pending';
            const isUsed = pass.status === 'used';
            const isRejected = pass.status === 'rejected';

            return (
              <Card
                key={pass.id}
                className={`rounded-3xl border transition-all duration-200 shadow-sm hover:shadow-md ${
                  isApproved
                    ? 'border-emerald-500/40 bg-emerald-500/[0.02]'
                    : isPending
                    ? 'border-amber-500/40 bg-amber-500/[0.02]'
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
                          : isPending
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 animate-pulse'
                          : isUsed
                          ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30'
                          : 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                      }`}
                    >
                      {isApproved
                        ? '✓ ACTIVE QR TOKEN'
                        : isPending
                        ? 'AWAITING APPROVAL'
                        : isUsed
                        ? 'EXITED CAMPUS'
                        : 'DISAPPROVED'}
                    </Badge>
                  </div>

                  {/* Student & Guardian Info */}
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
                        📱 {pass.pickup_person_phone} • {pass.pickup_person_id_proof || 'Verified Parent'}
                      </p>
                    </div>
                  </div>

                  {/* Reason & Time */}
                  <div className="text-xs bg-muted/40 p-2.5 rounded-2xl border border-border/60 space-y-1">
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>Reason: <strong className="text-foreground capitalize">{pass.reason_category}</strong></span>
                      <span className="font-bold text-primary">{pass.expected_pickup_time}</span>
                    </div>
                    <p className="text-foreground/90 font-medium text-[11px]">{pass.reason_text}</p>
                  </div>

                  {/* Authorizations Traceability */}
                  <div className="text-[11px] space-y-1 bg-background/80 p-2.5 rounded-2xl border border-border/50">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Teacher Review:</span>
                      <span className={pass.teacher_verified_by ? 'text-emerald-600 font-bold' : 'text-amber-600 font-medium'}>
                        {pass.teacher_verified_by ? `✓ ${pass.teacher_verified_by}` : 'Pending Teacher Sign-off'}
                      </span>
                    </div>

                    {pass.principal_approved_by && (
                      <div className="flex items-center justify-between pt-1 border-t border-border/40">
                        <span className="text-muted-foreground">Principal Seal:</span>
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

                  {/* Principal / Admin Action Buttons */}
                  {isPending && (
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

                  {isApproved && (
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPreviewPass(pass)}
                        className="flex-1 rounded-xl text-xs font-bold border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 gap-1.5"
                      >
                        <QrCode className="h-4 w-4" /> View Digital QR Token
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.open(getGatePassWhatsAppUrl(pass), '_blank')}
                        className="rounded-xl text-xs font-bold text-emerald-600 hover:bg-emerald-500/10 px-2"
                        title="Share pass slip via WhatsApp"
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Modal: Approve Pass by Principal ────────────────────────────────── */}
      <Dialog open={Boolean(approvingPass)} onOpenChange={(open) => !open && setApprovingPass(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Authorize Gate Pass Early Release
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Principal authorization for <strong>{approvingPass?.student_name}</strong> (Class {approvingPass?.class_section}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs my-2">
            <div className="p-3 bg-muted/40 rounded-2xl border space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Authorized Guardian:</span>
                <span className="font-bold text-foreground">
                  {approvingPass?.pickup_person_name} ({approvingPass?.pickup_person_relation})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contact Phone:</span>
                <span className="font-mono font-bold text-foreground">{approvingPass?.pickup_person_phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected Departure:</span>
                <span className="font-bold text-primary">{approvingPass?.expected_pickup_time}</span>
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold">Principal Authorizer Seal / Remarks</Label>
              <Input
                value={principalNotes}
                onChange={(e) => setPrincipalNotes(e.target.value)}
                placeholder="e.g. Permission granted for medical appointment"
                className="mt-1 rounded-xl text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" size="sm" onClick={() => setApprovingPass(null)} className="rounded-xl text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmApproval}
              disabled={isProcessing}
              className="rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary/90"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
              Sign & Activate QR Security Token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Reject Pass ────────────────────────────────────────────── */}
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
            <Button variant="outline" size="sm" onClick={() => setRejectingPass(null)} className="rounded-xl text-xs">
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

      {/* ── Modal: Active QR Token Slip ────────────────────────────────────── */}
      <Dialog open={Boolean(previewPass)} onOpenChange={(open) => !open && setPreviewPass(null)}>
        <DialogContent className="sm:max-w-sm rounded-3xl p-6 text-center">
          <DialogHeader>
            <DialogTitle className="text-base font-black">Official Active QR Gate Pass</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Verification Code: <strong className="font-mono text-foreground">{previewPass?.pass_code}</strong>
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
                  ✓ Ready for Gate Guard Turnstile Scan
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

      {/* ── Modal: Create / Issue New Gate Pass ─────────────────────────────── */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-primary" />
              Issue Official Campus Gate Pass
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Directly authorize an early departure slip for a student. Generates active QR token immediately.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreatePass} className="space-y-3 text-xs my-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Student Name *</Label>
                <Input
                  value={createForm.student_name}
                  onChange={(e) => setCreateForm({ ...createForm, student_name: e.target.value })}
                  placeholder="e.g. AARAV SHARMA"
                  className="h-9 rounded-xl text-xs uppercase"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Class & Section</Label>
                <Input
                  value={createForm.class_section}
                  onChange={(e) => setCreateForm({ ...createForm, class_section: e.target.value })}
                  placeholder="e.g. 8-A"
                  className="h-9 rounded-xl text-xs uppercase"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Pickup Guardian *</Label>
                <Input
                  value={createForm.pickup_person_name}
                  onChange={(e) => setCreateForm({ ...createForm, pickup_person_name: e.target.value })}
                  placeholder="Guardian Name"
                  className="h-9 rounded-xl text-xs"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Relationship</Label>
                <Select
                  value={createForm.pickup_person_relation}
                  onValueChange={(val) => setCreateForm({ ...createForm, pickup_person_relation: val })}
                >
                  <SelectTrigger className="h-9 rounded-xl text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Father">Father</SelectItem>
                    <SelectItem value="Mother">Mother</SelectItem>
                    <SelectItem value="Guardian">Guardian</SelectItem>
                    <SelectItem value="Other">Other Authorized Person</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Contact Mobile</Label>
                <Input
                  value={createForm.pickup_person_phone}
                  onChange={(e) => setCreateForm({ ...createForm, pickup_person_phone: e.target.value })}
                  placeholder="+919876543210"
                  className="h-9 rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Departure Time</Label>
                <Input
                  value={createForm.expected_pickup_time}
                  onChange={(e) => setCreateForm({ ...createForm, expected_pickup_time: e.target.value })}
                  placeholder="e.g. 11:30 AM"
                  className="h-9 rounded-xl text-xs font-bold"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Reason for Early Departure</Label>
              <Input
                value={createForm.reason_text}
                onChange={(e) => setCreateForm({ ...createForm, reason_text: e.target.value })}
                placeholder="e.g. Doctor appointment / Family emergency"
                className="h-9 rounded-xl text-xs"
                required
              />
            </div>

            <DialogFooter className="gap-2 sm:justify-between pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsCreateOpen(false)} className="rounded-xl text-xs">
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isProcessing}
                className="rounded-xl text-xs font-bold bg-primary text-white"
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <QrCode className="h-4 w-4 mr-1.5" />}
                Issue Active Pass
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GatePassManager;
