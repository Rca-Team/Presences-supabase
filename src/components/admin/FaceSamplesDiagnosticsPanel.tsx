import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Activity, RefreshCw, Trash2, Users, Database, AlertTriangle, ClipboardList } from 'lucide-react';

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

  const fetchDiagnostics = async () => {
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
          toast({ title: 'Diagnostics failed', description: fallbackError.message || 'Could not load diagnostics.', variant: 'destructive' });
          return null;
        }
      }

      console.error('Diagnostics failed:', e);
      toast({ title: 'Diagnostics failed', description: e.message || 'Could not load diagnostics.', variant: 'destructive' });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const runCleanup = async () => {
    setCleaning(true);
    try {
      const { data: deleted, error } = await (supabase as any).rpc('cleanup_orphan_face_descriptors');
      if (error) throw error;
      const count = Number(deleted ?? 0);
      toast({ title: 'Cleanup complete', description: `Removed ${count} orphan descriptor row${count === 1 ? '' : 's'}.` });
      await fetchDiagnostics();
    } catch (e: any) {
      if (isMissingRpc(e, 'cleanup_orphan_face_descriptors')) {
        toast({
          title: 'Cleanup unavailable',
          description: 'This workspace is missing the cleanup function. Diagnostics still works in compatibility mode.',
          variant: 'destructive',
        });
        return;
      }
      console.error('Cleanup failed:', e);
      toast({ title: 'Cleanup failed', description: e.message || 'Could not run cleanup.', variant: 'destructive' });
    } finally {
      setCleaning(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="w-4 h-4 text-primary" /> Face Samples Diagnostics
        </CardTitle>
        <CardDescription>
          Live counts from Lovable Cloud. Orphans are auto-cleaned daily; run manually anytime.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading || !data ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border p-3 bg-card">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="w-3.5 h-3.5" /> Active Students</div>
              <div className="text-2xl font-semibold mt-1">{data.active_students}</div>
            </div>
            <div className="rounded-lg border p-3 bg-card">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Database className="w-3.5 h-3.5" /> Descriptor Rows</div>
              <div className="text-2xl font-semibold mt-1">{data.descriptor_rows}</div>
            </div>
            <div className="rounded-lg border p-3 bg-card">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><ClipboardList className="w-3.5 h-3.5" /> Attendance Records</div>
              <div className="text-2xl font-semibold mt-1">{data.attendance_records}</div>
            </div>
            <div className="rounded-lg border p-3 bg-card">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle className="w-3.5 h-3.5" /> Orphan Descriptors</div>
              <div className="text-2xl font-semibold mt-1 flex items-center gap-2">
                {data.orphan_descriptors}
                {data.orphan_descriptors > 0 && <Badge variant="destructive" className="text-[10px]">Skipped</Badge>}
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={fetchDiagnostics} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={runCleanup}
            disabled={cleaning || (data?.orphan_descriptors ?? 0) === 0}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" /> {cleaning ? 'Cleaning…' : 'Clean Orphans Now'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default FaceSamplesDiagnosticsPanel;