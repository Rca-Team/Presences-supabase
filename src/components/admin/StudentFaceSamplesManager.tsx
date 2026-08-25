import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Search, User, Scissors, RefreshCw, ImageIcon, Trash2, ArrowRightLeft, ArrowLeft, UserX, Download, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import JSZip from 'jszip';
import ImageCropper from './ImageCropper';
import { uploadImage } from '@/services/face-recognition/StorageService';
import {
  syncFromSupabase as syncDescriptorCache,
  cacheDescriptor,
  removeFromCache,
} from '@/services/face-recognition/DescriptorCacheService';

type FaceSample = {
  id: string;
  user_id: string;
  label: string | null;
  image_url: string | null;
  created_at: string;
  source: 'descriptor_registration' | 'record_registration' | 'recognition_attendance' | 'recognition_gate';
  source_table: 'face_descriptors' | 'attendance_records';
  confidence_score?: number | null;
  status?: string | null;
};

type StudentGroup = {
  userId: string;
  name: string;
  employeeId: string;
  samples: FaceSample[];
};

type FaceSamplesZipManifest = {
  version: number;
  exportedAt: string;
  app: string;
  students: Array<{
    userId: string;
    employeeId: string;
    name: string;
    details: {
      class: string | null;
      section: string | null;
      rollNumber: string | null;
      category: string | null;
      bloodGroup: string | null;
      parentName: string | null;
      parentPhone: string | null;
      parentEmail: string | null;
      address: string | null;
      transportMode: string | null;
      phone: string | null;
      email: string | null;
      profileName: string | null;
      username: string | null;
      metadata: Record<string, any>;
    };
    sampleCount: number;
    samples: Array<{
      path: string;
      source: FaceSample['source'];
      createdAt: string;
      status?: string | null;
    }>;
  }>;
};

const EMPTY_STUDENT_DETAILS: FaceSamplesZipManifest['students'][number]['details'] = {
  class: null,
  section: null,
  rollNumber: null,
  category: null,
  bloodGroup: null,
  parentName: null,
  parentPhone: null,
  parentEmail: null,
  address: null,
  transportMode: null,
  phone: null,
  email: null,
  profileName: null,
  username: null,
  metadata: {},
};

const normalizeManifestStudent = (
  student: any,
  index: number
): FaceSamplesZipManifest['students'][number] => {
  const rawSamples = Array.isArray(student?.samples) ? student.samples : [];
  const normalizedSamples = rawSamples
    .map((sample: any) => {
      const path = toOptionalText(sample?.path || sample?.filePath || sample?.imagePath || sample?.image_url);
      if (!path) return null;
      return {
        path,
        source: (sample?.source || 'record_registration') as FaceSample['source'],
        createdAt: toOptionalText(sample?.createdAt || sample?.created_at) || new Date().toISOString(),
        status: toOptionalText(sample?.status),
      };
    })
    .filter(Boolean) as FaceSamplesZipManifest['students'][number]['samples'];

  const details = student?.details && typeof student.details === 'object' ? student.details : {};

  return {
    userId: toOptionalText(student?.userId || student?.user_id) || '',
    employeeId: toOptionalText(student?.employeeId || student?.studentId || student?.student_id) || '',
    name: toOptionalText(student?.name || student?.student_name) || `Student ${index + 1}`,
    details: {
      class: toOptionalText(details.class),
      section: toOptionalText(details.section),
      rollNumber: toOptionalText(details.rollNumber || details.roll_number),
      category: toOptionalText(details.category),
      bloodGroup: toOptionalText(details.bloodGroup || details.blood_group),
      parentName: toOptionalText(details.parentName || details.parent_name),
      parentPhone: toOptionalText(details.parentPhone || details.parent_phone),
      parentEmail: toOptionalText(details.parentEmail || details.parent_email),
      address: toOptionalText(details.address),
      transportMode: toOptionalText(details.transportMode || details.transport_mode),
      phone: toOptionalText(details.phone),
      email: toOptionalText(details.email),
      profileName: toOptionalText(details.profileName || details.profile_name),
      username: toOptionalText(details.username),
      metadata: details.metadata && typeof details.metadata === 'object' ? details.metadata : {},
    },
    sampleCount: normalizedSamples.length,
    samples: normalizedSamples,
  };
};

type ImportCandidate = {
  key: string;
  student: FaceSamplesZipManifest['students'][number];
  isExisting: boolean;
  existingStudentId: string | null;
  existingUserId: string | null;
  existingName: string | null;
};

type OperationProgress = {
  label: string;
  current: number;
  total: number;
};

type ImportSummary = {
  zipStudents: number;
  selectedStudents: number;
  importedStudents: number;
  skippedExisting: number;
  failedStudents: number;
  importedImages: number;
  failedImages: number;
};

const isSlot = (s: FaceSample) => s.source_table === 'face_descriptors';
const FACE_SAMPLE_BUCKETS = ['face-images', 'attendance-training-faces', 'student-registration-faces'] as const;

const slugifyPart = (value: string) =>
  (value || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'unknown';

const extensionFromMime = (mimeType: string) => {
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('webp')) return '.webp';
  if (mimeType.includes('bmp')) return '.bmp';
  if (mimeType.includes('gif')) return '.gif';
  return '.jpg';
};

const mimeTypeFromPath = (filePath: string | null | undefined): string | null => {
  const ext = (filePath || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
  if (!ext) return null;
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'bmp') return 'image/bmp';
  if (ext === 'svg') return 'image/svg+xml';
  return null;
};

const extensionFromPath = (filePath: string | null | undefined): string | null => {
  const ext = (filePath || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
  if (!ext) return null;
  return `.${ext}`;
};

const normalizeZipPath = (value: string) =>
  value
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .trim();

const resolveZipFileEntry = (zip: JSZip, samplePath: string): JSZip.JSZipObject | null => {
  const normalized = normalizeZipPath(samplePath);
  if (!normalized) return null;

  const direct = zip.file(normalized);
  if (direct) return direct;

  const withoutStudentsPrefix = normalized.replace(/^students\//i, '');
  if (withoutStudentsPrefix !== normalized) {
    const withoutPrefixFile = zip.file(withoutStudentsPrefix);
    if (withoutPrefixFile) return withoutPrefixFile;
  }

  const targetTail = normalized.split('/').pop()?.toLowerCase();
  if (!targetTail) return null;

  const allFiles = Object.values(zip.files).filter((f) => !f.dir);
  const byExactTail = allFiles.find((f) => normalizeZipPath(f.name).toLowerCase().endsWith(`/${targetTail}`) || normalizeZipPath(f.name).toLowerCase() === targetTail);
  if (byExactTail) return byExactTail;

  return null;
};

const toOptionalText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
};

const parseStoragePathFromUrl = (value: string, bucket: string): string | null => {
  const cleaned = value.trim();
  const pattern = new RegExp(`/storage/v1/object/(?:public|sign)/${bucket}/([^?]+)`);
  const match = cleaned.match(pattern);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

const toPersistentImageReference = (rawValue: string | null | undefined): string | null => {
  if (!rawValue) return null;
  const value = rawValue.trim();
  if (!value) return null;
  if (value.startsWith('data:') || value.startsWith('blob:')) return value;

  const isStorageObjectUrl = /\/storage\/v1\/object\/(?:public|sign)\//.test(value);
  if (/^https?:\/\//i.test(value) && !isStorageObjectUrl) {
    return value;
  }

  for (const bucket of FACE_SAMPLE_BUCKETS) {
    const path = parseStoragePathFromUrl(value, bucket);
    if (!path) continue;
    return bucket === 'face-images' ? path : `${bucket}/${path}`;
  }

  const normalized = value.replace(/^\/+/, '');
  for (const bucket of FACE_SAMPLE_BUCKETS) {
    if (normalized.startsWith(`${bucket}/`)) {
      const path = normalized.slice(bucket.length + 1);
      return bucket === 'face-images' ? path : `${bucket}/${path}`;
    }
  }

  return normalized;
};

const resolveFaceSampleUrl = async (
  rawValue: string | null | undefined,
  signedUrlCache: Map<string, string | null>
): Promise<string | null> => {
  if (!rawValue) return null;
  const value = rawValue.trim();
  if (!value) return null;

  const isStorageObjectUrl = /\/storage\/v1\/object\/(?:public|sign)\//.test(value);

  if (value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }

  if (/^https?:\/\//i.test(value) && !isStorageObjectUrl) {
    return value;
  }

  const candidates = new Set<{ bucket: string; path: string }>();

  FACE_SAMPLE_BUCKETS.forEach((bucket) => {
    const extracted = parseStoragePathFromUrl(value, bucket);
    if (extracted) candidates.add({ bucket, path: extracted });
  });

  if (candidates.size === 0) {
    const normalized = value.replace(/^\/+/, '');
    const prefixed = FACE_SAMPLE_BUCKETS.find((bucket) => normalized.startsWith(`${bucket}/`));
    if (prefixed) {
      const path = normalized.slice(prefixed.length + 1);
      candidates.add({ bucket: prefixed, path });
    }
    FACE_SAMPLE_BUCKETS.forEach((bucket) => candidates.add({ bucket, path: normalized }));
  }

  for (const candidate of candidates) {
    const cacheKey = `${candidate.bucket}:${candidate.path}`;
    if (signedUrlCache.has(cacheKey)) {
      const cached = signedUrlCache.get(cacheKey);
      if (cached) return cached;
      continue;
    }

    const { data, error } = await supabase.storage
      .from(candidate.bucket)
      .createSignedUrl(candidate.path, 60 * 60);

    if (!error && data?.signedUrl) {
      signedUrlCache.set(cacheKey, data.signedUrl);
      return data.signedUrl;
    }

    signedUrlCache.set(cacheKey, null);
  }

  return null;
};

const StudentFaceSamplesManager: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'confidence'>('newest');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'slots' | 'captured'>('all');

  const [cropOpen, setCropOpen] = useState(false);
  const [cropSample, setCropSample] = useState<FaceSample | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string>('');
  const [transferSampleId, setTransferSampleId] = useState<string | null>(null);
  const [transferTargetUserId, setTransferTargetUserId] = useState<string>('');
  const [deletingStudent, setDeletingStudent] = useState(false);
  const [deletingProfile, setDeletingProfile] = useState(false);
  const [mergeTargetUserId, setMergeTargetUserId] = useState<string>('');
  const [mergingStudent, setMergingStudent] = useState(false);
  const [reregisteringStudent, setReregisteringStudent] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [importingZip, setImportingZip] = useState(false);
  const [exportProgress, setExportProgress] = useState<OperationProgress | null>(null);
  const [importProgress, setImportProgress] = useState<OperationProgress | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importPreparedZip, setImportPreparedZip] = useState<JSZip | null>(null);
  const [importManifest, setImportManifest] = useState<FaceSamplesZipManifest | null>(null);
  const [importCandidates, setImportCandidates] = useState<ImportCandidate[]>([]);
  const [selectedImportKeys, setSelectedImportKeys] = useState<Set<string>>(new Set());
  const [conflictMode, setConflictMode] = useState<'overwrite' | 'skip'>('skip');
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [selectedSampleIds, setSelectedSampleIds] = useState<Set<string>>(new Set());

  const importZipInputRef = React.useRef<HTMLInputElement | null>(null);

  const isUuid = (value: string | null | undefined) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

  const hasLoadedRef = React.useRef(false);
  const refreshTimerRef = React.useRef<number | null>(null);
  const inFlightRef = React.useRef(false);

  const fetchSamples = async (options: { silent?: boolean } = {}) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (!options.silent && !hasLoadedRef.current) setLoading(true);
    try {
      const [samplesRes, allAttRes, profileRes] = await Promise.all([
        supabase
          .from('face_descriptors')
          .select('id, user_id, student_id, label, image_url, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('attendance_records')
          .select('id, user_id, student_id, student_name, image_url, status, device_info, timestamp, confidence_score')
          .neq('status', 'unauthorized')
          .order('timestamp', { ascending: false }),
        supabase
          .from('profiles')
          .select('user_id, display_name, full_name, employee_id, roll_number, admission_number')
          .not('user_id', 'is', null),
      ]);

      if (samplesRes.error) throw samplesRes.error;
      if (allAttRes.error) throw allAttRes.error;
      if (profileRes.error) throw profileRes.error;

      const normKey = (v: unknown) => (v == null ? '' : String(v).trim().toLowerCase());
      const normName = (v: unknown) =>
        (v == null ? '' : String(v)).trim().toLowerCase().replace(/\s+/g, ' ');

      const profileMap = new Map<string, string>();
      (profileRes.data || []).forEach((p: any) => {
        const name = p?.display_name || p?.full_name;
        if (p?.user_id && name) profileMap.set(p.user_id, name);
      });

      // ── Canonical identity registry ───────────────────────────────────────
      // A student may show up as: an attendance row (with/without user_id),
      // a descriptor row (with/without user_id) and a profile row. All of those
      // must collapse into ONE group, otherwise the list shows duplicates.
      const grouped = new Map<string, StudentGroup>();
      const byUserId = new Map<string, string>();
      const byEmployee = new Map<string, string>();
      const byName = new Map<string, string>();

      const resolveGroup = (aliases: {
        userId?: string | null;
        employeeId?: string | null;
        name?: string | null;
        fallbackId: string;
      }): StudentGroup => {
        const uid = normKey(aliases.userId);
        const emp = normKey(aliases.employeeId);
        const nameKey = normName(aliases.name);

        let key =
          (uid && byUserId.get(uid)) ||
          (emp && byEmployee.get(emp)) ||
          (nameKey && byName.get(nameKey)) ||
          undefined;

        if (!key) {
          key = uid || emp || aliases.fallbackId;
          grouped.set(key, {
            userId: aliases.userId || key,
            name: (aliases.name || '').toString().trim() || aliases.employeeId || 'Student',
            employeeId: (aliases.employeeId || '').toString().trim() || key,
            samples: [],
          });
        } else {
          const group = grouped.get(key)!;
          // enrich blanks so the merged row is the most complete one
          if (!group.userId || group.userId === key) group.userId = aliases.userId || group.userId;
          if ((!group.name || group.name === 'Student') && aliases.name) group.name = aliases.name;
          if ((!group.employeeId || group.employeeId === key) && aliases.employeeId) {
            group.employeeId = aliases.employeeId;
          }
        }

        if (uid) byUserId.set(uid, key);
        if (emp) byEmployee.set(emp, key);
        if (nameKey) byName.set(nameKey, key);
        return grouped.get(key)!;
      };

      // 1) Registered students first — they define the canonical directory.
      const attendanceRows = allAttRes.data || [];
      const registeredRows = attendanceRows.filter(
        (r: any) => r.status === 'registered' || r.status === 'pending_approval'
      );

      const identityOf = (r: any) => {
        const di = r.device_info || {};
        const m = di.metadata || {};
        return {
          name: m.name || di.name || r.student_name || (r.user_id ? profileMap.get(r.user_id) : '') || '',
          employeeId: m.employee_id || m.roll_number || di.employee_id || r.student_id || '',
        };
      };

      registeredRows.forEach((r: any) => {
        const { name, employeeId } = identityOf(r);
        if (!name || name === 'Unknown' || name === 'User') return;
        resolveGroup({ userId: r.user_id, employeeId, name, fallbackId: r.id });
      });

      // 2) Descriptor rows — attach to existing students, create only when new.
      (samplesRes.data || []).forEach((raw: any) => {
        const uid = (raw.user_id || '').toString().trim();
        const label = (raw.label || '').toString().trim();
        const name = label || (uid ? profileMap.get(uid) : '') || '';
        if (!name && !uid) return;
        const group = resolveGroup({
          userId: uid || null,
          employeeId: (raw.student_id || '').toString().trim() || null,
          name: name || null,
          fallbackId: raw.id,
        });
        group.samples.push({
          id: raw.id,
          user_id: uid || group.userId,
          label: raw.label,
          image_url: raw.image_url,
          created_at: raw.created_at,
          source: 'descriptor_registration',
          source_table: 'face_descriptors',
          confidence_score: 1,
          status: 'registered',
        });
      });

      // 3) Captured photos from attendance / gate recognition.
      attendanceRows.forEach((r: any) => {
        if (!r.image_url) return;
        const di = r.device_info || {};
        const { name, employeeId } = identityOf(r);
        if (!name || name === 'Unknown' || name === 'User') return;

        const uid = normKey(r.user_id);
        const emp = normKey(employeeId);
        const nameKey = normName(name);
        const key =
          (uid && byUserId.get(uid)) || (emp && byEmployee.get(emp)) || (nameKey && byName.get(nameKey));
        if (!key) return; // never create a new student from a recognition photo
        const group = grouped.get(key)!;

        const fromGate = Boolean(di.gate);
        let source: FaceSample['source'];
        if (r.status === 'registered' || r.status === 'pending_approval') {
          source = 'record_registration';
        } else if ((r.confidence_score ?? 0) >= 0.6 && (r.status === 'present' || r.status === 'late')) {
          source = fromGate ? 'recognition_gate' : 'recognition_attendance';
        } else {
          return;
        }

        group.samples.push({
          id: r.id,
          user_id: r.user_id || group.userId,
          label: di.metadata?.name || null,
          image_url: r.image_url,
          created_at: r.timestamp,
          source,
          source_table: 'attendance_records',
          confidence_score: r.confidence_score ?? null,
          status: r.status,
        });
      });

      const next = Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));
      const signedUrlCache = new Map<string, string | null>();
      const hydratedGroups = await Promise.all(
        next.map(async (group) => ({
          ...group,
          samples: await Promise.all(
            group.samples.map(async (sample) => {
              const resolved = await resolveFaceSampleUrl(sample.image_url, signedUrlCache);
              return {
                ...sample,
                image_url: resolved,
              };
            })
          ),
        }))
      );

      setGroups(hydratedGroups);
      hasLoadedRef.current = true;
      setSelectedUserId((current) => {
        if (current && hydratedGroups.some((g) => g.userId === current)) return current;
        return hydratedGroups[0]?.userId || '';
      });
    } catch (error) {
      console.error('Failed to fetch face samples:', error);
      if (!hasLoadedRef.current) {
        toast({ title: 'Error', description: 'Could not load student face samples.', variant: 'destructive' });
      }
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  /** Coalesced, non-blocking refresh — keeps the list on screen while updating. */
  const scheduleRefresh = React.useCallback(() => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      fetchSamples({ silent: true });
    }, 1200);
  }, []);

  useEffect(() => {
    fetchSamples();
    const channel = supabase
      .channel('face-samples-manager')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'face_descriptors' }, async (payload: any) => {
        const r = payload.new || {};
        try {
          if (r.descriptor && r.user_id) {
            await cacheDescriptor({
              id: r.id,
              userId: r.user_id,
              name: r.label || 'Unknown',
              descriptor: r.descriptor as number[],
              imageUrl: r.image_url,
              createdAt: new Date(r.created_at || Date.now()).getTime(),
              lastUsed: Date.now(),
            });
          } else {
            await syncDescriptorCache();
          }
        } catch (err) {
          console.warn('Incremental cache add failed, doing full resync:', err);
          syncDescriptorCache().catch(() => {});
        }
        scheduleRefresh();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'face_descriptors' }, async (payload: any) => {
        const r = payload.old || {};
        try {
          if (r.id) await removeFromCache(r.id);
        } catch (err) {
          console.warn('Incremental cache delete failed, doing full resync:', err);
          syncDescriptorCache().catch(() => {});
        }
        scheduleRefresh();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'face_descriptors' }, async (payload: any) => {
        const r = payload.new || {};
        try {
          if (r.descriptor && r.user_id) {
            await cacheDescriptor({
              id: r.id,
              userId: r.user_id,
              name: r.label || 'Unknown',
              descriptor: r.descriptor as number[],
              imageUrl: r.image_url,
              createdAt: new Date(r.created_at || Date.now()).getTime(),
              lastUsed: Date.now(),
            });
          }
        } catch (err) {
          syncDescriptorCache().catch(() => {});
        }
        scheduleRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => scheduleRefresh())
      .subscribe();
    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [scheduleRefresh]);


  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (!q) return true;
      return g.name.toLowerCase().includes(q) || g.employeeId.toLowerCase().includes(q);
    });
  }, [groups, search]);

  const selectedGroup = useMemo(
    () => filteredGroups.find((g) => g.userId === selectedUserId) || null,
    [filteredGroups, selectedUserId]
  );

  const groupsMap = useMemo(() => new Map(groups.map((g) => [g.userId, g])), [groups]);

  const selectedSamples = useMemo(() => {
    if (!selectedGroup) return [];
    const list = [...selectedGroup.samples];
    if (sortBy === 'oldest') {
      return list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
    if (sortBy === 'confidence') {
      return list.sort((a, b) => (b.confidence_score ?? 0) - (a.confidence_score ?? 0));
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [selectedGroup, sortBy]);

  const selectedSlots = useMemo(() => selectedSamples.filter(isSlot), [selectedSamples]);
  const selectedPhotos = useMemo(() => selectedSamples.filter((s) => !isSlot(s)), [selectedSamples]);
  const showSlots = sourceFilter === 'all' || sourceFilter === 'slots';
  const showPhotos = sourceFilter === 'all' || sourceFilter === 'captured';
  const selectedSamplesForBulkDelete = useMemo(
    () => selectedPhotos.filter((sample) => selectedSampleIds.has(sample.id) && sample.image_url),
    [selectedPhotos, selectedSampleIds]
  );

  useEffect(() => {
    setSelectedSampleIds(new Set());
  }, [selectedUserId]);

  const toggleSampleSelection = (sampleId: string) => {
    setSelectedSampleIds((prev) => {
      const next = new Set(prev);
      if (next.has(sampleId)) next.delete(sampleId);
      else next.add(sampleId);
      return next;
    });
  };

  const selectAllPhotos = () => {
    const photoIds = selectedPhotos.filter((sample) => sample.image_url).map((sample) => sample.id);
    setSelectedSampleIds(new Set(photoIds));
  };

  const clearSelectedPhotos = () => {
    setSelectedSampleIds(new Set());
  };

  const handleBulkDeleteSelectedPhotos = async () => {
    if (selectedSamplesForBulkDelete.length === 0) {
      toast({ title: 'No photos selected', description: 'Select one or more face sample photos first.' });
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedSamplesForBulkDelete.length} selected face sample photo${selectedSamplesForBulkDelete.length === 1 ? '' : 's'}?`
    );
    if (!confirmed) return;

    try {
      const descriptorIds = selectedSamplesForBulkDelete
        .filter((sample) => sample.source_table === 'face_descriptors')
        .map((sample) => sample.id);
      const attendanceIds = selectedSamplesForBulkDelete
        .filter((sample) => sample.source_table === 'attendance_records')
        .map((sample) => sample.id);

      if (descriptorIds.length > 0) {
        const { error } = await supabase.from('face_descriptors').delete().in('id', descriptorIds);
        if (error) throw error;
      }

      if (attendanceIds.length > 0) {
        const { error } = await supabase
          .from('attendance_records')
          .update({ image_url: null })
          .in('id', attendanceIds);
        if (error) throw error;
      }

      toast({
        title: 'Photos deleted',
        description: `Removed ${selectedSamplesForBulkDelete.length} selected face sample photo${selectedSamplesForBulkDelete.length === 1 ? '' : 's'}.`,
      });
      setSelectedSampleIds(new Set());
      fetchSamples();
      syncDescriptorCache().catch(() => {});
    } catch (error) {
      console.error('Failed bulk deleting sample photos:', error);
      toast({ title: 'Bulk delete failed', description: 'Could not delete selected sample photos.', variant: 'destructive' });
    }
  };

  const handleDeleteSample = async (sample: FaceSample) => {
    try {
      if (sample.source_table === 'face_descriptors') {
        const { error } = await supabase.from('face_descriptors').delete().eq('id', sample.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('attendance_records')
          .update({ image_url: null })
          .eq('id', sample.id);
        if (error) throw error;
      }

      toast({ title: 'Image removed', description: 'Selected sample image was removed from model sample list.' });
      fetchSamples();
    } catch (error) {
      console.error('Failed deleting sample image:', error);
      toast({ title: 'Delete failed', description: 'Could not delete this sample image.', variant: 'destructive' });
    }
  };

  const openCropper = async (sample: FaceSample) => {
    if (!sample.image_url) {
      toast({ title: 'No image', description: 'This sample has no stored photo to edit.', variant: 'destructive' });
      return;
    }
    try {
      let src = sample.image_url;
      if (!src.startsWith('data:') && !src.startsWith('blob:')) {
        const response = await fetch(src);
        const blob = await response.blob();
        src = URL.createObjectURL(blob);
      }
      setCropSample(sample);
      setCropImageSrc(src);
      setCropOpen(true);
    } catch {
      toast({ title: 'Image load failed', description: 'Could not open sample image for editing.', variant: 'destructive' });
    }
  };

  const handleCropSave = async (croppedBlob: Blob) => {
    if (!cropSample) return;
    try {
      const folderId = (cropSample.user_id || 'unassigned')
        .toString()
        .replace(/[^a-zA-Z0-9_-]/g, '_');
      const file = new File([croppedBlob], `sample_${cropSample.id}_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url = await uploadImage(file, `students/${folderId}/${file.name}`);

      const table = cropSample.source_table;
      const { error } = await supabase
        .from(table)
        .update({ image_url: url })
        .eq('id', cropSample.id);

      if (error) throw error;

      toast({ title: 'Updated', description: 'Sample photo was cropped and saved.' });
      setCropOpen(false);
      setCropSample(null);
      setCropImageSrc('');
      fetchSamples();
    } catch (error) {
      console.error('Failed updating sample image:', error);
      toast({ title: 'Save failed', description: 'Could not save cropped photo.', variant: 'destructive' });
    }
  };

  const handleTransferSample = async (sample: FaceSample) => {
    if (!transferTargetUserId) {
      toast({ title: 'Select student', description: 'Please choose a student to transfer this photo.', variant: 'destructive' });
      return;
    }

    if (transferTargetUserId === sample.user_id) {
      toast({ title: 'Same student', description: 'Choose a different student for transfer.', variant: 'destructive' });
      return;
    }

    try {
      const target = groupsMap.get(transferTargetUserId);
      const updatePayload: Record<string, any> = { user_id: transferTargetUserId };

      if (sample.source_table === 'face_descriptors') {
        updatePayload.label = target?.name || null;
      }

      const { error } = await supabase
        .from(sample.source_table)
        .update(updatePayload)
        .eq('id', sample.id);

      if (error) throw error;

      toast({ title: 'Photo transferred', description: 'Sample photo was moved to the selected student.' });
      setTransferSampleId(null);
      setTransferTargetUserId('');
      fetchSamples();
    } catch (error) {
      console.error('Failed transferring sample image:', error);
      toast({ title: 'Transfer failed', description: 'Could not transfer this sample image.', variant: 'destructive' });
    }
  };

  const handleDeleteStudent = async () => {
    if (!selectedGroup) return;
    const confirmed = window.confirm(
      `Delete ALL face data for ${selectedGroup.name} (${selectedGroup.employeeId})?\n\nThis removes trained slots and clears all captured sample photos. This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingStudent(true);
    try {
      const recordIds: string[] = [];
      const descriptorIds: string[] = [];
      selectedGroup.samples.forEach((s) => {
        if (s.source_table === 'face_descriptors') descriptorIds.push(s.id);
        else recordIds.push(s.id);
      });

      // SAFEGUARD: Only touch rows explicitly visible under the selected student group.
      // Never delete by user_id here because legacy datasets may share user_id across students.
      const uniqueDescriptorIds = Array.from(new Set(descriptorIds));
      const uniqueRecordIds = Array.from(new Set(recordIds));

      // Snapshot rows before mutation for rollback safety.
      let descriptorBackup: any[] = [];
      let attendanceBackup: Array<{ id: string; image_url: string | null }> = [];

      if (uniqueDescriptorIds.length > 0) {
        const { data, error } = await supabase
          .from('face_descriptors')
          .select('*')
          .in('id', uniqueDescriptorIds);
        if (error) throw error;
        descriptorBackup = data || [];
      }

      if (uniqueRecordIds.length > 0) {
        const { data, error } = await supabase
          .from('attendance_records')
          .select('id, image_url')
          .in('id', uniqueRecordIds);
        if (error) throw error;
        attendanceBackup = data || [];
      }

      // 1) Delete only selected descriptors by primary key.
      if (uniqueDescriptorIds.length > 0) {
        const { error } = await supabase.from('face_descriptors').delete().in('id', uniqueDescriptorIds);
        if (error) throw error;
      }

      // 2) Clear only selected captured sample images by primary key.
      if (uniqueRecordIds.length > 0) {
        const { error } = await supabase
          .from('attendance_records')
          .update({ image_url: null })
          .in('id', uniqueRecordIds);
        if (error) {
          // Rollback descriptors if second step fails.
          if (descriptorBackup.length > 0) {
            await supabase.from('face_descriptors').insert(descriptorBackup);
          }
          throw error;
        }
      }

      toast({
        title: 'Student data deleted',
        description: `Removed ${uniqueDescriptorIds.length} trained slots and ${uniqueRecordIds.length} captured samples for ${selectedGroup.name}.`,
      });
      setSelectedUserId('');
      fetchSamples();
      syncDescriptorCache().catch(() => {});
    } catch (error) {
      console.error('Failed deleting student face data:', error);
      toast({
        title: 'Delete failed',
        description: 'Could not delete this student\'s face data.',
        variant: 'destructive',
      });
    } finally {
      setDeletingStudent(false);
    }
  };

  const handleDeleteStudentProfile = async () => {
    if (!selectedGroup?.userId) {
      toast({
        title: 'No profile linked',
        description: 'This student does not have a linked profile user ID.',
        variant: 'destructive',
      });
      return;
    }

    const confirmed = window.confirm(
      `Delete profile for ${selectedGroup.name} (${selectedGroup.employeeId})?\n\nThis removes the student profile record. This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('user_id', selectedGroup.userId);

      if (error) throw error;

      toast({
        title: 'Profile deleted',
        description: `Removed profile for ${selectedGroup.name}.`,
      });

      fetchSamples();
    } catch (error) {
      console.error('Failed deleting student profile:', error);
      toast({
        title: 'Delete profile failed',
        description: 'Could not delete this student profile.',
        variant: 'destructive',
      });
    } finally {
      setDeletingProfile(false);
    }
  };

  const handleSetAsIdCardPhoto = async (sample: FaceSample) => {
    const persistentImageRef = toPersistentImageReference(sample.image_url);

    if (!selectedGroup || !persistentImageRef) {
      toast({ title: 'No photo', description: 'This sample does not have an image to set.', variant: 'destructive' });
      return;
    }

    try {
      const filters: string[] = [];
      if (selectedGroup.userId) filters.push(`user_id.eq.${selectedGroup.userId}`);
      if (selectedGroup.employeeId) filters.push(`student_id.eq.${selectedGroup.employeeId}`);
      if (filters.length === 0) return;

      const { data: registrationRows, error: regFetchError } = await supabase
        .from('attendance_records')
        .select('id, device_info')
        .eq('status', 'registered')
        .or(filters.join(','));

      if (regFetchError) throw regFetchError;

      for (const row of registrationRows || []) {
        const currentDeviceInfo = (row.device_info as Record<string, any>) || {};
        const currentMetadata = (currentDeviceInfo.metadata as Record<string, any>) || {};
        const currentFaceModel = (currentMetadata.face_model as Record<string, any>) || {};

        const nextDeviceInfo = {
          ...currentDeviceInfo,
          metadata: {
            ...currentMetadata,
            id_card_photo_url: persistentImageRef,
            face_model: {
              ...currentFaceModel,
              id_card_photo_url: persistentImageRef,
            },
          },
        };

        const { error: regUpdateError } = await supabase
          .from('attendance_records')
          .update({ device_info: nextDeviceInfo })
          .eq('id', row.id);

        if (regUpdateError) throw regUpdateError;
      }

      const descriptorFilters: string[] = [];
      if (selectedGroup.userId) descriptorFilters.push(`user_id.eq.${selectedGroup.userId}`);
      if (selectedGroup.employeeId) descriptorFilters.push(`student_id.eq.${selectedGroup.employeeId}`);

      if (descriptorFilters.length > 0) {
        const { error: descriptorUpdateError } = await supabase
          .from('face_descriptors')
          .update({ image_url: persistentImageRef })
          .or(descriptorFilters.join(','));

        if (descriptorUpdateError) throw descriptorUpdateError;
      }

      toast({ title: 'ID card photo updated', description: 'Selected sample is now the default ID card photo.' });
      fetchSamples();
    } catch (error) {
      console.error('Failed setting ID card photo:', error);
      toast({ title: 'Update failed', description: 'Could not set this image as ID card photo.', variant: 'destructive' });
    }
  };

  const handleMergeStudentData = async () => {
    if (!selectedGroup || !mergeTargetUserId) {
      toast({ title: 'Select target', description: 'Choose a student to merge into.', variant: 'destructive' });
      return;
    }

    if (mergeTargetUserId === selectedGroup.userId) {
      toast({ title: 'Same student', description: 'Choose a different target student.', variant: 'destructive' });
      return;
    }

    const target = groupsMap.get(mergeTargetUserId);
    if (!target) {
      toast({ title: 'Not found', description: 'Target student was not found.', variant: 'destructive' });
      return;
    }

    const confirmed = window.confirm(
      `Merge ${selectedGroup.name} (${selectedGroup.employeeId}) into ${target.name} (${target.employeeId})?\n\nThis will move face samples and registration identity to the target student and remove duplicate registration rows.`
    );
    if (!confirmed) return;

    setMergingStudent(true);
    try {
      const sourceUserId = selectedGroup.userId;
      const sourceEmployeeId = selectedGroup.employeeId;
      const targetUserId = target.userId;
      const targetEmployeeId = target.employeeId;

      const descriptorFilters: string[] = [];
      if (sourceUserId) descriptorFilters.push(`user_id.eq.${sourceUserId}`);
      if (sourceEmployeeId) descriptorFilters.push(`student_id.eq.${sourceEmployeeId}`);

      if (descriptorFilters.length > 0) {
        const { error: moveDescriptorsError } = await supabase
          .from('face_descriptors')
          .update({
            user_id: targetUserId,
            student_id: targetEmployeeId,
            label: target.name,
          })
          .or(descriptorFilters.join(','));
        if (moveDescriptorsError) throw moveDescriptorsError;
      }

      const regFilters: string[] = [];
      if (sourceUserId) regFilters.push(`user_id.eq.${sourceUserId}`);
      if (sourceEmployeeId) regFilters.push(`student_id.eq.${sourceEmployeeId}`);

      if (regFilters.length > 0) {
        const { error: moveRegistrationError } = await supabase
          .from('attendance_records')
          .update({ user_id: targetUserId, student_id: targetEmployeeId, student_name: target.name })
          .neq('status', 'unauthorized')
          .or(regFilters.join(','));
        if (moveRegistrationError) throw moveRegistrationError;
      }

      const targetRegistrationFilters: string[] = [];
      if (targetUserId) targetRegistrationFilters.push(`user_id.eq.${targetUserId}`);
      if (targetEmployeeId) targetRegistrationFilters.push(`student_id.eq.${targetEmployeeId}`);

      if (targetRegistrationFilters.length > 0) {
        const { data: targetRegistrations, error: fetchTargetRegsError } = await supabase
          .from('attendance_records')
          .select('id, timestamp')
          .eq('status', 'registered')
          .or(targetRegistrationFilters.join(','))
          .order('timestamp', { ascending: false });

        if (fetchTargetRegsError) throw fetchTargetRegsError;

        const rowsToDelete = (targetRegistrations || []).slice(1).map((r: any) => r.id);
        if (rowsToDelete.length > 0) {
          const { error: deleteDupeRegsError } = await supabase
            .from('attendance_records')
            .delete()
            .in('id', rowsToDelete);
          if (deleteDupeRegsError) throw deleteDupeRegsError;
        }
      }

      toast({
        title: 'Students merged',
        description: `${selectedGroup.name} data merged into ${target.name}.`,
      });

      setMergeTargetUserId('');
      setSelectedUserId(target.userId);
      fetchSamples();
      syncDescriptorCache().catch(() => {});
    } catch (error) {
      console.error('Failed merging student data:', error);
      toast({ title: 'Merge failed', description: 'Could not merge selected student data.', variant: 'destructive' });
    } finally {
      setMergingStudent(false);
    }
  };

  const handleReregisterFromExistingData = async () => {
    if (!selectedGroup) return;

    const sourceFilters: string[] = [];
    if (selectedGroup.userId) sourceFilters.push(`user_id.eq.${selectedGroup.userId}`);
    if (selectedGroup.employeeId) sourceFilters.push(`student_id.eq.${selectedGroup.employeeId}`);

    if (sourceFilters.length === 0) {
      toast({ title: 'Missing identity', description: 'Cannot recover this student without user/student id.', variant: 'destructive' });
      return;
    }

    setReregisteringStudent(true);
    try {
      const descriptorSamples = selectedGroup.samples.filter((s) => s.source_table === 'face_descriptors');
      const bestImageSample =
        descriptorSamples.find((s) => !!s.image_url) ||
        selectedGroup.samples.find((s) => !!s.image_url) ||
        null;
      const bestImageRef = toPersistentImageReference(bestImageSample?.image_url || null);

      const existingUuid =
        selectedGroup.samples.map((s) => s.user_id).find((id) => isUuid(id)) ||
        (isUuid(selectedGroup.userId) ? selectedGroup.userId : null);
      const resolvedUserId = existingUuid || crypto.randomUUID();

      const { data: contextRow } = await supabase
        .from('attendance_records')
        .select('id, category, class, section, device_info')
        .neq('status', 'unauthorized')
        .or(sourceFilters.join(','))
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      const existingMetadata = ((contextRow as any)?.device_info as any)?.metadata || {};
      const category = (contextRow as any)?.category || existingMetadata?.category || 'A';
      const classValue = (contextRow as any)?.class || existingMetadata?.class_section || existingMetadata?.department || null;
      const sectionValue = (contextRow as any)?.section || existingMetadata?.section || null;

      const registrationPayload: Record<string, any> = {
        user_id: resolvedUserId,
        status: 'registered',
        source: 'registration',
        capture_mode: existingMetadata?.face_model?.capture_mode || 'scan-3d',
        class: classValue,
        section: sectionValue,
        student_name: selectedGroup.name,
        student_id: selectedGroup.employeeId,
        category,
        image_url: bestImageRef,
        timestamp: new Date().toISOString(),
        device_info: {
          type: 'recovery',
          registration: 'true',
          timestamp: new Date().toISOString(),
          metadata: {
            ...existingMetadata,
            name: selectedGroup.name,
            employee_id: selectedGroup.employeeId,
            category,
            firebase_image_url: bestImageRef || existingMetadata?.firebase_image_url || null,
            face_model: {
              ...(existingMetadata?.face_model || {}),
              id_card_photo_url:
                existingMetadata?.face_model?.id_card_photo_url ||
                bestImageRef ||
                null,
            },
          },
        },
      };

      const { data: existingRegistration, error: existingRegError } = await supabase
        .from('attendance_records')
        .select('id')
        .eq('status', 'registered')
        .or(sourceFilters.join(','))
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingRegError) throw existingRegError;

      if (existingRegistration?.id) {
        const { error: updateRegError } = await supabase
          .from('attendance_records')
          .update(registrationPayload)
          .eq('id', existingRegistration.id);
        if (updateRegError) throw updateRegError;
      } else {
        const { error: insertRegError } = await supabase
          .from('attendance_records')
          .insert(registrationPayload);
        if (insertRegError) throw insertRegError;
      }

      const descriptorIds = descriptorSamples.map((s) => s.id);
      if (descriptorIds.length > 0) {
        const descriptorPatch: Record<string, any> = {
          user_id: resolvedUserId,
          student_id: selectedGroup.employeeId,
          student_name: selectedGroup.name,
          label: selectedGroup.name,
          is_active: true,
        };
        if (bestImageRef) descriptorPatch.image_url = bestImageRef;

        const { error: descriptorUpdateError } = await supabase
          .from('face_descriptors')
          .update(descriptorPatch)
          .in('id', descriptorIds);
        if (descriptorUpdateError) throw descriptorUpdateError;
      }

      const { error: normalizeRowsError } = await supabase
        .from('attendance_records')
        .update({
          user_id: resolvedUserId,
          student_id: selectedGroup.employeeId,
          student_name: selectedGroup.name,
        })
        .neq('status', 'unauthorized')
        .or(sourceFilters.join(','));
      if (normalizeRowsError) throw normalizeRowsError;

      toast({
        title: 'Student re-registered',
        description: `${selectedGroup.name} is restored using existing face samples and linked for scanning again.`,
      });

      await fetchSamples();
      syncDescriptorCache().catch(() => {});
    } catch (error) {
      console.error('Failed to re-register student from existing data:', error);
      toast({ title: 'Recovery failed', description: 'Could not re-register this student from existing samples.', variant: 'destructive' });
    } finally {
      setReregisteringStudent(false);
    }
  };

  const handleExportAllStudentsZip = async () => {
    if (groups.length === 0) {
      toast({ title: 'Nothing to export', description: 'No student face samples found.' });
      return;
    }

    setExportingZip(true);
    try {
      const [registeredRowsRes, profilesRes] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('user_id, student_id, student_name, category, class, section, roll_number, device_info, status, timestamp')
          .eq('status', 'registered')
          .order('timestamp', { ascending: false }),
        supabase
          .from('profiles')
          .select('user_id, display_name, full_name, username, email, phone, parent_name, parent_email, class, section, metadata'),
      ]);

      if (registeredRowsRes.error) throw registeredRowsRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const profileByUserId = new Map<string, any>();
      (profilesRes.data || []).forEach((profile: any) => {
        if (profile?.user_id) profileByUserId.set(profile.user_id, profile);
      });
      const registeredRows = registeredRowsRes.data || [];

      const totalImages = groups.reduce((sum, group) => sum + group.samples.filter((sample) => !!sample.image_url).length, 0);
      setExportProgress({
        label: totalImages > 0 ? 'Preparing student images for export...' : 'Preparing ZIP...',
        current: 0,
        total: Math.max(totalImages, 1),
      });

      const zip = new JSZip();
      const studentsRoot = zip.folder('students');
      const manifest: FaceSamplesZipManifest = {
        version: 1,
        exportedAt: new Date().toISOString(),
        app: 'Presence Face Samples Backup',
        students: [],
      };

      let exportedImageCount = 0;
      let skippedImageCount = 0;

      for (const group of groups) {
        const studentFolderName = `${slugifyPart(group.employeeId || 'no-id')}-${slugifyPart(group.name)}`;
        const studentFolder = studentsRoot?.folder(studentFolderName);

        const matchById = registeredRows.find((row: any) => String(row.student_id || '').trim() && String(row.student_id || '').trim() === String(group.employeeId || '').trim());
        const matchByUser = registeredRows.find((row: any) => String(row.user_id || '').trim() && String(row.user_id || '').trim() === String(group.userId || '').trim());
        const bestRow: any = matchById || matchByUser || null;
        const bestProfile = (bestRow?.user_id && profileByUserId.get(bestRow.user_id)) || profileByUserId.get(group.userId) || null;
        const metadata = (bestRow?.device_info as any)?.metadata || {};

        const studentManifestEntry: FaceSamplesZipManifest['students'][number] = {
          userId: group.userId,
          employeeId: group.employeeId,
          name: group.name,
          details: {
            class: toOptionalText(bestRow?.class || bestProfile?.class || metadata.class),
            section: toOptionalText(bestRow?.section || bestProfile?.section || metadata.section),
            rollNumber: toOptionalText(bestRow?.roll_number || metadata.roll_number || metadata.employee_id || bestRow?.student_id || group.employeeId),
            category: toOptionalText(bestRow?.category || metadata.category),
            bloodGroup: toOptionalText(metadata.blood_group),
            parentName: toOptionalText(bestProfile?.parent_name || metadata.parent_name),
            parentPhone: toOptionalText(bestProfile?.phone || metadata.parent_phone || metadata.phone),
            parentEmail: toOptionalText(bestProfile?.parent_email || metadata.parent_email),
            address: toOptionalText(metadata.address),
            transportMode: toOptionalText(metadata.transport_mode),
            phone: toOptionalText(bestProfile?.phone || metadata.phone),
            email: toOptionalText(bestProfile?.email || metadata.email),
            profileName: toOptionalText(bestProfile?.display_name || bestProfile?.full_name || bestRow?.student_name),
            username: toOptionalText(bestProfile?.username),
            metadata: metadata && typeof metadata === 'object' ? metadata : {},
          },
          sampleCount: 0,
          samples: [],
        };

        const imageSamples = group.samples.filter((sample) => !!sample.image_url);
        for (let index = 0; index < imageSamples.length; index += 1) {
          const sample = imageSamples[index];
          if (!sample.image_url) continue;
          try {
            const response = await fetch(sample.image_url);
            if (!response.ok) {
              skippedImageCount += 1;
              setExportProgress((prev) => prev ? { ...prev, current: Math.min(prev.total, prev.current + 1) } : prev);
              continue;
            }

            const blob = await response.blob();
            const extension = extensionFromMime(blob.type || 'image/jpeg');
            const fileName = `${String(index + 1).padStart(3, '0')}-${sample.source}${extension}`;
            const zipPath = `students/${studentFolderName}/${fileName}`;

            studentFolder?.file(fileName, blob);
            studentManifestEntry.samples.push({
              path: zipPath,
              source: sample.source,
              createdAt: sample.created_at,
              status: sample.status ?? null,
            });
            exportedImageCount += 1;
            setExportProgress((prev) => prev ? { ...prev, current: Math.min(prev.total, prev.current + 1) } : prev);
          } catch {
            skippedImageCount += 1;
            setExportProgress((prev) => prev ? { ...prev, current: Math.min(prev.total, prev.current + 1) } : prev);
          }
        }

        studentManifestEntry.sampleCount = studentManifestEntry.samples.length;
        manifest.students.push(studentManifestEntry);
      }

      zip.file('manifest.json', JSON.stringify(manifest, null, 2));
      const blob = await zip.generateAsync({ type: 'blob' });

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `student-face-samples-${new Date().toISOString().slice(0, 10)}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);

      toast({
        title: 'ZIP exported',
        description: `Exported ${exportedImageCount} face images for ${groups.length} students${skippedImageCount ? ` (${skippedImageCount} skipped)` : ''}.`,
      });
    } catch (error) {
      console.error('Failed to export face samples zip:', error);
      toast({ title: 'Export failed', description: 'Could not create backup ZIP file.', variant: 'destructive' });
    } finally {
      setExportingZip(false);
      setExportProgress(null);
    }
  };

  const prepareImportStudentsZip = async (file: File) => {
    setImportSummary(null);
    try {
      const zip = await JSZip.loadAsync(file);
      const manifestText = await zip.file('manifest.json')?.async('string');
      if (!manifestText) throw new Error('manifest.json is missing from this ZIP file.');

      const parsedManifest = JSON.parse(manifestText) as FaceSamplesZipManifest;
      if (!parsedManifest?.students || !Array.isArray(parsedManifest.students)) {
        throw new Error('Invalid ZIP format: students list is missing.');
      }

      const manifest: FaceSamplesZipManifest = {
        version: Number(parsedManifest.version || 1),
        exportedAt: parsedManifest.exportedAt || new Date().toISOString(),
        app: parsedManifest.app || 'attendance-system',
        students: parsedManifest.students.map((student: any, index: number) => normalizeManifestStudent(student, index)),
      };

      const [existingByStudentIdRes, existingByUserIdRes] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('id, user_id, student_id, student_name, status, updated_at')
          .eq('status', 'registered')
          .not('student_id', 'is', null)
          .order('updated_at', { ascending: false }),
        supabase
          .from('attendance_records')
          .select('id, user_id, student_id, student_name, status, updated_at')
          .eq('status', 'registered')
          .not('user_id', 'is', null)
          .order('updated_at', { ascending: false }),
      ]);
      if (existingByStudentIdRes.error) throw existingByStudentIdRes.error;
      if (existingByUserIdRes.error) throw existingByUserIdRes.error;

      const byStudentId = new Map<string, any>();
      (existingByStudentIdRes.data || []).forEach((row: any) => {
        const key = String(row.student_id || '').trim();
        if (key && !byStudentId.has(key)) byStudentId.set(key, row);
      });
      const byUserId = new Map<string, any>();
      (existingByUserIdRes.data || []).forEach((row: any) => {
        const key = String(row.user_id || '').trim();
        if (key && !byUserId.has(key)) byUserId.set(key, row);
      });

      const nextCandidates: ImportCandidate[] = manifest.students.map((student, index) => {
        const existing =
          (student.employeeId ? byStudentId.get(student.employeeId) : null) ||
          (student.userId ? byUserId.get(student.userId) : null) ||
          null;
        return {
          key: `${student.employeeId || student.userId || slugifyPart(student.name) || 'student'}-${index}`,
          student,
          isExisting: Boolean(existing),
          existingStudentId: existing?.student_id || null,
          existingUserId: existing?.user_id || null,
          existingName: existing?.student_name || null,
        };
      });

      setImportPreparedZip(zip);
      setImportManifest(manifest);
      setImportCandidates(nextCandidates);
      setSelectedImportKeys(new Set(nextCandidates.map((candidate) => candidate.key)));
      setImportDialogOpen(true);

      toast({ title: 'ZIP loaded', description: `Found ${manifest.students.length} students in this backup ZIP.` });
    } catch (error: any) {
      console.error('Failed to parse face samples zip:', error);
      toast({ title: 'Invalid ZIP', description: error?.message || 'Could not read this ZIP backup.', variant: 'destructive' });
      if (importZipInputRef.current) importZipInputRef.current.value = '';
    }
  };

  const handleImportStudentsZip = async () => {
    if (!importPreparedZip || !importManifest) return;
    const selectedCandidates = importCandidates.filter((candidate) => selectedImportKeys.has(candidate.key));
    if (selectedCandidates.length === 0) {
      toast({ title: 'No students selected', description: 'Select at least one student to import.' });
      return;
    }

    setImportingZip(true);
    setImportDialogOpen(false);

    const totalImagesToProcess = selectedCandidates.reduce((sum, candidate) => sum + (candidate.student.samples?.length || 0), 0);
    setImportProgress({
      label: 'Importing student images and records...',
      current: 0,
      total: Math.max(totalImagesToProcess, 1),
    });

    try {
      let restoredStudents = 0;
      let skippedExisting = 0;
      let failedStudents = 0;
      let restoredImages = 0;
      let failedImages = 0;

      for (const candidate of selectedCandidates) {
        const student = candidate.student;
        if (candidate.isExisting && conflictMode === 'skip') {
          skippedExisting += 1;
          const skippedImages = student.samples?.length || 0;
          if (skippedImages > 0) {
            setImportProgress((prev) =>
              prev
                ? {
                    ...prev,
                    current: Math.min(prev.total, prev.current + skippedImages),
                  }
                : prev
            );
          }
          continue;
        }

        const sourceFilters: string[] = [];
        if (student.userId) sourceFilters.push(`user_id.eq.${student.userId}`);
        if (student.employeeId) sourceFilters.push(`student_id.eq.${student.employeeId}`);

        const restoredPaths: string[] = [];
        let studentFailed = false;

        for (let idx = 0; idx < (student.samples?.length || 0); idx += 1) {
          const sample = student.samples[idx];
          if (!sample?.path) {
            failedImages += 1;
            setImportProgress((prev) => prev ? { ...prev, current: Math.min(prev.total, prev.current + 1) } : prev);
            continue;
          }
          const fileEntry = resolveZipFileEntry(importPreparedZip, sample.path);
          if (!fileEntry) {
            console.warn('ZIP image entry missing for path:', sample.path);
            failedImages += 1;
            setImportProgress((prev) => prev ? { ...prev, current: Math.min(prev.total, prev.current + 1) } : prev);
            continue;
          }

          const binary = await fileEntry.async('arraybuffer');
          const inferredMime =
            mimeTypeFromPath(sample.path) ||
            mimeTypeFromPath(fileEntry.name) ||
            'image/jpeg';
          const blob = new Blob([binary], { type: inferredMime });
          const extension = extensionFromPath(sample.path) || extensionFromPath(fileEntry.name) || extensionFromMime(inferredMime);
          const storagePath = `recovery/${slugifyPart(student.employeeId || student.userId || student.name)}/${Date.now()}-${idx}${extension}`;

          const { error: uploadError } = await supabase.storage
            .from('face-images')
            .upload(storagePath, blob, {
              upsert: false,
              contentType: inferredMime,
            });

          if (uploadError) {
            console.warn('ZIP image upload failed:', {
              studentId: student.employeeId || null,
              userId: student.userId || null,
              sourcePath: sample.path,
              targetPath: storagePath,
              message: uploadError.message,
            });
            failedImages += 1;
            setImportProgress((prev) => prev ? { ...prev, current: Math.min(prev.total, prev.current + 1) } : prev);
            continue;
          }

          restoredPaths.push(storagePath);
          restoredImages += 1;
          setImportProgress((prev) => prev ? { ...prev, current: Math.min(prev.total, prev.current + 1) } : prev);
        }

        if (restoredPaths.length === 0) {
          failedStudents += 1;
          continue;
        }

        try {
          const existingQuery = supabase
            .from('attendance_records')
            .select('id, user_id, student_id')
            .eq('status', 'registered')
            .order('updated_at', { ascending: false })
            .limit(1);

          const { data: existingRegistration, error: existingRegistrationError } =
            sourceFilters.length > 0
              ? await existingQuery.or(sourceFilters.join(',')).maybeSingle()
              : await existingQuery.maybeSingle();
          if (existingRegistrationError) throw existingRegistrationError;

          const resolvedUserId =
            (existingRegistration?.user_id && isUuid(existingRegistration.user_id) ? existingRegistration.user_id : null) ||
            (isUuid(student.userId) ? student.userId : null) ||
            crypto.randomUUID();

          const details = student.details || EMPTY_STUDENT_DETAILS;

          const registrationPayload: Record<string, any> = {
            user_id: resolvedUserId,
            status: 'registered',
            source: 'zip-import',
            capture_mode: 'recovery',
            student_name: student.name,
            student_id: student.employeeId || null,
            image_url: restoredPaths[0],
            timestamp: new Date().toISOString(),
            category: details.category || 'A',
            class: details.class || null,
            section: details.section || null,
            roll_number: details.rollNumber || student.employeeId || null,
            device_info: {
              type: 'zip-import',
              metadata: {
                ...((details.metadata && typeof details.metadata === 'object' ? details.metadata : {}) as Record<string, any>),
                name: student.name,
                employee_id: student.employeeId,
                roll_number: details.rollNumber || student.employeeId || null,
                class: details.class || null,
                section: details.section || null,
                category: details.category || 'A',
                blood_group: details.bloodGroup || null,
                parent_name: details.parentName || null,
                parent_phone: details.parentPhone || null,
                parent_email: details.parentEmail || null,
                address: details.address || null,
                transport_mode: details.transportMode || null,
                imported_from_zip: true,
                imported_at: new Date().toISOString(),
              },
            },
          };

          if (conflictMode === 'overwrite' && existingRegistration?.id) {
            const identifierFilters = [
              existingRegistration.user_id ? `user_id.eq.${existingRegistration.user_id}` : '',
              student.employeeId ? `student_id.eq.${student.employeeId}` : '',
            ].filter(Boolean);

            if (identifierFilters.length > 0) {
              const { error: descriptorDeleteError } = await supabase
                .from('face_descriptors')
                .delete()
                .or(identifierFilters.join(','));
              if (descriptorDeleteError) throw descriptorDeleteError;
            }

            const { error: updateExistingError } = await supabase
              .from('attendance_records')
              .update(registrationPayload)
              .eq('id', existingRegistration.id);
            if (updateExistingError) throw updateExistingError;
          } else {
            const { error: insertRegistrationError } = await supabase.from('attendance_records').insert(registrationPayload);
            if (insertRegistrationError) throw insertRegistrationError;
          }

          const descriptorRows = restoredPaths.map((path) => ({
            user_id: resolvedUserId,
            image_url: path,
            label: student.name,
            student_id: student.employeeId || null,
            student_name: student.name,
            is_active: true,
            metadata: {
              imported_from_zip: true,
              imported_at: new Date().toISOString(),
              backup_version: importManifest.version,
            },
          }));

          const { error: descriptorInsertError } = await supabase
            .from('face_descriptors')
            .insert(descriptorRows);
          if (descriptorInsertError) throw descriptorInsertError;

          restoredStudents += 1;
        } catch (error) {
          console.warn('Failed to import student from ZIP:', student.employeeId || student.userId, error);
          studentFailed = true;
        }

        if (studentFailed) failedStudents += 1;
      }

      const summary: ImportSummary = {
        zipStudents: importManifest.students.length,
        selectedStudents: selectedCandidates.length,
        importedStudents: restoredStudents,
        skippedExisting,
        failedStudents,
        importedImages: restoredImages,
        failedImages,
      };
      setImportSummary(summary);

      toast({
        title: 'ZIP imported',
        description: `Imported ${restoredStudents} students (${skippedExisting} skipped, ${failedStudents} failed).`,
      });

      await fetchSamples();
      syncDescriptorCache().catch(() => {});
    } catch (error: any) {
      console.error('Failed to import face samples zip:', error);
      toast({
        title: 'Import failed',
        description: error?.message || 'Could not restore students from ZIP.',
        variant: 'destructive',
      });
    } finally {
      setImportingZip(false);
      setImportProgress(null);
      if (importZipInputRef.current) importZipInputRef.current.value = '';
      setImportPreparedZip(null);
      setImportManifest(null);
      setImportCandidates([]);
      setSelectedImportKeys(new Set());
    }
  };

  const selectedImportCount = selectedImportKeys.size;
  const existingInImport = importCandidates.filter((candidate) => candidate.isExisting).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Student Face Samples</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="Search student by name or ID..." />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'confidence')}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="newest">Sort: Newest</option>
              <option value="oldest">Sort: Oldest</option>
              <option value="confidence">Sort: Confidence</option>
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as 'all' | 'slots' | 'captured')}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">Show: All sources</option>
              <option value="slots">Show: Trained Slots only</option>
              <option value="captured">Show: Captured Samples only</option>
            </select>
            <Button variant="outline" size="sm" onClick={() => fetchSamples({ silent: true })}>
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportAllStudentsZip} disabled={exportingZip || loading || groups.length === 0}>
              <Download className="w-4 h-4 mr-1" /> {exportingZip ? 'Exporting…' : 'Export ZIP'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => importZipInputRef.current?.click()}
              disabled={importingZip}
            >
              <Upload className="w-4 h-4 mr-1" /> {importingZip ? 'Importing…' : 'Import ZIP'}
            </Button>
            <input
              ref={importZipInputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(event) => {
                const selectedFile = event.target.files?.[0];
                if (!selectedFile) return;
                prepareImportStudentsZip(selectedFile);
              }}
            />
          </div>

          {exportProgress && (
            <div className="space-y-1 rounded-md border p-3 bg-muted/30">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{exportProgress.label}</span>
                <span>{Math.min(exportProgress.current, exportProgress.total)} / {exportProgress.total}</span>
              </div>
              <Progress value={Math.round((Math.min(exportProgress.current, exportProgress.total) / Math.max(exportProgress.total, 1)) * 100)} />
            </div>
          )}

          {importProgress && (
            <div className="space-y-1 rounded-md border p-3 bg-muted/30">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{importProgress.label}</span>
                <span>{Math.min(importProgress.current, importProgress.total)} / {importProgress.total}</span>
              </div>
              <Progress value={Math.round((Math.min(importProgress.current, importProgress.total) / Math.max(importProgress.total, 1)) * 100)} />
            </div>
          )}

          {importSummary && (
            <div className="rounded-md border p-3 space-y-2 bg-muted/20">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4 text-primary" /> Import results
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">ZIP students: {importSummary.zipStudents}</Badge>
                <Badge variant="secondary">Selected: {importSummary.selectedStudents}</Badge>
                <Badge variant="default">Imported: {importSummary.importedStudents}</Badge>
                <Badge variant="outline">Skipped existing: {importSummary.skippedExisting}</Badge>
                <Badge variant="outline">Failed: {importSummary.failedStudents}</Badge>
                <Badge variant="secondary">Images imported: {importSummary.importedImages}</Badge>
                <Badge variant="outline">Images failed: {importSummary.failedImages}</Badge>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{groups.length} Students</Badge>
            <Badge variant="secondary">{groups.reduce((sum, g) => sum + g.samples.length, 0)} Total Samples</Badge>
          </div>

          <ScrollArea className="max-h-none pr-2">
            <div className="space-y-2">
              {(selectedUserId ? filteredGroups.filter((g) => g.userId === selectedUserId) : filteredGroups).map((g, idx) => (
                <button
                  key={`${g.userId || 'group'}-${g.employeeId || 'student'}-${idx}`}
                  onClick={() => setSelectedUserId(selectedUserId === g.userId ? '' : g.userId)}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${selectedUserId === g.userId ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted/50'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate flex items-center gap-1"><User className="w-3.5 h-3.5" /> {g.name}</p>
                      <p className="text-xs text-muted-foreground truncate">ID: {g.employeeId}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{g.samples.length} photos</Badge>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
          {selectedUserId && (
            <Button variant="outline" size="sm" onClick={() => setSelectedUserId('')} className="w-full">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to all students
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {selectedGroup && (
            <div className="flex items-center justify-between mb-4 pb-3 border-b">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{selectedGroup.name}</p>
                <p className="text-xs text-muted-foreground truncate">ID: {selectedGroup.employeeId}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={selectAllPhotos} disabled={selectedPhotos.length === 0}>
                  Select all photos
                </Button>
                <Button variant="outline" size="sm" onClick={clearSelectedPhotos} disabled={selectedSampleIds.size === 0}>
                  Clear
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDeleteSelectedPhotos}
                  disabled={selectedSamplesForBulkDelete.length === 0}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete selected photos ({selectedSamplesForBulkDelete.length})
                </Button>
                <select
                  value={mergeTargetUserId}
                  onChange={(e) => setMergeTargetUserId(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">Merge into...</option>
                  {groups
                    .filter((g) => g.userId !== selectedGroup.userId)
                    .map((g, idx) => (
                      <option key={`${g.userId || 'group'}-${g.employeeId || 'student'}-${idx}`} value={g.userId}>
                        {g.name} ({g.employeeId})
                      </option>
                    ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReregisterFromExistingData}
                  disabled={reregisteringStudent || selectedGroup.samples.length === 0}
                >
                  <User className="w-4 h-4 mr-1" />
                  {reregisteringStudent ? 'Re-registering...' : 'Re-register'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMergeStudentData}
                  disabled={mergingStudent || !mergeTargetUserId}
                >
                  <ArrowRightLeft className="w-4 h-4 mr-1" />
                  {mergingStudent ? 'Merging...' : 'Merge'}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteStudentProfile}
                  disabled={deletingProfile || !selectedGroup.userId}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  {deletingProfile ? 'Deleting profile...' : 'Delete student profile'}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteStudent}
                  disabled={deletingStudent || selectedGroup.samples.length === 0}
                >
                  <UserX className="w-4 h-4 mr-1" />
                  {deletingStudent ? 'Deleting...' : 'Delete student data'}
                </Button>
              </div>
            </div>
          )}
          {loading ? (
            <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          ) : groups.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              <UserX className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="font-medium text-foreground">No students found in this workspace</p>
              <p className="mt-1">
                This project's database has no registered students or face samples yet. Register students
                on the Register page, or restore a previous export from Admin → Data Backup / the
                “Import students ZIP” button above.
              </p>
            </div>
          ) : !selectedGroup ? (
            <div className="text-center py-10 text-muted-foreground">
              <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
              Select a student to view all model training and recognition images.
            </div>

          ) : selectedSamples.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
              No face samples available for this student.
            </div>
          ) : (
            (() => {
              const renderCard = (sample: FaceSample) => (
                <div key={sample.id} className="rounded-lg border p-3 bg-card">
                  {!isSlot(sample) && (
                    <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selectedSampleIds.has(sample.id)}
                        onChange={() => toggleSampleSelection(sample.id)}
                      />
                      Select photo for bulk delete
                    </label>
                  )}
                  <div className="aspect-square rounded-md overflow-hidden bg-muted mb-2 flex items-center justify-center">
                    {sample.image_url ? (
                      <img src={sample.image_url} alt={`${selectedGroup.name} sample`} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-sm font-medium truncate">{selectedGroup.name}</p>
                  <p className="text-xs text-muted-foreground truncate">ID: {selectedGroup.employeeId}</p>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    {sample.source === 'descriptor_registration' && <Badge variant="default" className="text-[10px]">Model Training (Descriptors)</Badge>}
                    {sample.source === 'record_registration' && <Badge variant="outline" className="text-[10px]">Register Page</Badge>}
                    {sample.source === 'recognition_attendance' && <Badge variant="secondary" className="text-[10px]">Attendance Recognition 80%+</Badge>}
                    {sample.source === 'recognition_gate' && <Badge variant="secondary" className="text-[10px]">Gate Mode Recognition 80%+</Badge>}
                    {typeof sample.confidence_score === 'number' && (
                      <Badge variant="outline" className="text-[10px]">
                        {Math.round(sample.confidence_score * 100)}%
                      </Badge>
                    )}
                    {sample.status && (
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {sample.status}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">{new Date(sample.created_at).toLocaleString()}</p>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    <Button size="sm" variant="outline" className="w-full" onClick={() => openCropper(sample)} disabled={!sample.image_url}>
                      <Scissors className="w-3.5 h-3.5 mr-1" /> Edit / Crop
                    </Button>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => handleSetAsIdCardPhoto(sample)} disabled={!sample.image_url}>
                      Set as ID photo
                    </Button>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => handleDeleteSample(sample)} disabled={!sample.image_url}>
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setTransferSampleId(sample.id);
                        setTransferTargetUserId('');
                      }}
                      disabled={groups.length < 2}
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5 mr-1" /> Transfer
                    </Button>
                  </div>

                  {transferSampleId === sample.id && (
                    <div className="mt-2 rounded-md border border-border p-2 space-y-2 bg-background">
                      <p className="text-xs text-muted-foreground">Transfer this photo to another student</p>
                      <select
                        value={transferTargetUserId}
                        onChange={(e) => setTransferTargetUserId(e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="">Select student...</option>
                        {groups
                          .filter((g) => g.userId !== sample.user_id)
                          .map((g, idx) => (
                            <option key={`${g.userId || 'group'}-${g.employeeId || 'student'}-${idx}`} value={g.userId}>
                              {g.name} ({g.employeeId})
                            </option>
                          ))}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <Button size="sm" onClick={() => handleTransferSample(sample)} disabled={!transferTargetUserId}>
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setTransferSampleId(null);
                            setTransferTargetUserId('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
              return (
                <div className="space-y-6">
                  {showSlots && (<section>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold">Trained Slots (Live Recognition Model)</h3>
                      <Badge variant="default" className="text-[10px]">{selectedSlots.length} slots</Badge>
                    </div>
                    {selectedSlots.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No trained slots — this student is not yet in the live recognition model.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {selectedSlots.map(renderCard)}
                      </div>
                    )}
                  </section>)}
                  {showPhotos && (<section>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold">Captured Samples (Register / Attendance / Gate)</h3>
                      <Badge variant="secondary" className="text-[10px]">{selectedPhotos.length} samples</Badge>
                    </div>
                    {selectedPhotos.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No captured sample photos for this student yet.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {selectedPhotos.map(renderCard)}
                      </div>
                    )}
                  </section>)}
                </div>
              );
            })()
          )}
        </CardContent>
      </Card>

      <ImageCropper
        open={cropOpen}
        imageSrc={cropImageSrc}
        onCancel={() => {
          setCropOpen(false);
          setCropSample(null);
          setCropImageSrc('');
        }}
        onCropComplete={handleCropSave}
      />

      <Dialog open={importDialogOpen} onOpenChange={(open) => (!importingZip ? setImportDialogOpen(open) : null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import students from ZIP</DialogTitle>
            <DialogDescription>
              ZIP contains <strong>{importManifest?.students.length || 0}</strong> students. Already added: <strong>{existingInImport}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md border p-3 space-y-3 bg-muted/20">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Total in ZIP: {importCandidates.length}</Badge>
                <Badge variant="secondary">Selected: {selectedImportCount}</Badge>
                <Badge variant="outline">Already added: {existingInImport}</Badge>
                <Badge variant="outline">New: {Math.max(importCandidates.length - existingInImport, 0)}</Badge>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">If student ID already exists</Label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant={conflictMode === 'skip' ? 'default' : 'outline'} onClick={() => setConflictMode('skip')}>
                    Skip existing
                  </Button>
                  <Button type="button" size="sm" variant={conflictMode === 'overwrite' ? 'default' : 'outline'} onClick={() => setConflictMode('overwrite')}>
                    Overwrite existing
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedImportKeys(new Set(importCandidates.map((candidate) => candidate.key)))}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const onlyNew = importCandidates.filter((candidate) => !candidate.isExisting).map((candidate) => candidate.key);
                    setSelectedImportKeys(new Set(onlyNew));
                  }}
                >
                  Select only new
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedImportKeys(new Set())}>
                  Clear selection
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[340px] rounded-md border p-2">
              <div className="space-y-2">
                {importCandidates.map((candidate) => {
                  const details = candidate.student.details || EMPTY_STUDENT_DETAILS;
                  const checked = selectedImportKeys.has(candidate.key);
                  return (
                    <label key={candidate.key} className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/30">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(nextChecked) => {
                          setSelectedImportKeys((prev) => {
                            const next = new Set(prev);
                            if (nextChecked) next.add(candidate.key);
                            else next.delete(candidate.key);
                            return next;
                          });
                        }}
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium truncate">{candidate.student.name}</p>
                          <Badge variant="outline">ID: {candidate.student.employeeId || 'N/A'}</Badge>
                          <Badge variant="secondary">{candidate.student.sampleCount} images</Badge>
                          {candidate.isExisting ? (
                            <Badge variant="destructive" className="text-[10px] gap-1">
                              <AlertCircle className="w-3 h-3" /> Already added
                            </Badge>
                          ) : (
                            <Badge variant="default" className="text-[10px]">New</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                          <span>Class: {details.class || '-'}</span>
                          <span>Section: {details.section || '-'}</span>
                          <span>Roll: {details.rollNumber || '-'}</span>
                          <span>Blood: {details.bloodGroup || '-'}</span>
                          <span>Parent: {details.parentName || '-'}</span>
                          <span>Phone: {details.parentPhone || '-'}</span>
                          <span>Email: {details.parentEmail || '-'}</span>
                        </div>
                        {candidate.isExisting && (
                          <p className="text-[11px] text-muted-foreground">
                            Existing record: {candidate.existingName || 'Student'} ({candidate.existingStudentId || candidate.existingUserId || 'matched'})
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setImportDialogOpen(false);
                if (importZipInputRef.current) importZipInputRef.current.value = '';
              }}
              disabled={importingZip}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleImportStudentsZip} disabled={importingZip || selectedImportCount === 0}>
              {importingZip ? 'Importing…' : `Import selected (${selectedImportCount})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StudentFaceSamplesManager;