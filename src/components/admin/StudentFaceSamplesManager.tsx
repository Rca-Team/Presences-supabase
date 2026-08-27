import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import {
  Search,
  User,
  Users,
  Scissors,
  RefreshCw,
  ImageIcon,
  Trash2,
  ArrowRightLeft,
  ArrowLeft,
  UserX,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  Cpu,
  Camera,
  ScanFace,
  ShieldCheck,
  Filter,
  Check,
  X,
  FileArchive,
  GraduationCap,
  Eye,
  Maximize2,
  ZoomIn,
  Brain,
  Wand2,
  Merge,
} from 'lucide-react';
import JSZip from 'jszip';
import ImageCropper from './ImageCropper';
import { uploadImage } from '@/services/face-recognition/StorageService';
import {
  syncFromSupabase as syncDescriptorCache,
} from '@/services/face-recognition/DescriptorCacheService';
import {
  loadModels,
  getFaceDescriptor,
  descriptorToString,
  stringToDescriptor,
} from '@/services/face-recognition/ModelService';
import FaceSampleDeduplicationModal from './FaceSampleDeduplicationModal';
import { resolveStudentPhotoUrl } from '@/utils/studentPhotoResolver';
import {
  scanDuplicateFaceSamples,
  executeDeduplication,
} from '@/services/face-recognition/FaceSampleDeduplicationService';

// ---------- Types ----------
export type FaceSample = {
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

export type StudentGroup = {
  userId: string;
  name: string;
  employeeId: string;
  classSection?: string;
  rollNumber?: string;
  avatarUrl?: string | null;
  samples: FaceSample[];
};

export type FaceSamplesZipManifest = {
  version: 2;
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

const FACE_SAMPLE_BUCKETS = ['face-images', 'attendance-training-faces', 'student-registration-faces', 'public'] as const;

// Global URL cache to eliminate duplicate network calls
const GLOBAL_SIGNED_URL_CACHE = new Map<string, string | null>();

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

// High-speed robust URL resolver with multi-bucket & public URL fallback
const resolveFaceSampleUrl = async (rawValue: string | null | undefined): Promise<string | null> => {
  if (!rawValue) return null;
  const value = rawValue.trim();
  if (!value) return null;

  if (value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }

  const cacheKey = value;
  if (GLOBAL_SIGNED_URL_CACHE.has(cacheKey)) {
    const cached = GLOBAL_SIGNED_URL_CACHE.get(cacheKey);
    if (cached) return cached;
  }

  // 1. Try unified student photo resolver
  try {
    const resolved = await resolveStudentPhotoUrl(value);
    if (resolved && resolved !== value) {
      GLOBAL_SIGNED_URL_CACHE.set(cacheKey, resolved);
      return resolved;
    }
  } catch (err) {
    console.warn('resolveStudentPhotoUrl error:', err);
  }

  // 2. If it's already an HTTP URL (and not expired signed), use it directly
  if (/^https?:\/\//i.test(value) && !value.includes('/storage/v1/object/sign/')) {
    GLOBAL_SIGNED_URL_CACHE.set(cacheKey, value);
    return value;
  }

  // 3. Multi-bucket candidate generation
  const candidates: Array<{ bucket: string; path: string }> = [];
  for (const bucket of FACE_SAMPLE_BUCKETS) {
    const extracted = parseStoragePathFromUrl(value, bucket);
    if (extracted) candidates.push({ bucket, path: extracted });
  }

  if (candidates.length === 0) {
    const normalized = value.replace(/^\/+/, '');
    const prefixed = FACE_SAMPLE_BUCKETS.find((b) => normalized.startsWith(`${b}/`));
    if (prefixed) {
      candidates.push({ bucket: prefixed, path: normalized.slice(prefixed.length + 1) });
    }
    const cleanPath = normalized.replace(/^(?:faces|face-images|student-registration-faces|attendance-training-faces)\//, '');
    candidates.push({ bucket: 'face-images', path: `faces/${cleanPath}` });
    candidates.push({ bucket: 'face-images', path: cleanPath });
    for (const b of FACE_SAMPLE_BUCKETS) {
      candidates.push({ bucket: b, path: normalized });
    }
  }

  // Try public URL
  for (const cand of candidates) {
    try {
      const { data } = supabase.storage.from(cand.bucket).getPublicUrl(cand.path);
      if (data?.publicUrl) {
        GLOBAL_SIGNED_URL_CACHE.set(cacheKey, data.publicUrl);
        return data.publicUrl;
      }
    } catch {
      // Continue
    }
  }

  // Try signed URL
  for (const cand of candidates) {
    try {
      const { data, error } = await supabase.storage.from(cand.bucket).createSignedUrl(cand.path, 3600);
      if (!error && data?.signedUrl) {
        GLOBAL_SIGNED_URL_CACHE.set(cacheKey, data.signedUrl);
        return data.signedUrl;
      }
    } catch {
      // Continue
    }
  }

  GLOBAL_SIGNED_URL_CACHE.set(cacheKey, value);
  return value;
};

// ---------- Component ----------
const StudentFaceSamplesManager: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [filterTab, setFilterTab] = useState<'all' | 'trained' | 'untrained'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'photos' | 'newest'>('photos');

  // Photo Selection & Operations
  const [selectedSampleIds, setSelectedSampleIds] = useState<Set<string>>(new Set());
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSample, setCropSample] = useState<FaceSample | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string>('');
  
  // Transfer Dialog
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferSample, setTransferSample] = useState<FaceSample | null>(null);
  const [transferTargetUserId, setTransferTargetUserId] = useState<string>('');

  // Merge Dialog
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeTargetUserId, setMergeTargetUserId] = useState<string>('');
  const [mergingStudent, setMergingStudent] = useState(false);

  // States for operations
  const [deletingStudent, setDeletingStudent] = useState(false);
  const [reregisteringStudent, setReregisteringStudent] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [exportProgress, setExportProgress] = useState<OperationProgress | null>(null);

  // ZIP Import states
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importingZip, setImportingZip] = useState(false);
  const [importProgress, setImportProgress] = useState<OperationProgress | null>(null);
  const [importManifest, setImportManifest] = useState<FaceSamplesZipManifest | null>(null);
  const [importCandidates, setImportCandidates] = useState<ImportCandidate[]>([]);
  const [selectedImportKeys, setSelectedImportKeys] = useState<Set<string>>(new Set());
  const [conflictMode, setConflictMode] = useState<'overwrite' | 'skip'>('skip');
  const importZipInputRef = useRef<HTMLInputElement | null>(null);

  // AI Deduplication states
  const [dedupModalOpen, setDedupModalOpen] = useState(false);
  const [dedupTargetUserId, setDedupTargetUserId] = useState<string | undefined>(undefined);
  const [quickDeduplicating, setQuickDeduplicating] = useState(false);

  // Database Root-Cause Duplicate Merger states
  const [mergingAllDuplicates, setMergingAllDuplicates] = useState(false);

  // Train from All Photos states
  const [trainingStudent, setTrainingStudent] = useState(false);
  const [trainingAllStudents, setTrainingAllStudents] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState<OperationProgress | null>(null);

  // Full-Screen Image Preview Modal states
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');

  // Cache of resolved image URLs for active view
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});

  // Fetch all face samples & students
  const fetchSamples = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoading(true);
    try {
      const [descriptorsRes, attendanceRes, profilesRes] = await Promise.all([
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
          .select('user_id, display_name, full_name, employee_id, roll_number, admission_number, avatar_url, class, section')
          .not('user_id', 'is', null),
      ]);

      if (descriptorsRes.error) throw descriptorsRes.error;
      if (attendanceRes.error) throw attendanceRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const descriptorRows = descriptorsRes.data || [];
      const attendanceRows = attendanceRes.data || [];
      const profileRows = profilesRes.data || [];

      const normalizeNameKey = (raw?: string | null): string => {
        if (!raw) return '';
        return raw
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .replace(/[^a-z0-9 ]/gi, '');
      };

      const profileMapByUserId = new Map<string, any>();
      const profileMapByEmpId = new Map<string, any>();
      const profileMapByName = new Map<string, any>();

      profileRows.forEach((p) => {
        if (p.user_id) profileMapByUserId.set(p.user_id, p);
        if (p.employee_id) profileMapByEmpId.set(String(p.employee_id).trim().toLowerCase(), p);
        if (p.roll_number) profileMapByEmpId.set(String(p.roll_number).trim().toLowerCase(), p);
        if (p.admission_number) profileMapByEmpId.set(String(p.admission_number).trim().toLowerCase(), p);
        if (p.full_name) profileMapByName.set(normalizeNameKey(p.full_name), p);
        if (p.display_name) profileMapByName.set(normalizeNameKey(p.display_name), p);
      });

      // Index attendance records for additional ID, class, and photo metadata
      const regMetaByName = new Map<string, any>();
      attendanceRows.forEach((row: any) => {
        const di = (row.device_info as Record<string, any>) || {};
        const meta = (di.metadata as Record<string, any>) || {};
        const empId = meta.employee_id || meta.roll_number || meta.admission_number || di.employee_id || row.student_id || '';
        const name = meta.name || di.name || row.student_name || '';
        const classSec = meta.class ? `${meta.class}${meta.section ? `-${meta.section}` : ''}` : di.class_section || undefined;
        const norm = normalizeNameKey(name);
        if (norm && (!regMetaByName.has(norm) || row.status === 'registered' || row.image_url)) {
          regMetaByName.set(norm, {
            employeeId: empId,
            classSection: classSec,
            imageUrl: row.image_url,
            userId: row.user_id,
            name,
          });
        }
      });

      const studentGroupsMap = new Map<string, StudentGroup>();

      // Robust helper to consolidate duplicate profiles into a single canonical group
      const getOrCreateGroup = (userId: string, empId: string, fallbackName: string): StudentGroup => {
        const normName = normalizeNameKey(fallbackName);
        const normEmpId = empId ? String(empId).trim().toLowerCase() : '';

        // Check if we ALREADY have a group indexed by userId, empId, or normalized name
        let existing: StudentGroup | undefined;
        if (userId && studentGroupsMap.has(userId)) existing = studentGroupsMap.get(userId);
        else if (normEmpId && studentGroupsMap.has(`emp:${normEmpId}`)) existing = studentGroupsMap.get(`emp:${normEmpId}`);
        else if (normName && studentGroupsMap.has(`name:${normName}`)) existing = studentGroupsMap.get(`name:${normName}`);

        const profile =
          (userId ? profileMapByUserId.get(userId) : null) ||
          (normEmpId ? profileMapByEmpId.get(normEmpId) : null) ||
          (normName ? profileMapByName.get(normName) : null);

        const regMeta = normName ? regMetaByName.get(normName) : null;

        const finalUserId = existing?.userId || profile?.user_id || regMeta?.userId || userId || '';
        const finalEmpId = existing?.employeeId || profile?.employee_id || profile?.roll_number || profile?.admission_number || empId || regMeta?.employeeId || '';
        const rawName = (existing?.name && existing.name !== 'Student')
          ? existing.name
          : (profile?.full_name || profile?.display_name || (fallbackName && fallbackName !== 'Student' && fallbackName !== 'Unknown' ? fallbackName : regMeta?.name || 'Student'));
        const name = rawName || 'Student';
        const classSec = existing?.classSection || (profile?.class ? `${profile.class}${profile?.section ? `-${profile.section}` : ''}` : regMeta?.classSection || undefined);
        const avatar = existing?.avatarUrl || profile?.avatar_url || regMeta?.imageUrl || null;

        if (existing) {
          if (!existing.userId && finalUserId) existing.userId = finalUserId;
          if (!existing.employeeId && finalEmpId) existing.employeeId = finalEmpId;
          if (!existing.classSection && classSec) existing.classSection = classSec;
          if (!existing.avatarUrl && avatar) existing.avatarUrl = avatar;
          if ((!existing.name || existing.name === 'Student') && name !== 'Student') existing.name = name;

          // Cross-index all aliases
          if (finalUserId) studentGroupsMap.set(finalUserId, existing);
          if (userId) studentGroupsMap.set(userId, existing);
          if (finalEmpId) studentGroupsMap.set(`emp:${finalEmpId.toLowerCase()}`, existing);
          if (normEmpId) studentGroupsMap.set(`emp:${normEmpId}`, existing);
          if (normName) studentGroupsMap.set(`name:${normName}`, existing);

          return existing;
        }

        const newGroup: StudentGroup = {
          userId: finalUserId,
          name,
          employeeId: finalEmpId,
          classSection: classSec,
          rollNumber: profile?.roll_number,
          avatarUrl: avatar,
          samples: [],
        };

        const primaryKey = finalUserId || (finalEmpId ? `emp:${finalEmpId.toLowerCase()}` : `name:${normName}`);
        studentGroupsMap.set(primaryKey, newGroup);
        if (finalUserId) studentGroupsMap.set(finalUserId, newGroup);
        if (userId) studentGroupsMap.set(userId, newGroup);
        if (finalEmpId) studentGroupsMap.set(`emp:${finalEmpId.toLowerCase()}`, newGroup);
        if (normEmpId) studentGroupsMap.set(`emp:${normEmpId}`, newGroup);
        if (normName) studentGroupsMap.set(`name:${normName}`, newGroup);

        return newGroup;
      };

      // 1. Process Descriptors (Live Model Slots)
      descriptorRows.forEach((row: any) => {
        const group = getOrCreateGroup(row.user_id, row.student_id, row.label || 'Trained Student');
        if (!group.samples.some(s => s.id === row.id)) {
          group.samples.push({
            id: row.id,
            user_id: row.user_id,
            label: row.label,
            image_url: row.image_url,
            created_at: row.created_at,
            source: 'descriptor_registration',
            source_table: 'face_descriptors',
          });
        }
      });

      // 2. Process Attendance Records (Captured Photos)
      attendanceRows.forEach((row: any) => {
        if (!row.image_url) return;
        const di = (row.device_info as Record<string, any>) || {};
        const meta = (di.metadata as Record<string, any>) || {};
        const empId = meta.employee_id || meta.roll_number || di.employee_id || row.student_id || '';
        const name = meta.name || di.name || row.student_name || 'Student';

        const group = getOrCreateGroup(row.user_id, empId, name);

        let source: FaceSample['source'] = 'recognition_attendance';
        if (row.status === 'registered') source = 'record_registration';
        else if (di.mode === 'gate' || di.gate) source = 'recognition_gate';

        if (!group.samples.some(s => s.id === row.id || (s.image_url && s.image_url === row.image_url))) {
          group.samples.push({
            id: row.id,
            user_id: row.user_id || group.userId,
            label: name,
            image_url: row.image_url,
            created_at: row.timestamp || new Date().toISOString(),
            source,
            source_table: 'attendance_records',
            confidence_score: row.confidence_score,
            status: row.status,
          });
        }
      });

      // 3. Ensure profiles with no samples are also listed
      profileRows.forEach((p) => {
        getOrCreateGroup(p.user_id, p.employee_id || p.roll_number || '', p.full_name || p.display_name || 'Student');
      });

      // Ensure avatarUrl is populated for all students if they have any photo samples
      studentGroupsMap.forEach((group) => {
        if (!group.avatarUrl && group.samples.length > 0) {
          const sampleWithImg = group.samples.find((s) => s.image_url);
          if (sampleWithImg?.image_url) {
            group.avatarUrl = sampleWithImg.image_url;
          }
        }
      });

      // Deduplicate unique student group references
      const uniqueGroups = Array.from(new Set(studentGroupsMap.values()));
      setGroups(uniqueGroups);

      // Auto-select first student if none selected
      if (uniqueGroups.length > 0 && !selectedUserId) {
        setSelectedUserId(uniqueGroups[0].userId || uniqueGroups[0].employeeId);
      }
    } catch (err: any) {
      console.error('Failed fetching face samples:', err);
      toast({
        title: 'Error Loading Face Samples',
        description: err.message || 'Could not load face samples database.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedUserId, toast]);

  useEffect(() => {
    fetchSamples();
  }, [fetchSamples]);

  // Active Selected Student Group
  const selectedGroup = useMemo(() => {
    if (!selectedUserId) return null;
    return groups.find((g) => g.userId === selectedUserId || g.employeeId === selectedUserId) || null;
  }, [groups, selectedUserId]);

  // Resolve Signed URLs for selected group's samples in parallel
  useEffect(() => {
    if (!selectedGroup) return;

    let isMounted = true;
    const unresolved = selectedGroup.samples.filter((s) => s.image_url && !resolvedUrls[s.image_url]);

    if (unresolved.length === 0) return;

    Promise.allSettled(
      unresolved.map(async (sample) => {
        if (!sample.image_url) return null;
        const resolved = await resolveFaceSampleUrl(sample.image_url);
        return { key: sample.image_url, url: resolved };
      })
    ).then((results) => {
      if (!isMounted) return;
      const updates: Record<string, string> = {};
      results.forEach((res) => {
        if (res.status === 'fulfilled' && res.value && res.value.url) {
          updates[res.value.key] = res.value.url;
        }
      });
      if (Object.keys(updates).length > 0) {
        setResolvedUrls((prev) => ({ ...prev, ...updates }));
      }
    });

    return () => {
      isMounted = false;
    };
  }, [selectedGroup, resolvedUrls]);

  // Filtered & Sorted Student Groups
  const filteredGroups = useMemo(() => {
    return groups
      .filter((g) => {
        const matchesSearch =
          !search ||
          g.name.toLowerCase().includes(search.toLowerCase()) ||
          g.employeeId.toLowerCase().includes(search.toLowerCase()) ||
          (g.classSection && g.classSection.toLowerCase().includes(search.toLowerCase()));

        if (!matchesSearch) return false;

        const hasSlots = g.samples.some((s) => s.source_table === 'face_descriptors');
        if (filterTab === 'trained') return hasSlots;
        if (filterTab === 'untrained') return !hasSlots;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'photos') return b.samples.length - a.samples.length;
        return 0;
      });
  }, [groups, search, filterTab, sortBy]);

  // Separate Trained Slots vs Captured Samples for active student
  const { trainedSlots, capturedPhotos } = useMemo(() => {
    if (!selectedGroup) return { trainedSlots: [], capturedPhotos: [] };
    const trained = selectedGroup.samples.filter((s) => s.source_table === 'face_descriptors');
    const captured = selectedGroup.samples.filter((s) => s.source_table === 'attendance_records');
    return { trainedSlots: trained, capturedPhotos: captured };
  }, [selectedGroup]);

  // Photo Crop Modal Handler
  const openCropper = (sample: FaceSample) => {
    const url = sample.image_url ? resolvedUrls[sample.image_url] || sample.image_url : '';
    if (!url) {
      toast({ title: 'Image Not Available', description: 'Could not load photo for editing.', variant: 'destructive' });
      return;
    }
    setCropSample(sample);
    setCropImageSrc(url);
    setCropOpen(true);
  };

  const handleCropSave = async (croppedBlob: Blob) => {
    if (!cropSample || !selectedGroup) return;

    try {
      const folderId = selectedGroup.userId || selectedGroup.employeeId || 'faces';
      const file = new File([croppedBlob], `sample_${cropSample.id}_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url = await uploadImage(file, `students/${folderId}/${file.name}`);

      const { error } = await supabase
        .from(cropSample.source_table)
        .update({ image_url: url })
        .eq('id', cropSample.id);

      if (error) throw error;

      toast({ title: 'Photo Calibrated', description: 'Sample was cropped and saved to cloud storage.' });
      setCropOpen(false);
      setCropSample(null);
      setCropImageSrc('');
      fetchSamples({ silent: true });
    } catch (err: any) {
      console.error('Failed saving cropped photo:', err);
      toast({ title: 'Crop Failed', description: err.message || 'Could not save cropped image.', variant: 'destructive' });
    }
  };

  // Set as Primary ID Photo
  const handleSetAsIdPhoto = async (sample: FaceSample) => {
    const persistentRef = toPersistentImageReference(sample.image_url);
    if (!selectedGroup || !persistentRef) {
      toast({ title: 'No Photo', description: 'Photo reference is missing.', variant: 'destructive' });
      return;
    }

    try {
      if (selectedGroup.userId) {
        await supabase
          .from('profiles')
          .update({ avatar_url: persistentRef })
          .eq('user_id', selectedGroup.userId);
      }

      toast({ title: 'ID Photo Updated', description: `${selectedGroup.name}'s primary ID photo has been set.` });
      fetchSamples({ silent: true });
    } catch (err: any) {
      toast({ title: 'Update Failed', description: err.message || 'Could not update ID photo.', variant: 'destructive' });
    }
  };

  // Delete Single Sample
  const handleDeleteSample = async (sample: FaceSample) => {
    const isSlot = sample.source_table === 'face_descriptors';
    const confirm = window.confirm(`Delete this ${isSlot ? 'trained model slot' : 'captured photo'}?`);
    if (!confirm) return;

    try {
      if (isSlot) {
        await supabase.from('face_descriptors').delete().eq('id', sample.id);
      } else {
        await supabase.from('attendance_records').update({ image_url: null }).eq('id', sample.id);
      }

      toast({ title: 'Photo Deleted', description: 'The sample was removed.' });
      fetchSamples({ silent: true });
      if (isSlot) syncDescriptorCache().catch(() => {});
    } catch (err: any) {
      toast({ title: 'Delete Failed', description: err.message, variant: 'destructive' });
    }
  };

  // Bulk Delete Selected Samples
  const handleBulkDelete = async () => {
    if (selectedSampleIds.size === 0) return;
    const confirm = window.confirm(`Delete all ${selectedSampleIds.size} selected photos?`);
    if (!confirm) return;

    try {
      const ids = Array.from(selectedSampleIds);
      const slotIds = ids.filter((id) => trainedSlots.some((s) => s.id === id));
      const recordIds = ids.filter((id) => capturedPhotos.some((s) => s.id === id));

      if (slotIds.length > 0) {
        await supabase.from('face_descriptors').delete().in('id', slotIds);
      }
      if (recordIds.length > 0) {
        await supabase.from('attendance_records').update({ image_url: null }).in('id', recordIds);
      }

      toast({ title: 'Bulk Delete Complete', description: `Pruned ${ids.length} sample photos.` });
      setSelectedSampleIds(new Set());
      fetchSamples({ silent: true });
      if (slotIds.length > 0) syncDescriptorCache().catch(() => {});
    } catch (err: any) {
      toast({ title: 'Bulk Delete Failed', description: err.message, variant: 'destructive' });
    }
  };

  // Transfer Sample to another student
  const handleTransferSample = async () => {
    if (!transferSample || !transferTargetUserId) return;

    try {
      const target = groups.find((g) => g.userId === transferTargetUserId || g.employeeId === transferTargetUserId);
      const updatePayload: Record<string, any> = { user_id: transferTargetUserId };

      if (transferSample.source_table === 'face_descriptors' && target) {
        updatePayload.label = target.name;
        if (target.employeeId) updatePayload.student_id = target.employeeId;
      }

      const { error } = await supabase
        .from(transferSample.source_table)
        .update(updatePayload)
        .eq('id', transferSample.id);

      if (error) throw error;

      toast({ title: 'Photo Reassigned', description: `Transferred photo to ${target?.name || 'student'}.` });
      setTransferDialogOpen(false);
      setTransferSample(null);
      setTransferTargetUserId('');
      fetchSamples({ silent: true });
      if (transferSample.source_table === 'face_descriptors') syncDescriptorCache().catch(() => {});
    } catch (err: any) {
      toast({ title: 'Transfer Failed', description: err.message, variant: 'destructive' });
    }
  };

  // 1-Click Export Face Samples ZIP
  const handleExportZip = async () => {
    setExportingZip(true);
    setExportProgress({ label: 'Generating Face Samples ZIP Package...', current: 0, total: groups.length });

    try {
      const zip = new JSZip();
      const studentsFolder = zip.folder('students');

      const manifest: FaceSamplesZipManifest = {
        version: 2,
        exportedAt: new Date().toISOString(),
        app: 'Presences AI Face Studio',
        students: [],
      };

      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        setExportProgress({
          label: `Packaging student photos [${i + 1}/${groups.length}]: ${group.name}`,
          current: i + 1,
          total: groups.length,
        });

        const studentEntry: FaceSamplesZipManifest['students'][number] = {
          userId: group.userId,
          employeeId: group.employeeId,
          name: group.name,
          details: {
            class: group.classSection || null,
            section: null,
            rollNumber: group.rollNumber || null,
            category: null,
            bloodGroup: null,
            parentName: null,
            parentPhone: null,
            parentEmail: null,
            address: null,
            transportMode: null,
            phone: null,
            email: null,
            profileName: group.name,
            username: null,
            metadata: {},
          },
          sampleCount: group.samples.length,
          samples: [],
        };

        const safeFolder = `${group.employeeId || group.userId || 'student'}_${group.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const folder = studentsFolder?.folder(safeFolder);

        for (let j = 0; j < group.samples.length; j++) {
          const sample = group.samples[j];
          if (!sample.image_url) continue;

          try {
            const url = resolvedUrls[sample.image_url] || (await resolveFaceSampleUrl(sample.image_url));
            if (url) {
              const res = await fetch(url);
              const blob = await res.blob();
              const fileName = `sample_${j + 1}_${sample.source}.jpg`;
              folder?.file(fileName, blob);

              studentEntry.samples.push({
                path: `students/${safeFolder}/${fileName}`,
                source: sample.source,
                createdAt: sample.created_at,
                status: sample.status,
              });
            }
          } catch {
            // Skip unresolvable photo
          }
        }

        manifest.students.push(studentEntry);
      }

      zip.file('manifest.json', JSON.stringify(manifest, null, 2));

      setExportProgress({ label: 'Compressing ZIP package...', current: groups.length, total: groups.length });
      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });

      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
      const downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `presences-face-samples-${stamp}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);

      toast({ title: 'Export Complete', description: `Exported ${groups.length} students face samples package.` });
    } catch (err: any) {
      toast({ title: 'Export Failed', description: err.message, variant: 'destructive' });
    } finally {
      setExportingZip(false);
      setExportProgress(null);
    }
  };

  // Direct 1-Click Action to scan & remove all duplicate face photos
  const handleQuickRemoveAllDuplicates = async () => {
    setQuickDeduplicating(true);
    try {
      const scan = await scanDuplicateFaceSamples();
      if (scan.totalDuplicatesFound === 0) {
        toast({
          title: 'No Duplicates Found',
          description: 'Your database has zero duplicate face photo waste.',
        });
        return;
      }

      const kbSaved = Math.round(scan.estimatedBytesSaved / 1024);
      const confirm = window.confirm(
        `⚡ Remove All Duplicates:\n\nFound ${scan.totalDuplicatesFound} duplicate photos across ${scan.studentsWithDuplicates} students.\n\nRemove all duplicates now to safely reclaim ~${kbSaved} KB of Supabase storage?`
      );
      if (!confirm) return;

      const result = await executeDeduplication();
      if (result.success) {
        toast({
          title: '⚡ All Duplicates Removed',
          description: `Successfully pruned ${result.totalDuplicatesRemoved} duplicate photo records and reclaimed storage!`,
        });
        fetchSamples({ silent: true });
      } else {
        toast({
          title: 'Deduplication Result',
          description: result.errors[0] || 'Cleaned available duplicates.',
        });
        fetchSamples({ silent: true });
      }
    } catch (err: any) {
      toast({
        title: 'Deduplication Failed',
        description: err.message || 'Could not remove duplicates.',
        variant: 'destructive',
      });
    } finally {
      setQuickDeduplicating(false);
    }
  };

  // 1-Click Root-Cause Database Profile Merging
  const handleMergeAllDatabaseDuplicates = async () => {
    setMergingAllDuplicates(true);
    try {
      const [profilesRes, descriptorsRes, attendanceRes] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('face_descriptors').select('id, user_id, student_id, label, image_url, descriptor'),
        supabase.from('attendance_records').select('id, user_id, student_id, student_name, image_url'),
      ]);

      const profiles = profilesRes.data || [];
      const descriptors = descriptorsRes.data || [];
      const attendance = attendanceRes.data || [];

      const normalizeName = (raw?: string | null) => {
        if (!raw) return '';
        return raw.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/gi, '');
      };

      // Group profiles by normalized name or roll number
      const nameGroups = new Map<string, any[]>();
      profiles.forEach((p) => {
        const norm = normalizeName(p.full_name || p.display_name);
        const emp = p.employee_id || p.roll_number || p.admission_number ? `emp:${String(p.employee_id || p.roll_number || p.admission_number).toLowerCase().trim()}` : '';
        const key = norm || emp || p.user_id;
        if (!nameGroups.has(key)) nameGroups.set(key, []);
        nameGroups.get(key)!.push(p);
      });

      let mergedCount = 0;
      let profilesDeleted = 0;

      for (const [, groupList] of nameGroups.entries()) {
        if (groupList.length > 1) {
          // Select canonical primary profile: one with avatar, roll number, or email
          const canonical = groupList.find((p) => p.avatar_url && p.roll_number) ||
                            groupList.find((p) => p.avatar_url) ||
                            groupList.find((p) => p.roll_number) ||
                            groupList[0];

          const duplicateProfiles = groupList.filter((p) => p.user_id !== canonical.user_id);
          const duplicateUserIds = duplicateProfiles.map((p) => p.user_id).filter(Boolean);

          if (duplicateUserIds.length > 0) {
            // 1. Reassign descriptors to canonical user_id
            await supabase
              .from('face_descriptors')
              .update({
                user_id: canonical.user_id,
                student_id: canonical.employee_id || canonical.roll_number || canonical.admission_number || null,
                label: canonical.full_name || canonical.display_name,
              })
              .in('user_id', duplicateUserIds);

            // 2. Reassign attendance records to canonical user_id
            await supabase
              .from('attendance_records')
              .update({
                user_id: canonical.user_id,
                student_id: canonical.employee_id || canonical.roll_number || canonical.admission_number || null,
                student_name: canonical.full_name || canonical.display_name,
              })
              .in('user_id', duplicateUserIds);

            // 3. Delete secondary duplicate profile records from DB
            await supabase.from('profiles').delete().in('user_id', duplicateUserIds);
            profilesDeleted += duplicateUserIds.length;
            mergedCount++;
          }
        }
      }

      // Also clean duplicate photo slots
      const dedupResult = await executeDeduplication();

      await syncDescriptorCache(true);
      await fetchSamples({ silent: true });

      toast({
        title: '⚡ Root Cause Database Cleaned',
        description: `Successfully consolidated ${mergedCount} duplicate student profiles in DB (${profilesDeleted} duplicate profile records removed, ${dedupResult.totalDuplicatesRemoved} redundant photo slots pruned).`,
      });
    } catch (err: any) {
      console.error('Merge DB duplicates error:', err);
      toast({
        title: 'Database Merge Failed',
        description: err.message || 'Could not complete database profile merge.',
        variant: 'destructive',
      });
    } finally {
      setMergingAllDuplicates(false);
    }
  };

  // Train a single student from ALL their photos
  const handleTrainStudentFromAllPhotos = async (group: StudentGroup) => {
    if (!group) return;
    setTrainingStudent(true);
    try {
      await loadModels();

      const uniquePhotoUrls = Array.from(
        new Set(
          [group.avatarUrl, ...group.samples.map((s) => s.image_url)].filter(Boolean) as string[]
        )
      );

      if (uniquePhotoUrls.length === 0) {
        toast({
          title: 'No Photos Available',
          description: 'This student does not have any photo samples to train from.',
          variant: 'destructive',
        });
        return;
      }

      let trainedCount = 0;
      const extractedDescriptors: Float32Array[] = [];

      for (let i = 0; i < uniquePhotoUrls.length; i++) {
        const rawUrl = uniquePhotoUrls[i];
        const resolved = resolvedUrls[rawUrl] || (await resolveFaceSampleUrl(rawUrl));
        if (!resolved) continue;

        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject();
            img.src = resolved;
          });

          const descriptor = await getFaceDescriptor(img, 40);
          if (descriptor) {
            extractedDescriptors.push(descriptor);

            const alreadyExists = group.samples.some(
              (s) => s.source_table === 'face_descriptors' && s.image_url === rawUrl
            );

            if (!alreadyExists) {
              await supabase.from('face_descriptors').insert({
                user_id: group.userId,
                student_id: group.employeeId || null,
                label: group.name,
                image_url: rawUrl,
                descriptor: descriptorToString(descriptor),
              });
              trainedCount++;
            }
          }
        } catch (e) {
          console.warn('Could not extract descriptor from photo:', e);
        }
      }

      // If multiple descriptors were extracted, compute master ensemble average
      if (extractedDescriptors.length > 1) {
        const dim = extractedDescriptors[0].length;
        const avg = new Float32Array(dim);
        for (const desc of extractedDescriptors) {
          for (let d = 0; d < dim; d++) {
            avg[d] += desc[d] / extractedDescriptors.length;
          }
        }

        await supabase.from('face_descriptors').upsert(
          {
            user_id: group.userId,
            student_id: group.employeeId || null,
            label: `${group.name} (Calibrated Ensemble)`,
            image_url: group.avatarUrl || uniquePhotoUrls[0],
            descriptor: descriptorToString(avg),
          },
          { onConflict: 'user_id, label' }
        );
      }

      await syncDescriptorCache(true);
      await fetchSamples({ silent: true });

      toast({
        title: '🧠 Neural Model Calibrated',
        description: `Successfully trained ${group.name} from ${extractedDescriptors.length} photos (${trainedCount} new descriptor vectors indexed)!`,
      });
    } catch (err: any) {
      console.error('Train student error:', err);
      toast({
        title: 'Training Failed',
        description: err.message || 'Could not complete face training.',
        variant: 'destructive',
      });
    } finally {
      setTrainingStudent(false);
    }
  };

  // Batch Train ALL Students from ALL their photos
  const handleTrainAllStudentsFromAllPhotos = async () => {
    if (groups.length === 0) return;
    setTrainingAllStudents(true);
    setTrainingProgress({ label: 'Initializing neural models...', current: 0, total: groups.length });

    try {
      await loadModels();
      let totalNewSlots = 0;

      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        setTrainingProgress({
          label: `Training ${group.name} (${i + 1}/${groups.length})...`,
          current: i + 1,
          total: groups.length,
        });

        const uniquePhotoUrls = Array.from(
          new Set(
            [group.avatarUrl, ...group.samples.map((s) => s.image_url)].filter(Boolean) as string[]
          )
        );

        const extractedDescriptors: Float32Array[] = [];

        for (const rawUrl of uniquePhotoUrls) {
          try {
            const resolved = resolvedUrls[rawUrl] || (await resolveFaceSampleUrl(rawUrl));
            if (!resolved) continue;

            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => reject();
              img.src = resolved;
            });

            const descriptor = await getFaceDescriptor(img, 40);
            if (descriptor) {
              extractedDescriptors.push(descriptor);
              const alreadyExists = group.samples.some(
                (s) => s.source_table === 'face_descriptors' && s.image_url === rawUrl
              );
              if (!alreadyExists) {
                await supabase.from('face_descriptors').insert({
                  user_id: group.userId,
                  student_id: group.employeeId || null,
                  label: group.name,
                  image_url: rawUrl,
                  descriptor: descriptorToString(descriptor),
                });
                totalNewSlots++;
              }
            }
          } catch {
            // Skip unprocessable photo
          }
        }

        if (extractedDescriptors.length > 1) {
          const dim = extractedDescriptors[0].length;
          const avg = new Float32Array(dim);
          for (const desc of extractedDescriptors) {
            for (let d = 0; d < dim; d++) {
              avg[d] += desc[d] / extractedDescriptors.length;
            }
          }
          await supabase.from('face_descriptors').upsert(
            {
              user_id: group.userId,
              student_id: group.employeeId || null,
              label: `${group.name} (Calibrated Ensemble)`,
              image_url: group.avatarUrl || uniquePhotoUrls[0],
              descriptor: descriptorToString(avg),
            },
            { onConflict: 'user_id, label' }
          );
        }
      }

      await syncDescriptorCache(true);
      await fetchSamples({ silent: true });

      toast({
        title: '🧠 Neural Models Trained',
        description: `Trained all ${groups.length} students across all photo captures (+${totalNewSlots} new descriptor vectors indexed)!`,
      });
    } catch (err: any) {
      toast({
        title: 'Batch Training Failed',
        description: err.message || 'Could not complete batch training.',
        variant: 'destructive',
      });
    } finally {
      setTrainingAllStudents(false);
      setTrainingProgress(null);
    }
  };

  const totalSamplesCount = useMemo(() => groups.reduce((sum, g) => sum + g.samples.length, 0), [groups]);
  const totalModelSlots = useMemo(() => groups.reduce((sum, g) => sum + g.samples.filter((s) => s.source_table === 'face_descriptors').length, 0), [groups]);

  return (
    <div className="space-y-6">
      {/* Studio Header Card */}
      <Card className="rounded-3xl border border-border/60 bg-card/70 backdrop-blur-xl shadow-xl overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                  <ScanFace className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>
                    Face Training Studio
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Review and calibrate AI model weights, training slots, and recognition photos per student.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs font-bold gap-1.5">
                <Users className="h-3.5 w-3.5 text-primary" /> {groups.length} Students
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-xs font-bold gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-emerald-500" /> {totalModelSlots} Trained Slots
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-xs font-bold gap-1.5">
                <Camera className="h-3.5 w-3.5 text-blue-500" /> {totalSamplesCount} Total Photos
              </Badge>

              <Button
                variant="default"
                size="sm"
                onClick={handleMergeAllDatabaseDuplicates}
                disabled={loading || mergingAllDuplicates || groups.length === 0}
                className="rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs gap-1.5 shadow-md shadow-purple-500/20 active:scale-95 transition-all"
              >
                <Merge className={`h-3.5 w-3.5 ${mergingAllDuplicates ? 'animate-spin' : ''}`} />
                {mergingAllDuplicates ? 'Merging DB...' : '⚡ Merge DB Duplicates'}
              </Button>

              <Button
                variant="default"
                size="sm"
                onClick={handleTrainAllStudentsFromAllPhotos}
                disabled={loading || trainingAllStudents || groups.length === 0}
                className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
              >
                <Brain className={`h-3.5 w-3.5 ${trainingAllStudents ? 'animate-spin' : ''}`} />
                {trainingAllStudents ? 'Training All...' : '🧠 Train All from All Photos'}
              </Button>

              <Button
                variant="default"
                size="sm"
                onClick={handleQuickRemoveAllDuplicates}
                disabled={loading || quickDeduplicating || groups.length === 0}
                className="rounded-2xl bg-gradient-to-r from-red-500 to-amber-600 hover:from-red-600 hover:to-amber-700 text-white font-bold text-xs gap-1.5 shadow-md shadow-red-500/20 active:scale-95 transition-all"
              >
                <Trash2 className={`h-3.5 w-3.5 ${quickDeduplicating ? 'animate-spin' : ''}`} />
                {quickDeduplicating ? 'Cleaning...' : 'Remove Duplicate Photos'}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDedupTargetUserId(undefined);
                  setDedupModalOpen(true);
                }}
                disabled={loading || groups.length === 0}
                className="rounded-2xl border-primary/40 bg-primary/10 gap-1.5 text-xs font-bold text-primary hover:bg-primary/20 shadow-sm"
              >
                <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                AI Storage Optimizer
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportZip}
                disabled={exportingZip || groups.length === 0}
                className="rounded-2xl border-border/70 bg-card/60 gap-1.5 text-xs font-bold"
              >
                <Download className={`h-3.5 w-3.5 text-primary ${exportingZip ? 'animate-spin' : ''}`} />
                {exportingZip ? 'Exporting ZIP...' : 'Export ZIP'}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchSamples()}
                disabled={loading}
                className="rounded-2xl border-border/70 bg-card/60 gap-1.5 text-xs font-bold"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Progress bar during training or export */}
          {(trainingProgress || exportProgress) && (
            <div className="mt-4 pt-4 border-t border-border/40 space-y-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-2 text-foreground">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                  {(trainingProgress || exportProgress)?.label}
                </span>
                <span className="tabular-nums text-muted-foreground font-mono">
                  {(trainingProgress || exportProgress)?.current} / {(trainingProgress || exportProgress)?.total}
                </span>
              </div>
              <Progress
                value={Math.round(
                  (((trainingProgress || exportProgress)?.current || 0) /
                    Math.max(1, (trainingProgress || exportProgress)?.total || 1)) *
                    100
                )}
                className="h-2.5 rounded-full"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Studio Dual-Panel Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Student Navigation List */}
        <Card className="lg:col-span-4 rounded-3xl border border-border/60 bg-card/70 backdrop-blur-xl shadow-xl overflow-hidden">
          <CardHeader className="p-4 pb-3 border-b border-border/40 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, ID, class..."
                className="pl-9 pr-8 h-10 rounded-2xl border-border/60 bg-muted/20 text-xs"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-1 p-1 rounded-2xl bg-muted/20 border border-border/40">
              <button
                onClick={() => setFilterTab('all')}
                className={`flex-1 py-1 text-xs font-bold rounded-xl transition-all ${
                  filterTab === 'all' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({groups.length})
              </button>
              <button
                onClick={() => setFilterTab('trained')}
                className={`flex-1 py-1 text-xs font-bold rounded-xl transition-all ${
                  filterTab === 'trained' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Trained
              </button>
              <button
                onClick={() => setFilterTab('untrained')}
                className={`flex-1 py-1 text-xs font-bold rounded-xl transition-all ${
                  filterTab === 'untrained' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Untrained
              </button>
            </div>
          </CardHeader>

          <CardContent className="p-2">
            <ScrollArea className="h-[620px] pr-2">
              {loading ? (
                <div className="space-y-2 p-2">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-2xl" />
                  ))}
                </div>
              ) : filteredGroups.length === 0 ? (
                <div className="text-center py-12 px-4 space-y-2">
                  <UserX className="h-8 w-8 mx-auto text-muted-foreground/50" />
                  <p className="text-xs font-bold text-muted-foreground">No students match your filter</p>
                </div>
              ) : (
                <div className="space-y-1.5 p-1">
                  {filteredGroups.map((g) => {
                    const isSelected = selectedGroup?.userId === g.userId || selectedGroup?.employeeId === g.employeeId;
                    const slotCount = g.samples.filter((s) => s.source_table === 'face_descriptors').length;
                    const isTrained = slotCount > 0;

                    return (
                      <button
                        key={`${g.userId || 'u'}-${g.employeeId || 'e'}`}
                        onClick={() => setSelectedUserId(g.userId || g.employeeId)}
                        className={`w-full text-left p-3 rounded-2xl transition-all flex items-center gap-3 ${
                          isSelected
                            ? 'border border-primary/50 bg-primary/10 shadow-md shadow-primary/5'
                            : 'border border-transparent hover:border-border/60 hover:bg-muted/30'
                        }`}
                      >
                        {/* Avatar */}
                        <div className="relative h-10 w-10 shrink-0 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-xs text-primary overflow-hidden">
                          {g.avatarUrl ? (
                            <img src={g.avatarUrl} alt={g.name} className="h-full w-full object-cover" />
                          ) : (
                            g.name.slice(0, 2).toUpperCase()
                          )}
                          {isTrained && (
                            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-foreground truncate">{g.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                            <span>ID: {g.employeeId || 'N/A'}</span>
                            {g.classSection && <span>• {g.classSection}</span>}
                          </div>
                        </div>

                        {/* Pills */}
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          <Badge
                            variant={isTrained ? 'default' : 'outline'}
                            className="text-[10px] font-bold px-1.5 py-0 rounded-md"
                          >
                            {slotCount} slots
                          </Badge>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {g.samples.length} photos
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* RIGHT COLUMN: Calibration & Face Training Canvas */}
        <Card className="lg:col-span-8 rounded-3xl border border-border/60 bg-card/70 backdrop-blur-xl shadow-xl overflow-hidden">
          {selectedGroup ? (
            <div className="divide-y divide-border/40">
              
              {/* Active Student Header Banner */}
              <div className="p-6 bg-gradient-to-r from-primary/10 via-card/50 to-transparent flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-3xl bg-primary/15 border-2 border-primary/30 flex items-center justify-center font-extrabold text-base text-primary overflow-hidden shrink-0 shadow-lg">
                    {selectedGroup.avatarUrl ? (
                      <img src={selectedGroup.avatarUrl} alt={selectedGroup.name} className="h-full w-full object-cover" />
                    ) : (
                      selectedGroup.name.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>
                      {selectedGroup.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-mono mt-0.5">
                      <Badge variant="outline" className="rounded-md text-[11px] font-bold">
                        ID: {selectedGroup.employeeId || 'N/A'}
                      </Badge>
                      {selectedGroup.classSection && (
                        <Badge variant="secondary" className="rounded-md text-[11px]">
                          Class {selectedGroup.classSection}
                        </Badge>
                      )}
                      {selectedGroup.rollNumber && <span>Roll: {selectedGroup.rollNumber}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => handleTrainStudentFromAllPhotos(selectedGroup)}
                    disabled={trainingStudent || selectedGroup.samples.length === 0}
                    className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs font-bold gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
                  >
                    <Brain className={`h-3.5 w-3.5 ${trainingStudent ? 'animate-spin' : ''}`} />
                    {trainingStudent ? 'Calibrating Model...' : `Train from All Photos (${selectedGroup.samples.length})`}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDedupTargetUserId(selectedGroup.userId || selectedGroup.employeeId);
                      setDedupModalOpen(true);
                    }}
                    className="rounded-xl border-primary/30 text-xs font-bold gap-1.5 hover:bg-primary/10 text-foreground"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-primary" /> AI Clean Duplicates
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setMergeTargetUserId('');
                      setMergeDialogOpen(true);
                    }}
                    disabled={groups.length < 2}
                    className="rounded-xl border-border/70 text-xs font-bold gap-1.5"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5 text-primary" /> Merge
                  </Button>
                </div>
              </div>

              {/* Photos Content Container */}
              <div className="p-6 space-y-8">
                
                {/* SECTION 1: TRAINED LIVE MODEL SLOTS */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-emerald-500" />
                      <h4 className="text-sm font-extrabold uppercase tracking-wider text-foreground">
                        Live Model Slots (Descriptors)
                      </h4>
                    </div>
                    <Badge variant="default" className="rounded-full text-xs font-bold px-2.5">
                      {trainedSlots.length} Active Slots
                    </Badge>
                  </div>

                  {trainedSlots.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/70 p-6 text-center space-y-2 bg-muted/10">
                      <ShieldCheck className="h-8 w-8 mx-auto text-muted-foreground/40" />
                      <p className="text-xs font-bold text-muted-foreground">
                        No trained model slots indexed for this student yet.
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Crop any captured photo below or re-register to train the face model weights.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {trainedSlots.map((sample) => (
                        <PhotoCard
                          key={sample.id}
                          sample={sample}
                          imageUrl={sample.image_url ? resolvedUrls[sample.image_url] || sample.image_url : null}
                          isSelected={selectedSampleIds.has(sample.id)}
                          onToggleSelect={() => {
                            setSelectedSampleIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(sample.id)) next.delete(sample.id);
                              else next.add(sample.id);
                              return next;
                            });
                          }}
                          onPreview={() => {
                            const url = sample.image_url ? resolvedUrls[sample.image_url] || sample.image_url : null;
                            if (url) {
                              setPreviewImageUrl(url);
                              setPreviewTitle(`${selectedGroup.name} · Trained Model Slot`);
                            }
                          }}
                          onCrop={() => openCropper(sample)}
                          onSetIdPhoto={() => handleSetAsIdPhoto(sample)}
                          onDelete={() => handleDeleteSample(sample)}
                          onTransfer={() => {
                            setTransferSample(sample);
                            setTransferTargetUserId('');
                            setTransferDialogOpen(true);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </section>

                {/* SECTION 2: CAPTURED SAMPLE PHOTOS */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Camera className="h-4 w-4 text-blue-500" />
                      <h4 className="text-sm font-extrabold uppercase tracking-wider text-foreground">
                        Captured Recognition Photos
                      </h4>
                    </div>
                    <Badge variant="secondary" className="rounded-full text-xs font-bold px-2.5">
                      {capturedPhotos.length} Samples
                    </Badge>
                  </div>

                  {capturedPhotos.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/70 p-6 text-center space-y-2 bg-muted/10">
                      <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground/40" />
                      <p className="text-xs font-bold text-muted-foreground">
                        No captured samples available for this student.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {capturedPhotos.map((sample) => (
                        <PhotoCard
                          key={sample.id}
                          sample={sample}
                          imageUrl={sample.image_url ? resolvedUrls[sample.image_url] || sample.image_url : null}
                          isSelected={selectedSampleIds.has(sample.id)}
                          onToggleSelect={() => {
                            setSelectedSampleIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(sample.id)) next.delete(sample.id);
                              else next.add(sample.id);
                              return next;
                            });
                          }}
                          onPreview={() => {
                            const url = sample.image_url ? resolvedUrls[sample.image_url] || sample.image_url : null;
                            if (url) {
                              setPreviewImageUrl(url);
                              setPreviewTitle(`${selectedGroup.name} · Captured Photo`);
                            }
                          }}
                          onCrop={() => openCropper(sample)}
                          onSetIdPhoto={() => handleSetAsIdPhoto(sample)}
                          onDelete={() => handleDeleteSample(sample)}
                          onTransfer={() => {
                            setTransferSample(sample);
                            setTransferTargetUserId('');
                            setTransferDialogOpen(true);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </section>

              </div>
            </div>
          ) : (
            <div className="p-16 text-center space-y-3">
              <ScanFace className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <h4 className="text-base font-bold text-foreground">Select a Student from the List</h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Select any student on the left panel to review trained model weights, calibrate face slots, and manage photos.
              </p>
            </div>
          )}
        </Card>

      </div>

      {/* Floating Multi-Select Action Bar */}
      {selectedSampleIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-2xl border border-primary/40 bg-card/95 backdrop-blur-2xl px-6 py-3 shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4">
          <Badge variant="default" className="rounded-full px-3 py-1 font-bold text-xs">
            {selectedSampleIds.size} Photos Selected
          </Badge>
          <div className="h-4 w-px bg-border" />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedSampleIds(new Set())}
            className="text-xs font-semibold"
          >
            Clear
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleBulkDelete}
            className="rounded-xl font-bold gap-1.5 text-xs shadow-lg shadow-destructive/20"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete Selected ({selectedSampleIds.size})
          </Button>
        </div>
      )}

      {/* Image Cropper Modal */}
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

      {/* Transfer Photo Modal */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="rounded-3xl border border-border/70 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Transfer Face Sample</DialogTitle>
            <DialogDescription className="text-xs">
              Move this photo sample to another student profile.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-xs font-semibold">Select Destination Student</Label>
            <select
              value={transferTargetUserId}
              onChange={(e) => setTransferTargetUserId(e.target.value)}
              className="w-full h-11 rounded-2xl border border-border/70 bg-card px-3 text-xs font-medium text-foreground focus:ring-2 focus:ring-primary"
            >
              <option value="">Choose student...</option>
              {groups
                .filter((g) => g.userId !== selectedGroup?.userId)
                .map((g) => (
                  <option key={`${g.userId}-${g.employeeId}`} value={g.userId || g.employeeId}>
                    {g.name} ({g.employeeId || 'No ID'})
                  </option>
                ))}
            </select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setTransferDialogOpen(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button size="sm" onClick={handleTransferSample} disabled={!transferTargetUserId} className="rounded-xl font-bold">
              Confirm Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Student Data Modal */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="rounded-3xl border border-border/70 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Merge Student Profiles</DialogTitle>
            <DialogDescription className="text-xs">
              Consolidate all face samples and descriptors from <strong>{selectedGroup?.name}</strong> into another student.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-xs font-semibold">Merge Into Target Student</Label>
            <select
              value={mergeTargetUserId}
              onChange={(e) => setMergeTargetUserId(e.target.value)}
              className="w-full h-11 rounded-2xl border border-border/70 bg-card px-3 text-xs font-medium text-foreground focus:ring-2 focus:ring-primary"
            >
              <option value="">Choose target student...</option>
              {groups
                .filter((g) => g.userId !== selectedGroup?.userId)
                .map((g) => (
                  <option key={`${g.userId}-${g.employeeId}`} value={g.userId || g.employeeId}>
                    {g.name} ({g.employeeId || 'No ID'})
                  </option>
                ))}
            </select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setMergeDialogOpen(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                if (!selectedGroup || !mergeTargetUserId) return;
                setMergingStudent(true);
                try {
                  const target = groups.find((g) => g.userId === mergeTargetUserId || g.employeeId === mergeTargetUserId);
                  if (!target) return;

                  if (selectedGroup.userId) {
                    await supabase
                      .from('face_descriptors')
                      .update({ user_id: target.userId, label: target.name, student_id: target.employeeId })
                      .eq('user_id', selectedGroup.userId);

                    await supabase
                      .from('attendance_records')
                      .update({ user_id: target.userId, student_name: target.name, student_id: target.employeeId })
                      .eq('user_id', selectedGroup.userId);
                  }

                  toast({ title: 'Merge Successful', description: `Merged data into ${target.name}.` });
                  setMergeDialogOpen(false);
                  fetchSamples();
                } catch (err: any) {
                  toast({ title: 'Merge Failed', description: err.message, variant: 'destructive' });
                } finally {
                  setMergingStudent(false);
                }
              }}
              disabled={!mergeTargetUserId || mergingStudent}
              className="rounded-xl font-bold"
            >
              {mergingStudent ? 'Merging...' : 'Confirm Merge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Deduplication & Cloud Storage Reclaim Modal */}
      <FaceSampleDeduplicationModal
        open={dedupModalOpen}
        onOpenChange={setDedupModalOpen}
        targetUserId={dedupTargetUserId}
        onCompleted={() => fetchSamples({ silent: true })}
      />

      {/* Full-Screen Image Preview Modal */}
      <Dialog open={!!previewImageUrl} onOpenChange={(open) => !open && setPreviewImageUrl(null)}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden bg-card/95 backdrop-blur-2xl border border-primary/20 shadow-2xl rounded-3xl">
          <div className="p-4 border-b border-border/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Camera className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-foreground truncate">
                {previewTitle || 'Face Sample Preview'}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPreviewImageUrl(null)}
              className="h-7 w-7 rounded-full"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="p-4 bg-black/40 flex items-center justify-center min-h-[300px] max-h-[70vh] overflow-hidden">
            {previewImageUrl && (
              <img
                src={previewImageUrl}
                alt="Full preview"
                className="max-h-[65vh] max-w-full object-contain rounded-xl shadow-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

// ---------- Individual Photo Card Component ----------
interface PhotoCardProps {
  sample: FaceSample;
  imageUrl: string | null;
  isSelected: boolean;
  onToggleSelect: () => void;
  onPreview: () => void;
  onCrop: () => void;
  onSetIdPhoto: () => void;
  onDelete: () => void;
  onTransfer: () => void;
}

const PhotoCard: React.FC<PhotoCardProps> = ({
  sample,
  imageUrl,
  isSelected,
  onToggleSelect,
  onPreview,
  onCrop,
  onSetIdPhoto,
  onDelete,
  onTransfer,
}) => {
  const [imgError, setImgError] = useState(false);
  const isSlot = sample.source_table === 'face_descriptors';

  return (
    <div
      className={`relative group rounded-2xl border transition-all p-3 bg-card/70 flex flex-col justify-between ${
        isSelected
          ? 'border-primary/60 bg-primary/10 shadow-lg shadow-primary/5 ring-2 ring-primary/30'
          : 'border-border/60 hover:border-primary/40 hover:shadow-md'
      }`}
    >
      {/* Top action row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer font-medium select-none">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="h-4 w-4 rounded-md border-border/70 text-primary focus:ring-primary cursor-pointer"
          />
          <span className="text-[11px]">Select</span>
        </label>

        <Badge
          variant={isSlot ? 'default' : 'secondary'}
          className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase"
        >
          {isSlot ? 'Model Slot' : sample.source === 'recognition_gate' ? 'Gate Camera' : 'Attendance'}
        </Badge>
      </div>

      {/* Image Display & Zoom Click */}
      <div
        onClick={imageUrl ? onPreview : undefined}
        className={cn(
          "relative aspect-square w-full rounded-xl overflow-hidden bg-muted/40 border border-border/40 flex items-center justify-center mb-3",
          imageUrl && "cursor-pointer group/img"
        )}
      >
        {imageUrl && !imgError ? (
          <>
            <img
              src={imageUrl}
              alt="Face sample"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover transition-transform duration-300 group-hover/img:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
              <span className="p-2 rounded-full bg-black/70 text-white shadow-md">
                <ZoomIn className="w-4 h-4" />
              </span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center p-3 text-muted-foreground text-center space-y-1">
            <ImageIcon className="h-6 w-6 opacity-40" />
            <span className="text-[10px] font-mono opacity-70">Photo Encrypted</span>
          </div>
        )}

        {typeof sample.confidence_score === 'number' && (
          <div className="absolute bottom-2 right-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-500 backdrop-blur-md shadow-sm border border-emerald-500/30">
            {Math.round(sample.confidence_score * 100)}% Match
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="space-y-1 text-xs mb-3">
        <p className="text-[10px] text-muted-foreground font-mono truncate">
          {new Date(sample.created_at).toLocaleDateString()} · {new Date(sample.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {/* Card Actions Grid */}
      <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-border/40">
        <Button
          size="sm"
          variant="outline"
          onClick={onCrop}
          disabled={!imageUrl}
          className="rounded-xl h-8 text-[11px] font-bold px-2 gap-1"
        >
          <Scissors className="h-3 w-3 text-primary" /> Crop
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={onSetIdPhoto}
          disabled={!imageUrl}
          className="rounded-xl h-8 text-[11px] font-bold px-2"
        >
          Set ID
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={onTransfer}
          disabled={!imageUrl}
          className="rounded-xl h-8 text-[11px] font-bold px-2 gap-1"
        >
          <ArrowRightLeft className="h-3 w-3 text-blue-500" /> Move
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={onDelete}
          className="rounded-xl h-8 text-[11px] font-bold px-2 gap-1 text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" /> Del
        </Button>
      </div>
    </div>
  );
};

export default StudentFaceSamplesManager;