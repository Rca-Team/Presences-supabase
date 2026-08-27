import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Activity,
  RefreshCw,
  Trash2,
  Users,
  Database,
  AlertTriangle,
  ClipboardList,
  Sparkles,
  CheckCircle2,
  Cpu,
} from 'lucide-react';
import { syncFromSupabase as syncDescriptorCache } from '@/services/face-recognition/DescriptorCacheService';
import FaceSampleDeduplicationModal from './FaceSampleDeduplicationModal';

type Diagnostics = {
  active_students: number;
  descriptor_rows: number;
  orphan_descriptors: number;
  attendance_records: number;
};

const isMissingRpc = (error: any, fnName: string) => {
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();
  return (
    code === 'PGRST202' ||
    message.includes(`could not find the function public.${fnName}`.toLowerCase()) ||
    details.includes(`public.${fnName}`.toLowerCase())
  );
};

const FaceSamplesDiagnosticsPanel: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [syncingCache, setSyncingCache] = useState(false);
  const [dedupOpen, setDedupOpen] = useState(false);
  const [data, setData] = useState<Diagnostics | null>(null);

  const fetchDiagnosticsFallback = async (): Promise<Diagnostics> => {
    const [descriptorsRes, attendanceRes] = await Promise.all([
      supabase
        .from('face_descriptors')
        .select('id, user_id', { count: 'exact' }),
      supabase
        .from('attendance_records')
        .select('id, user_id, student_id, student_name, device_info, status', { count: 'exact' })
        .neq('status', 'unauthorized'),
    ]);

    if (descriptorsRes.error) throw descriptorsRes.error;
    if (attendanceRes.error) throw attendanceRes.error;

    const attendanceRows = attendanceRes.data || [];
    const descriptorRows = descriptorsRes.data || [];
    const identitySet = new Set<string>();

    attendanceRows.forEach((r: any) => {
      const di = r.device_info || {};
      const m = di.metadata || {};
      const employee = (m.employee_id || m.roll_number || di.employee_id || r.student_id || '').toString().trim();
      const userId = (r.user_id || '').toString().trim();
      const name = (m.name || di.name || r.student_name || '').toString().trim();
      const key = employee || userId || (name && name !== 'Unknown' && name !== 'User' ? name : '');
      if (key) identitySet.add(key);
    });

    const knownUsers = new Set<string>();
    attendanceRows.forEach((r: any) => {
      const uid = (r.user_id || '').toString().trim();
      if (uid) knownUsers.add(uid);
    });

    const orphanDescriptors = descriptorRows.reduce((count: number, row: any) => {
      const uid = (row?.user_id || '').toString().trim();
      if (!uid) return count + 1;
      return knownUsers.has(uid) ? count : count + 1;
    }, 0);

    return {
      active_students: identitySet.size,
      descriptor_rows: Number(descriptorsRes.count ?? descriptorRows.length ?? 0),
      orphan_descriptors: orphanDescriptors,
      attendance_records: Number(attendanceRes.count ?? attendanceRows.length ?? 0),
    };
  };

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    try {
      const { data: rows, error } = await (supabase as any).rpc('face_samples_diagnostics');
      if (error) throw error;
      const row = Array.isArray(rows) ? rows[0] : rows;
      const next: Diagnostics = {
        active_students: Number(row?.active_students ?? 0),
        descriptor_rows: Number(row?.descriptor_rows ?? 0),
        orphan_descriptors: Number(row?.orphan_descriptors ?? 0),
        attendance_records: Number(row?.attendance_records ?? 0),
      };
      setData(next);
      return next;
    } catch (e: any) {
      if (isMissingRpc(e, 'face_samples_diagnostics')) {
        try {
          const next = await fetchDiagnosticsFallback();
          setData(next);
          return next;
        } catch (fallbackError: any) {
          console.error('Diagnostics fallback failed:', fallbackError);
          toast({
            title: 'Diagnostics Error',
            description: fallbackError.message || 'Could not load face diagnostics.',
            variant: 'destructive',
          });
          return null;
        }
      }

      console.error('Diagnostics failed:', e);
      toast({
        title: 'Diagnostics Error',
        description: e.message || 'Could not load face diagnostics.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const runCleanup = async () => {
    setCleaning(true);
    try {
      const { data: deleted, error } = await (supabase as any).rpc('cleanup_orphan_face_descriptors');
      if (error) throw error;
      const count = Number(deleted ?? 0);
      toast({
        title: 'Cleanup Completed',
        description: `Successfully pruned ${count} orphan face descriptor row${count === 1 ? '' : 's'}.`,
      });
      await fetchDiagnostics();
      await syncDescriptorCache().catch(() => {});
    } catch (e: any) {
      if (isMissingRpc(e, 'cleanup_orphan_face_descriptors')) {
        try {
          const { data: allDescriptors, error: fetchErr } = await supabase
            .from('face_descriptors')
            .select('id, user_id');
          if (fetchErr) throw fetchErr;

          const { data: allAttendance, error: attErr } = await supabase
            .from('attendance_records')
            .select('user_id')
            .neq('status', 'unauthorized');
          if (attErr) throw attErr;

          const knownUsers = new Set((allAttendance || []).map((r: any) => (r.user_id || '').toString().trim()).filter(Boolean));
          const orphanIds = (allDescriptors || [])
            .filter((d: any) => !d.user_id || !knownUsers.has((d.user_id || '').toString().trim()))
            .map((d: any) => d.id);

          if (orphanIds.length === 0) {
            toast({
              title: 'No Orphans Found',
              description: 'All face descriptors are actively mapped to valid student records.',
            });
            return;
          }

          const { error: delErr } = await supabase
            .from('face_descriptors')
            .delete()
            .in('id', orphanIds);
          if (delErr) throw delErr;

          toast({
            title: 'Cleanup Completed',
            description: `Successfully pruned ${orphanIds.length} orphan face descriptor row${orphanIds.length === 1 ? '' : 's'}.`,
          });
          await fetchDiagnostics();
          await syncDescriptorCache().catch(() => {});
          return;
        } catch (fbErr: any) {
          toast({
            title: 'Cleanup Failed',
            description: fbErr.message || 'Could not clean orphan descriptors.',
            variant: 'destructive',
          });
          return;
        }
      }

      toast({
        title: 'Cleanup Failed',
        description: e.message || 'Could not clean orphan descriptors.',
        variant: 'destructive',
      });
    } finally {
      setCleaning(false);
    }
  };

  const handleSyncModelCache = async () => {
    setSyncingCache(true);
    try {
      await syncDescriptorCache();
      toast({
        title: 'AI Cache Synchronized',
        description: 'Latest face descriptor embeddings successfully loaded into high-speed memory cache.',
      });
      await fetchDiagnostics();
    } catch (err: any) {
      toast({
        title: 'Sync Failed',
        description: err.message || 'Could not sync model index.',
        variant: 'destructive',
      });
    } finally {
      setSyncingCache(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, [fetchDiagnostics]);

  return (
    <>
      <Card className="rounded-3xl border border-primary/20 bg-gradient-to-r from-primary/10 via-card/70 to-accent/10 backdrop-blur-2xl shadow-xl overflow-hidden mb-6">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/15 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-primary">
                <Sparkles className="h-3 w-3" />
                AI Model & Diagnostics
              </div>
              <CardTitle className="text-xl md:text-2xl font-extrabold text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>
                Face Recognition Diagnostics
              </CardTitle>
              <CardDescription className="text-xs md:text-sm text-muted-foreground">
                Live statistics from Cloud database & active face recognition model weights.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDedupOpen(true)}
                className="rounded-2xl border-primary/40 bg-primary/10 gap-1.5 text-xs font-bold text-primary hover:bg-primary/20 shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                AI Storage Optimizer
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSyncModelCache}
                disabled={syncingCache}
                className="rounded-2xl border-border/70 bg-card/60 gap-1.5 text-xs font-semibold hover:bg-card/90"
              >
                <Cpu className={`w-3.5 h-3.5 text-primary ${syncingCache ? 'animate-spin' : ''}`} />
                {syncingCache ? 'Syncing...' : 'Sync AI Cache'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={fetchDiagnostics}
                disabled={loading}
                className="rounded-2xl border-border/70 bg-card/60 gap-1.5 text-xs font-semibold hover:bg-card/90"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={runCleanup}
                disabled={cleaning || (data?.orphan_descriptors ?? 0) === 0}
                className="rounded-2xl gap-1.5 text-xs font-bold"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {cleaning ? 'Cleaning...' : `Clean Orphans (${data?.orphan_descriptors ?? 0})`}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {loading || !data ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-md transition-all hover:border-primary/40">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase">
                  <Users className="w-3.5 h-3.5 text-primary" /> Active Students
                </div>
                <div className="text-2xl font-extrabold mt-2 text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>
                  {data.active_students.toLocaleString()}
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-md transition-all hover:border-primary/40">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase">
                  <Database className="w-3.5 h-3.5 text-emerald-500" /> Model Slots
                </div>
                <div className="text-2xl font-extrabold mt-2 text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>
                  {data.descriptor_rows.toLocaleString()}
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-md transition-all hover:border-primary/40">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase">
                  <ClipboardList className="w-3.5 h-3.5 text-blue-500" /> Attendance Records
                </div>
                <div className="text-2xl font-extrabold mt-2 text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>
                  {data.attendance_records.toLocaleString()}
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-md transition-all hover:border-primary/40">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Orphan Descriptors
                </div>
                <div className="text-2xl font-extrabold mt-2 flex items-center gap-2 text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>
                  {data.orphan_descriptors}
                  {data.orphan_descriptors > 0 ? (
                    <Badge variant="destructive" className="rounded-full text-[10px] uppercase font-bold">
                      Cleanable
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="rounded-full text-[10px] uppercase font-bold text-emerald-500 bg-emerald-500/10">
                      Clean
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <FaceSampleDeduplicationModal
        open={dedupOpen}
        onOpenChange={setDedupOpen}
        onCompleted={() => fetchDiagnostics()}
      />
    </>
  );
};

export default FaceSamplesDiagnosticsPanel;