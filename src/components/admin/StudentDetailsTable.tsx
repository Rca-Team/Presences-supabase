import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Search, Users, Phone, Heart, Bus, MapPin, User as UserIcon, IdCard, Download, Camera, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CLASSES, SECTIONS, getCategoryLabel } from '@/constants/schoolConfig';
import StudentIDCardGenerator from './StudentIDCardGenerator';
import StudentCSVImporter from './StudentCSVImporter';
import CaptureFaceDialog from './CaptureFaceDialog';
import { pickPreferredPhotoCandidate, resolveStudentPhotoUrl } from '@/utils/studentPhotoResolver';

interface StudentRow {
  id: string;
  user_id: string;
  name: string;
  employee_id: string;
  roll_number: string;
  category: string;
  blood_group: string;
  parent_name: string;
  parent_phone: string;
  parent_email: string;
  transport_mode: string;
  address: string;
  avatar_url: string;
}

const StudentDetailsTable: React.FC = () => {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [previewStudents, setPreviewStudents] = useState<StudentRow[] | null>(null);
  const [captureFor, setCaptureFor] = useState<StudentRow | null>(null);
  const [isRemovingDuplicates, setIsRemovingDuplicates] = useState(false);
  const { toast } = useToast();
  const refreshTimerRef = useRef<number | null>(null);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const [attendanceRes, descriptorsRes, profilesRes] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('id, user_id, student_id, student_name, status, device_info, category, image_url, timestamp')
          .eq('status', 'registered')      // only registered students, not present/late rows
          .order('timestamp', { ascending: false }),
        supabase
          .from('face_descriptors')
          .select('id, user_id, student_id, label, image_url, created_at')
          .not('image_url', 'is', null)
          .order('created_at', { ascending: true }),
        supabase
          .from('profiles')
          .select('user_id, avatar_url')
          .not('avatar_url', 'is', null),
      ]);

      if (attendanceRes.error) throw attendanceRes.error;
      if (descriptorsRes.error) throw descriptorsRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const data = attendanceRes.data || [];

      const profileImageByUserId = new Map<string, string>();
      (profilesRes.data || []).forEach((profile: any) => {
        if (profile?.user_id && profile?.avatar_url && !profileImageByUserId.has(profile.user_id)) {
          profileImageByUserId.set(profile.user_id, profile.avatar_url);
        }
      });

      const descriptorImageByUserId = new Map<string, string>();
      const descriptorImageByStudentKey = new Map<string, string>();
      (descriptorsRes.data || []).forEach((descriptor: any) => {
        const descriptorImg = descriptor?.image_url?.toString().trim();
        if (!descriptorImg) return;
        if (descriptor?.user_id && !descriptorImageByUserId.has(descriptor.user_id)) {
          descriptorImageByUserId.set(descriptor.user_id, descriptorImg);
        }
        const studentKey = (descriptor?.student_id || '').toString().trim();
        if (studentKey && !descriptorImageByStudentKey.has(studentKey)) {
          descriptorImageByStudentKey.set(studentKey, descriptorImg);
        }
      });

      const normKey = (v: unknown) => (v == null ? '' : String(v).trim().toLowerCase());
      const normName = (v: unknown) =>
        (v == null ? '' : String(v)).trim().toLowerCase().replace(/\s+/g, ' ');

      // Build cross-references so different rows for the same student collapse.
      const employeeToUserId = new Map<string, string>();
      (data || []).forEach((r: any) => {
        const deviceInfo = r.device_info || {};
        const meta = deviceInfo?.metadata || {};
        const empKey = normKey(
          meta?.employee_id || meta?.roll_number || deviceInfo?.employee_id || r.student_id,
        );
        if (r.user_id && empKey) employeeToUserId.set(empKey, r.user_id);
      });

      // Primary map keyed by a canonical identity. We also index by name and
      // user_id so subsequent rows (with or without an employee id) merge in.
      const map = new Map<string, StudentRow>();
      const byUserId = new Map<string, string>(); // user_id -> canonical key
      const byName = new Map<string, string>(); // normalized name -> canonical key

      const upsertStudent = (candidate: StudentRow, aliases: { userId?: string; name?: string }) => {
        const nameKey = normName(aliases.name || candidate.name);
        const uid = normKey(aliases.userId || candidate.user_id);

        // Try to find an existing canonical key for this student.
        let existingKey =
          (uid && byUserId.get(uid)) ||
          (nameKey && byName.get(nameKey)) ||
          (map.has(candidate.id) ? candidate.id : undefined);

        if (existingKey) {
          // Merge: fill blanks on the existing row, don't create a new one.
          const cur = map.get(existingKey)!;
          const merged: StudentRow = {
            ...cur,
            avatar_url: cur.avatar_url || candidate.avatar_url,
            employee_id: cur.employee_id !== '—' ? cur.employee_id : candidate.employee_id,
            roll_number: cur.roll_number !== '—' ? cur.roll_number : candidate.roll_number,
            blood_group: cur.blood_group !== '—' ? cur.blood_group : candidate.blood_group,
            parent_name: cur.parent_name !== '—' ? cur.parent_name : candidate.parent_name,
            parent_phone: cur.parent_phone !== '—' ? cur.parent_phone : candidate.parent_phone,
            parent_email: cur.parent_email !== '—' ? cur.parent_email : candidate.parent_email,
            transport_mode: cur.transport_mode !== '—' ? cur.transport_mode : candidate.transport_mode,
            address: cur.address !== '—' ? cur.address : candidate.address,
            user_id: cur.user_id || candidate.user_id,
          };
          map.set(existingKey, merged);
        } else {
          map.set(candidate.id, candidate);
          existingKey = candidate.id;
        }
        if (uid) byUserId.set(uid, existingKey);
        if (nameKey) byName.set(nameKey, existingKey);
      };

      (data || []).forEach((r: any) => {
        const deviceInfo = r.device_info || {};
        const meta = deviceInfo?.metadata || {};
        const name = meta?.name || deviceInfo?.name || r.student_name || '';
        if (!name || name === 'Unknown' || name === 'User') return;
        const empKey = normKey(
          meta?.employee_id || meta?.roll_number || deviceInfo?.employee_id || r.student_id,
        );
        const canonicalUserId = r.user_id || (empKey ? employeeToUserId.get(empKey) : null);
        const key = (empKey || normKey(canonicalUserId) || r.id) as string;

        const avatar = pickPreferredPhotoCandidate(
          canonicalUserId ? profileImageByUserId.get(canonicalUserId) : '',
          meta?.face_model?.id_card_photo_url,
          meta?.id_card_photo_url,
          canonicalUserId ? descriptorImageByUserId.get(canonicalUserId) : '',
          empKey ? descriptorImageByStudentKey.get(empKey) : '',
          r.image_url,
          meta.firebase_image_url,
          meta.image,
        );

        upsertStudent(
          {
            id: key,
            user_id: canonicalUserId || key,
            name,
            employee_id: meta.employee_id || deviceInfo.employee_id || '—',
            roll_number: meta.roll_number || meta.employee_id || deviceInfo.employee_id || '—',
            category: r.category || 'A',
            blood_group: meta.blood_group || '—',
            parent_name: meta.parent_name || '—',
            parent_phone: meta.parent_phone || meta.phone || '—',
            parent_email: meta.parent_email || '—',
            transport_mode: meta.transport_mode || '—',
            address: meta.address || '—',
            avatar_url: avatar,
          },
          { userId: canonicalUserId || undefined, name },
        );
      });

      // Include descriptor-only students too, so Student page matches ID-card coverage.
      (descriptorsRes.data || []).forEach((descriptor: any) => {
        const descriptorName = (descriptor?.label || '').toString().trim();
        if (!descriptorName || descriptorName === 'Unknown' || descriptorName === 'User') return;

        const descriptorUserId = normKey(descriptor?.user_id);
        const descriptorStudentId = normKey(descriptor?.student_id);
        const descriptorKey = descriptorStudentId || descriptorUserId || descriptor?.id;
        if (!descriptorKey) return;

        const avatar = pickPreferredPhotoCandidate(
          descriptorUserId ? profileImageByUserId.get(descriptorUserId) : '',
          descriptorUserId ? descriptorImageByUserId.get(descriptorUserId) : '',
          descriptorStudentId ? descriptorImageByStudentKey.get(descriptorStudentId) : '',
          descriptor?.image_url,
        );

        upsertStudent(
          {
            id: descriptorKey,
            user_id: descriptorUserId || descriptorKey,
            name: descriptorName,
            employee_id: descriptorStudentId || '—',
            roll_number: descriptorStudentId || '—',
            category: 'A',
            blood_group: '—',
            parent_name: '—',
            parent_phone: '—',
            parent_email: '—',
            transport_mode: '—',
            address: '—',
            avatar_url: avatar,
          },
          { userId: descriptorUserId || undefined, name: descriptorName },
        );
      });

      const resolvedRows = await Promise.all(
        Array.from(map.values()).map(async (student) => ({
          ...student,
          avatar_url: await resolveStudentPhotoUrl(student.avatar_url),
        })),
      );

      const sortedRows = resolvedRows.sort((a, b) => {
        const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        if (byName !== 0) return byName;
        return String(a.employee_id || '').localeCompare(String(b.employee_id || ''), undefined, { sensitivity: 'base' });
      });

      setRows(sortedRows);
    } catch (e) {
      console.error('Error loading students:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const removeDuplicateStudents = async () => {
    const confirmed = window.confirm(
      'Remove duplicate students? This keeps the newest record per student and deletes older duplicates from attendance_records and face_descriptors.'
    );
    if (!confirmed) return;
    setIsRemovingDuplicates(true);
    try {
      const [{ data: attRows, error: attErr }, { data: descRows, error: descErr }] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('id, user_id, student_id, student_name, device_info, timestamp')
          .eq('status', 'registered')
          .order('timestamp', { ascending: false }),
        supabase
          .from('face_descriptors')
          .select('id, user_id, student_id, label, created_at')
          .order('created_at', { ascending: false }),
      ]);
      if (attErr) throw attErr;
      if (descErr) throw descErr;

      const identityOf = (r: any): string => {
        const meta = r?.device_info?.metadata || {};
        const emp = (meta.employee_id || meta.roll_number || r?.device_info?.employee_id || r?.student_id || '').toString().trim().toLowerCase();
        if (emp) return `emp:${emp}`;
        const uid = (r?.user_id || '').toString().trim().toLowerCase();
        if (uid) return `uid:${uid}`;
        const name = (meta.name || r?.device_info?.name || r?.student_name || r?.label || '').toString().trim().toLowerCase();
        if (name) return `name:${name}`;
        return `id:${r?.id}`;
      };

      const collectDupes = (rows: any[]) => {
        const seen = new Set<string>();
        const dupes: string[] = [];
        for (const r of rows || []) {
          const k = identityOf(r);
          if (seen.has(k)) dupes.push(r.id);
          else seen.add(k);
        }
        return dupes;
      };

      const attDupes = collectDupes(attRows || []);
      const descDupes = collectDupes(descRows || []);

      const chunk = <T,>(arr: T[], n: number) => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
        return out;
      };

      let attDeleted = 0;
      for (const batch of chunk(attDupes, 100)) {
        const { error } = await supabase.from('attendance_records').delete().in('id', batch);
        if (!error) attDeleted += batch.length;
      }
      let descDeleted = 0;
      for (const batch of chunk(descDupes, 100)) {
        const { error } = await supabase.from('face_descriptors').delete().in('id', batch);
        if (!error) descDeleted += batch.length;
      }

      toast({
        title: 'Duplicates removed',
        description: `Deleted ${attDeleted} attendance rows and ${descDeleted} face descriptor rows.`,
      });
      await fetchStudents();
    } catch (e: any) {
      console.error('Remove duplicates failed:', e);
      toast({ title: 'Failed', description: e?.message || 'Could not remove duplicates.', variant: 'destructive' });
    } finally {
      setIsRemovingDuplicates(false);
    }
  };


  useEffect(() => {
    const queueRefresh = () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        fetchStudents();
        refreshTimerRef.current = null;
      }, 300);
    };

    const channel = supabase
      .channel('student-details-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'face_descriptors' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, queueRefresh)
      .subscribe();

    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const blob = `${r.name} ${r.employee_id} ${r.roll_number} ${r.parent_name} ${r.parent_phone}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (classFilter !== 'all' && !r.category.startsWith(classFilter)) return false;
      if (sectionFilter !== 'all' && !r.category.endsWith(sectionFilter)) return false;
      return true;
    });
  }, [rows, search, classFilter, sectionFilter]);

  if (previewStudents) {
    return (
      <div className="space-y-3">
        <Button variant="outline" size="sm" onClick={() => setPreviewStudents(null)}>
          ← Back to Student List
        </Button>
        <StudentIDCardGenerator students={previewStudents as any} />
      </div>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-r from-cyan-50 via-blue-50 to-violet-50 dark:from-cyan-950/30 dark:via-blue-950/30 dark:to-violet-950/30">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          All Students — Full Details & ID Cards
        </CardTitle>
        <CardDescription>
          Searchable directory of every registered student. Click a row to preview / download an ID card.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, roll, ID, parent or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {CLASSES.map((c) => (
                <SelectItem key={c} value={String(c)}>Class {c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sectionFilter} onValueChange={setSectionFilter}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Section" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sections</SelectItem>
              {SECTIONS.map((s) => (
                <SelectItem key={s} value={s}>Sec {s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="default"
            size="sm"
            disabled={filtered.length === 0}
            onClick={() => setPreviewStudents(filtered)}
          >
            <IdCard className="h-4 w-4 mr-1" />
            Generate ID Cards ({filtered.length})
          </Button>
          <StudentCSVImporter onImported={fetchStudents} />
          <Button
            variant="destructive"
            size="sm"
            onClick={removeDuplicateStudents}
            disabled={isRemovingDuplicates}
            title="Delete duplicate student rows, keeping newest"
          >
            {isRemovingDuplicates ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-1" />
            )}
            Remove Duplicates
          </Button>
        </div>


        {/* Stats */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1"><Users className="h-3 w-3" />{rows.length} Total</Badge>
          <Badge variant="secondary">{filtered.length} Shown</Badge>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>No students match the current filters.</p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Roll / ID</TableHead>
                  <TableHead>Blood</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Transport</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id} className="hover:bg-muted/40">
                    <TableCell>
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <Avatar className="h-10 w-10 border">
                          {s.avatar_url ? <AvatarImage src={s.avatar_url} alt={s.name} /> : null}
                          <AvatarFallback><UserIcon className="h-4 w-4" /></AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{s.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{s.parent_email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getCategoryLabel(s.category)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>Roll: <span className="font-semibold">{s.roll_number}</span></div>
                      <div className="text-xs text-muted-foreground">ID: {s.employee_id}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-red-600 border-red-300">
                        <Heart className="h-3 w-3 mr-1" />
                        {s.blood_group}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{s.parent_name}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {s.parent_phone}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="inline-flex items-center gap-1">
                        <Bus className="h-3 w-3" />
                        {s.transport_mode}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px]">
                      <span className="inline-flex items-start gap-1">
                        <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-2">{s.address}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCaptureFor(s)}
                          title="Capture face for this student"
                        >
                          <Camera className="h-3.5 w-3.5 mr-1" />
                          Capture Face
                        </Button>
                        <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPreviewStudents([s])}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        ID Card
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <CaptureFaceDialog
        open={!!captureFor}
        onOpenChange={(o) => { if (!o) setCaptureFor(null); }}
        student={captureFor as any}
        onSuccess={fetchStudents}
      />
    </Card>
  );
};

export default StudentDetailsTable;