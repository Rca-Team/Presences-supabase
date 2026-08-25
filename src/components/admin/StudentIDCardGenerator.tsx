import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getCategoryLabel } from '@/constants/schoolConfig';
import { pickPreferredPhotoCandidate, resolveStudentPhotoUrl } from '@/utils/studentPhotoResolver';
import kvLogo from '@/assets/kv-logo.png';
import { 
  CreditCard, 
  Download, 
  Loader2, 
  User, 
  X,
  FileDown,
  Users,
  Eye,
  Printer,
  FileText,
  Trash2
} from 'lucide-react';

interface StudentData {
  id: string;
  name: string;
  employee_id: string;
  roll_number: string;
  category: string;
  blood_group: string;
  parent_phone: string;
  parent_name: string;
  transport_mode: string;
  avatar_url?: string;
  address?: string;
  _attendanceIds?: string[];
  _descriptorIds?: string[];
  _userIds?: string[];
}

interface StudentIDCardGeneratorProps {
  students?: StudentData[];
}

const SCHOOL_NAME = 'PM SHRI Kendriya Vidyalaya';
const SCHOOL_SUBNAME = 'NFC Vigyan Vihar, Delhi';
const SCHOOL_TAGLINE = 'तत् त्वम् पूषन् अपावृणु';
const SCHOOL_ADDRESS = 'Vigyan Vihar, New Delhi – 110092 | Affiliated to CBSE';
const SCHOOL_AFFILIATION = 'Under Kendriya Vidyalaya Sangathan, Min. of Education, Govt. of India';
const ACADEMIC_YEAR = '2025–2026';

/** Preload the KVS logo as a base64 data URL so html2canvas embeds it cleanly. */
let cachedLogoDataUrl: string | null = null;
const loadLogoDataUrl = async (): Promise<string> => {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  try {
    const res = await fetch(kvLogo);
    const blob = await res.blob();
    cachedLogoDataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    return cachedLogoDataUrl!;
  } catch {
    return kvLogo;
  }
};

const StudentIDCardGenerator: React.FC<StudentIDCardGeneratorProps> = ({ students: propStudents }) => {
  const { toast } = useToast();
  const [students, setStudents] = useState<StudentData[]>(propStudents || []);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number; stage: string } | null>(null);
  const [previewStudent, setPreviewStudent] = useState<StudentData | null>(null);
  const [printSizePercent, setPrintSizePercent] = useState(100);
  const [printGapMm, setPrintGapMm] = useState(5);
  const cardRef = useRef<HTMLDivElement>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const isMeaningfulIdentity = (value: unknown) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    return Boolean(normalized && !['unknown', 'null', 'undefined', 'n/a', 'na', '-'].includes(normalized));
  };

  const pickIdentityKey = (...candidates: unknown[]) => {
    for (const candidate of candidates) {
      if (isMeaningfulIdentity(candidate)) return String(candidate).trim();
    }
    return '';
  };

  const normalizeCardField = (value: unknown, fallback = 'N/A') => {
    const text = String(value ?? '').trim();
    if (!text) return fallback;
    const normalized = text.toLowerCase();
    if (['null', 'undefined', 'n/a', 'na', '-', '—'].includes(normalized)) return fallback;
    return text;
  };

  const waitForEmbeddedImages = async (container: HTMLElement) => {
    const images = Array.from(container.querySelectorAll('img'));
    if (images.length === 0) return;
    await Promise.all(
      images.map(async (img) => {
        try {
          if (!img.complete) await img.decode();
        } catch {
          // Ignore decode failures and let html2canvas handle fallbacks.
        }
      }),
    );
  };

  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      const [attendanceRes, descriptorsRes, profilesRes] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('id, user_id, student_id, student_name, device_info, category, image_url, created_at')
          .eq('status', 'registered')
          .order('created_at', { ascending: false }),
        supabase
          .from('face_descriptors')
          .select('id, user_id, student_id, label, image_url, created_at')
          .not('image_url', 'is', null)
          .order('created_at', { ascending: false }),
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

      const employeeToUserId = new Map<string, string>();
      (data || []).forEach((record: any) => {
        const deviceInfo = record.device_info as any;
        const metadata = deviceInfo?.metadata;
        const empKey = pickIdentityKey(metadata?.employee_id, metadata?.roll_number, deviceInfo?.employee_id);
        if (record.user_id && empKey) employeeToUserId.set(empKey, record.user_id);
      });

      const uniqueStudents = new Map<string, StudentData>();
      const dedupeKeyByEmployeeId = new Map<string, string>();
      const dedupeKeyByUserId = new Map<string, string>();
      const dedupeKeyByName = new Map<string, string>();

      const normalizeName = (n: unknown) =>
        String(n ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

      const rememberDedupeKeys = (key: string, employeeId?: string, userId?: string, name?: string) => {
        const emp = pickIdentityKey(employeeId);
        const uid = pickIdentityKey(userId);
        const nm = normalizeName(name);
        if (emp) dedupeKeyByEmployeeId.set(emp, key);
        if (uid) dedupeKeyByUserId.set(uid, key);
        if (nm) dedupeKeyByName.set(nm, key);
      };

      const pushUnique = (arr: string[] | undefined, val?: string) => {
        if (!val) return arr;
        const list = arr || [];
        if (!list.includes(val)) list.push(val);
        return list;
      };
      
      data?.forEach(record => {
        const deviceInfo = record.device_info as any;
        const metadata = deviceInfo?.metadata;
        
        const resolvedName = metadata?.name || (record as any).student_name || '';

        if (resolvedName && resolvedName !== 'Unknown') {
          const empKey = pickIdentityKey(metadata?.employee_id, metadata?.roll_number, deviceInfo?.employee_id);
          const studentKey = pickIdentityKey((record as any).student_id);
          const canonicalUserId = record.user_id || (empKey ? employeeToUserId.get(empKey) : null);
          const nameKey = normalizeName(resolvedName);

          // Prefer strong identity matches (employee_id / user_id). Only fall back to
          // normalized-name merging when NEITHER this record nor the candidate carry
          // a distinguishing id — otherwise two different students that share a name
          // (e.g. two "Rahul Kumar") get collapsed into a single card.
          const hasStrongId = Boolean(empKey || studentKey || canonicalUserId);
          const nameMatchKey = nameKey ? dedupeKeyByName.get(nameKey) : '';
          const nameMatchIsSafe = (() => {
            if (!nameMatchKey) return false;
            if (hasStrongId) return false;
            const candidate = uniqueStudents.get(nameMatchKey);
            if (!candidate) return true;
            const candidateHasStrongId =
              (candidate.employee_id && candidate.employee_id !== 'N/A') ||
              (candidate._userIds && candidate._userIds.length > 0);
            return !candidateHasStrongId;
          })();

          const existingKey =
            (empKey && dedupeKeyByEmployeeId.get(empKey)) ||
            (studentKey && dedupeKeyByEmployeeId.get(studentKey)) ||
            (canonicalUserId && dedupeKeyByUserId.get(canonicalUserId)) ||
            (nameMatchIsSafe ? nameMatchKey : '') ||
            '';

          const dedupeKey = existingKey || pickIdentityKey(empKey, studentKey, canonicalUserId) || `name:${nameKey}`;
          if (!uniqueStudents.has(dedupeKey)) {
            const imageCandidate = pickPreferredPhotoCandidate(
              canonicalUserId ? profileImageByUserId.get(canonicalUserId) : '',
               metadata?.face_model?.id_card_photo_url,
               metadata?.id_card_photo_url,
              canonicalUserId ? descriptorImageByUserId.get(canonicalUserId) : '',
              studentKey ? descriptorImageByStudentKey.get(studentKey) : (empKey ? descriptorImageByStudentKey.get(empKey) : ''),
              record.image_url,
              metadata?.firebase_image_url,
            );

            uniqueStudents.set(dedupeKey, {
              id: dedupeKey,
              name: resolvedName,
              employee_id: metadata?.employee_id || studentKey || empKey || 'N/A',
              roll_number: metadata?.roll_number || metadata?.employee_id || studentKey || empKey || 'N/A',
              category: record.category || 'General',
              blood_group: metadata?.blood_group || '—',
              parent_phone: metadata?.parent_phone || '—',
              parent_name: metadata?.parent_name || '—',
              transport_mode: metadata?.transport_mode || '—',
              avatar_url: imageCandidate,
              address: metadata?.address || '',
              _attendanceIds: [record.id],
              _descriptorIds: [],
              _userIds: canonicalUserId ? [canonicalUserId] : [],
            });
          } else {
            // Merge extra attendance row into existing student
            const existing = uniqueStudents.get(dedupeKey)!;
            existing._attendanceIds = pushUnique(existing._attendanceIds, record.id);
            if (canonicalUserId) existing._userIds = pushUnique(existing._userIds, canonicalUserId);
          }

          rememberDedupeKeys(
            dedupeKey,
            metadata?.employee_id || studentKey || empKey,
            canonicalUserId || undefined,
            resolvedName,
          );
        }
      });

      // Include descriptor-only students (when registration exists in face_descriptors
      // but attendance_records is missing/incomplete for that student).
      (descriptorsRes.data || []).forEach((descriptor: any) => {
        const descriptorName = (descriptor?.label || '').toString().trim();
        if (!descriptorName || descriptorName === 'Unknown' || descriptorName === 'User') return;

        const descriptorUserId = pickIdentityKey(descriptor?.user_id);
        const descriptorStudentId = pickIdentityKey(descriptor?.student_id);
        const nameKey = normalizeName(descriptorName);
        const hasStrongDescriptorId = Boolean(descriptorStudentId || descriptorUserId);
        const nameCandidateKey = nameKey ? dedupeKeyByName.get(nameKey) : '';
        const nameCandidate = nameCandidateKey ? uniqueStudents.get(nameCandidateKey) : undefined;
        const nameCandidateHasStrongId = nameCandidate
          ? (nameCandidate.employee_id && nameCandidate.employee_id !== 'N/A') ||
            (nameCandidate._userIds && nameCandidate._userIds.length > 0)
          : false;
        const safeNameMatch = nameCandidateKey && !hasStrongDescriptorId && !nameCandidateHasStrongId
          ? nameCandidateKey
          : '';

        const existingKey =
          (descriptorStudentId ? dedupeKeyByEmployeeId.get(descriptorStudentId) : undefined) ||
          (descriptorUserId ? dedupeKeyByUserId.get(descriptorUserId) : undefined) ||
          safeNameMatch;

        if (existingKey && uniqueStudents.has(existingKey)) {
          const existing = uniqueStudents.get(existingKey)!;
          existing._descriptorIds = pushUnique(existing._descriptorIds, descriptor.id);
          if (descriptorUserId) existing._userIds = pushUnique(existing._userIds, descriptorUserId);
          if (!existing.avatar_url) {
            const enrichedImage = pickPreferredPhotoCandidate(
              existing.avatar_url,
              descriptorUserId ? profileImageByUserId.get(descriptorUserId) : '',
              descriptorUserId ? descriptorImageByUserId.get(descriptorUserId) : '',
              descriptorStudentId ? descriptorImageByStudentKey.get(descriptorStudentId) : '',
              descriptor?.image_url,
            );
            existing.avatar_url = enrichedImage;
          }
          return;
        }

        const key = pickIdentityKey(descriptorStudentId, descriptorUserId) || `name:${nameKey}` || descriptor.id;
        if (!key) return;
        if (uniqueStudents.has(key)) {
          const existing = uniqueStudents.get(key)!;
          existing._descriptorIds = pushUnique(existing._descriptorIds, descriptor.id);
          return;
        }

        const imageCandidate = pickPreferredPhotoCandidate(
          descriptorUserId ? profileImageByUserId.get(descriptorUserId) : '',
          descriptorUserId ? descriptorImageByUserId.get(descriptorUserId) : '',
          descriptorStudentId ? descriptorImageByStudentKey.get(descriptorStudentId) : '',
          descriptor?.image_url,
        );

        uniqueStudents.set(key, {
          id: key,
          name: descriptorName,
          employee_id: descriptorStudentId || 'N/A',
          roll_number: descriptorStudentId || 'N/A',
          category: 'General',
          blood_group: '—',
          parent_phone: '—',
          parent_name: '—',
          transport_mode: '—',
          avatar_url: imageCandidate,
          address: '',
          _attendanceIds: [],
          _descriptorIds: [descriptor.id],
          _userIds: descriptorUserId ? [descriptorUserId] : [],
        });

        rememberDedupeKeys(key, descriptorStudentId, descriptorUserId, descriptorName);
      });

      const resolvedStudents = await Promise.all(
        Array.from(uniqueStudents.values()).map(async (student) => ({
          ...student,
          avatar_url: await resolveStudentPhotoUrl(student.avatar_url),
        })),
      );

      const sortedStudents = resolvedStudents.sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        if (nameCompare !== 0) return nameCompare;
        return String(a.employee_id || '').localeCompare(String(b.employee_id || ''), undefined, { sensitivity: 'base' });
      });

      setStudents(sortedStudents);
    } catch (error) {
      console.error('Error fetching students:', error);
      toast({ title: 'Error', description: 'Failed to fetch student data', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    if (propStudents) {
      setStudents(propStudents);
      return;
    }
    fetchStudents();
  }, [propStudents]);

  React.useEffect(() => {
    if (propStudents) return;

    const queueRefresh = () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        fetchStudents();
        refreshTimerRef.current = null;
      }, 300);
    };

    const channel = supabase
      .channel('idcard-generator-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'face_descriptors' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, queueRefresh)
      .subscribe();

    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [propStudents]);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    if (selectedIds.size === students.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(students.map(s => s.id)));
  };

  const [isRemovingDuplicates, setIsRemovingDuplicates] = React.useState(false);

  const removeDuplicateStudents = async () => {
    const confirmed = window.confirm(
      'Remove duplicate student rows from the database?\n\nThis keeps the most recent registration for each student and deletes older duplicate rows from attendance_records and face_descriptors. This cannot be undone.'
    );
    if (!confirmed) return;

    setIsRemovingDuplicates(true);
    try {
      const [attRes, descRes] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('id, user_id, student_id, student_name, device_info, created_at')
          .eq('status', 'registered')
          .order('created_at', { ascending: false }),
        supabase
          .from('face_descriptors')
          .select('id, user_id, student_id, label, created_at')
          .order('created_at', { ascending: false }),
      ]);
      if (attRes.error) throw attRes.error;
      if (descRes.error) throw descRes.error;

      const identityOf = (row: any): string => {
        const di = row.device_info || {};
        const meta = di?.metadata || {};
        return pickIdentityKey(
          meta?.employee_id,
          meta?.roll_number,
          di?.employee_id,
          row.student_id,
          row.user_id,
          (row.label || '').toString().trim().toLowerCase(),
          (row.student_name || '').toString().trim().toLowerCase(),
        );
      };

      const attToDelete: string[] = [];
      const seenAtt = new Set<string>();
      (attRes.data || []).forEach((r: any) => {
        const key = identityOf(r);
        if (!key) return;
        if (seenAtt.has(key)) attToDelete.push(r.id);
        else seenAtt.add(key);
      });

      const descToDelete: string[] = [];
      const seenDesc = new Set<string>();
      (descRes.data || []).forEach((r: any) => {
        const key = identityOf(r);
        if (!key) return;
        if (seenDesc.has(key)) descToDelete.push(r.id);
        else seenDesc.add(key);
      });

      let deletedAtt = 0;
      let deletedDesc = 0;

      const chunk = <T,>(arr: T[], n: number) => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
        return out;
      };

      for (const ids of chunk(attToDelete, 100)) {
        const { error } = await supabase.from('attendance_records').delete().in('id', ids);
        if (error) console.error('Duplicate attendance delete failed:', error);
        else deletedAtt += ids.length;
      }
      for (const ids of chunk(descToDelete, 100)) {
        const { error } = await supabase.from('face_descriptors').delete().in('id', ids);
        if (error) console.error('Duplicate descriptor delete failed:', error);
        else deletedDesc += ids.length;
      }

      toast({
        title: deletedAtt + deletedDesc > 0 ? 'Duplicates removed' : 'No duplicates found',
        description: `Attendance rows: ${deletedAtt} • Face descriptors: ${deletedDesc}`,
      });

      if (!propStudents) await fetchStudents();
    } catch (err: any) {
      console.error('Remove duplicates failed:', err);
      toast({
        title: 'Failed to remove duplicates',
        description: err?.message || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsRemovingDuplicates(false);
    }
  };

  const [isDeletingSelected, setIsDeletingSelected] = React.useState(false);

  const deleteSelectedStudents = async () => {
    if (selectedIds.size === 0) return;
    const selected = students.filter(s => selectedIds.has(s.id));
    const confirmed = window.confirm(
      `Delete ${selected.length} selected student${selected.length === 1 ? '' : 's'} from the database?\n\nAll matching attendance_records and face_descriptors rows will be permanently removed. This cannot be undone.`
    );
    if (!confirmed) return;

    setIsDeletingSelected(true);
    try {
      const attIds = Array.from(new Set(selected.flatMap(s => s._attendanceIds || [])));
      const descIds = Array.from(new Set(selected.flatMap(s => s._descriptorIds || [])));

      const chunk = <T,>(arr: T[], n: number) => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
        return out;
      };

      let deletedAtt = 0;
      let deletedDesc = 0;

      for (const ids of chunk(attIds, 100)) {
        const { error } = await supabase.from('attendance_records').delete().in('id', ids);
        if (error) console.error('Delete attendance failed:', error);
        else deletedAtt += ids.length;
      }
      for (const ids of chunk(descIds, 100)) {
        const { error } = await supabase.from('face_descriptors').delete().in('id', ids);
        if (error) console.error('Delete descriptor failed:', error);
        else deletedDesc += ids.length;
      }

      toast({
        title: `Deleted ${selected.length} student${selected.length === 1 ? '' : 's'}`,
        description: `Attendance rows: ${deletedAtt} • Face descriptors: ${deletedDesc}`,
      });

      setSelectedIds(new Set());
      if (!propStudents) await fetchStudents();
    } catch (err: any) {
      console.error('Delete selected failed:', err);
      toast({
        title: 'Failed to delete selected',
        description: err?.message || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingSelected(false);
    }
  };




  const buildCardHTML = (student: StudentData, qrBase64: string, logoSrc: string) => {
    const classLabel = getCategoryLabel(student.category);
    const displayName = normalizeCardField(student.name, 'N/A');
    const displayRollNumber = normalizeCardField(student.roll_number, 'N/A');
    const displayStudentId = normalizeCardField(student.employee_id, 'N/A');
    const displayBloodGroup = normalizeCardField(student.blood_group, 'N/A');
    const displayParentName = normalizeCardField(student.parent_name, 'N/A');
    const displayParentPhone = normalizeCardField(student.parent_phone, 'N/A');
    const displayTransportMode = normalizeCardField(student.transport_mode, 'N/A');
    const displayAddress = normalizeCardField(student.address, 'N/A');
    
    return `
      <div style="
        width: 420px;
        height: 800px;
        border-radius: 16px;
        overflow: hidden;
        font-family: 'Segoe UI', 'Inter', sans-serif;
        color: #1a1a2e;
        position: relative;
        background: #ffffff;
        box-shadow: 0 4px 24px rgba(0,0,0,0.15);
      ">
        <!-- Top Header Band -->
        <div style="
          background: linear-gradient(135deg, #1e3a5f 0%, #0d2137 100%);
          padding: 12px 14px 10px;
          position: relative;
        ">
          <div style="
            position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            background: repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 8px);
          "></div>
          <div style="position: relative; z-index: 1; display: flex; align-items: center; gap: 10px;">
            <img src="${logoSrc}" style="width: 64px; height: 64px; flex-shrink: 0; background: #ffffff; border-radius: 50%; padding: 5px; object-fit: contain; border: 2px solid #ffffff;" />
            <div style="flex: 1; text-align: left; min-width: 0;">
              <div style="font-size: 14px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px; line-height: 1.1;">
                ${SCHOOL_NAME}
              </div>
              <div style="font-size: 11px; font-weight: 700; color: #fbbf24; line-height: 1.2; margin-top: 1px;">
                ${SCHOOL_SUBNAME}
              </div>
              <div style="font-size: 9px; color: #93c5fd; margin-top: 2px; font-style: italic;">
                ${SCHOOL_TAGLINE}
              </div>
            </div>
          </div>
          <div style="position: relative; z-index: 1; font-size: 8px; color: #cbd5e1; margin-top: 6px; text-align: center; line-height: 1.3;">
            ${SCHOOL_ADDRESS}<br/>${SCHOOL_AFFILIATION}
          </div>
        </div>

        <!-- Accent Stripe -->
        <div style="height: 4px; background: linear-gradient(90deg, #f59e0b, #ef4444, #8b5cf6, #3b82f6);"></div>

        <!-- Student Photo Section -->
        <div style="display: flex; align-items: center; padding: 14px 16px 10px; gap: 14px;">
          <div style="
            width: 90px; height: 100px; flex-shrink: 0;
            border-radius: 8px; overflow: hidden;
            border: 3px solid #1e3a5f;
            background: #f1f5f9;
          ">
            ${student.avatar_url 
              ? `<img src="${student.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;" crossorigin="anonymous" />`
              : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:36px;">👤</div>`
            }
          </div>
          <div style="flex: 1; min-width: 0;">
              <div style="font-size: 18px; font-weight: 800; color: #1e3a5f; line-height: 1.2; margin-bottom: 4px;">
                ${displayName}
            </div>
            <div style="
              display: inline-block; background: #1e3a5f; color: #ffffff;
              padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 700;
              letter-spacing: 0.5px;
            ">${classLabel}</div>
            <div style="margin-top: 6px; font-size: 11px; color: #64748b;">
              Academic Year: <strong style="color: #1e3a5f;">${ACADEMIC_YEAR}</strong>
            </div>
          </div>
        </div>

        <!-- Details Grid -->
        <div style="padding: 0 16px; margin-top: 4px;">
          <div style="
            background: #f8fafc; border-radius: 10px; padding: 12px;
            border: 1px solid #e2e8f0;
          ">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 5px 0; font-size: 11px; color: #64748b; width: 40%;">Roll No.</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: 700; color: #1e3a5f;">: ${displayRollNumber}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-size: 11px; color: #64748b;">Student ID</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: 600; color: #1e3a5f;">: ${displayStudentId}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-size: 11px; color: #64748b;">Blood Group</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: 700; color: #dc2626;">: ${displayBloodGroup}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-size: 11px; color: #64748b;">Parent/Guardian</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: 600; color: #1e3a5f;">: ${displayParentName}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-size: 11px; color: #64748b;">Contact No.</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: 600; color: #1e3a5f;">: ${displayParentPhone}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-size: 11px; color: #64748b;">Transport</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: 600; color: #1e3a5f;">: ${displayTransportMode}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-size: 11px; color: #64748b; vertical-align: top;">Address</td>
                <td style="padding: 5px 0; font-size: 11px; font-weight: 600; color: #1e3a5f; line-height: 1.4;">: ${displayAddress}</td>
              </tr>
            </table>
          </div>
        </div>

        <!-- QR Code + Signature -->
        <div style="
          display: flex; align-items: stretch; justify-content: space-between;
          padding: 14px 16px 0; gap: 14px;
        ">
          <div style="flex-shrink: 0; text-align: center;">
            <div style="
              background: #ffffff; border: 2px solid #1e3a5f; border-radius: 10px;
              padding: 6px; width: 168px; height: 168px; box-sizing: border-box;
            ">
              <img src="data:image/svg+xml;base64,${qrBase64}" style="width: 100%; height: 100%; display: block;" />
            </div>
            <div style="font-size: 9px; color: #1e3a5f; font-weight: 700; margin-top: 4px; letter-spacing: 0.3px;">SCAN TO VERIFY</div>
          </div>
          <div style="flex: 1; display: flex; flex-direction: column; justify-content: flex-end; text-align: center;">
            <div style="border-top: 1px dashed #1e3a5f; padding-top: 6px;">
              <div style="font-size: 11px; font-weight: 700; color: #1e3a5f;">Principal</div>
              <div style="font-size: 9px; color: #64748b;">Signature &amp; Seal</div>
            </div>
          </div>
        </div>

        <!-- Emergency note -->
        <div style="padding: 8px 16px 0; font-size: 8.5px; color: #64748b; text-align: center; line-height: 1.35;">
          If found, please return to <strong>PM SHRI K.V. NFC Vigyan Vihar, Delhi</strong> · Tel: 011-22154398
        </div>

        <!-- Bottom Band -->
        <div style="
          margin-top: 8px;
          background: linear-gradient(135deg, #1e3a5f 0%, #0d2137 100%);
          padding: 7px 16px; text-align: center;
          font-size: 8px; color: #93c5fd; letter-spacing: 0.4px;
        ">
          Powered by RCA · Made by Gaurav Raj &amp; Jatin Dhama
        </div>
      </div>
    `;
  };

  const generateIDCard = async (student: StudentData): Promise<string> => {
    const qrData = JSON.stringify({
      type: 'student_id',
      id: student.id,
      user_id: student.id,
      student_id: student.employee_id,
      name: student.name,
      employee_id: student.employee_id,
      category: student.category,
      version: 2,
    });

    // Render QR code
    const tempQRDiv = document.createElement('div');
    tempQRDiv.style.position = 'absolute';
    tempQRDiv.style.left = '-9999px';
    document.body.appendChild(tempQRDiv);
    
    const { createRoot } = await import('react-dom/client');
    const qrRoot = createRoot(tempQRDiv);
    
    await new Promise<void>((resolve) => {
      qrRoot.render(
        <QRCodeSVG value={qrData} size={512} level="H" bgColor="#ffffff" fgColor="#000000" includeMargin={false} />
      );
      setTimeout(resolve, 100);
    });

    const qrSvg = tempQRDiv.querySelector('svg');
    const qrSvgString = qrSvg ? new XMLSerializer().serializeToString(qrSvg) : '';
    const qrBase64 = btoa(unescape(encodeURIComponent(qrSvgString)));

    qrRoot.unmount();
    document.body.removeChild(tempQRDiv);

    // Build card
    const logoSrc = await loadLogoDataUrl();
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.innerHTML = buildCardHTML(student, qrBase64, logoSrc);
    document.body.appendChild(container);

    await new Promise(resolve => setTimeout(resolve, 220));
    await waitForEmbeddedImages(container);

    const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
      scale: 3,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
    });

    document.body.removeChild(container);
    return canvas.toDataURL('image/jpeg', 0.92);
  };

  const downloadSingleCard = async (student: StudentData) => {
    setIsGenerating(true);
    try {
      const dataUrl = await generateIDCard(student);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `ID_Card_${student.name.replace(/\s+/g, '_')}.jpg`;
      link.click();
      toast({ title: 'Downloaded', description: `ID card for ${student.name} downloaded` });
    } catch (error) {
      console.error('Error generating ID card:', error);
      toast({ title: 'Error', description: 'Failed to generate ID card', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadSelectedCards = async () => {
    if (selectedIds.size === 0) {
      toast({ title: 'No Selection', description: 'Please select students first', variant: 'destructive' });
      return;
    }
    setIsGenerating(true);
    const selectedStudents = students.filter(s => selectedIds.has(s.id));
    try {
      for (const student of selectedStudents) {
        await downloadSingleCard(student);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      toast({ title: 'Complete', description: `Downloaded ${selectedStudents.length} ID cards` });
    } catch (error) {
      console.error('Error downloading cards:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * Build a multi-page A4 PDF with multiple normal ID-size cards per page.
   * Keeps the full card UI visible (no cropping) while avoiding one-card-per-A4 output.
   */
  const getPrintLayout = (sizePercent: number, gapMm: number) => {
    const PAGE_W = 210;
    const PAGE_H = 297;
    const PAGE_MARGIN = 10;

    // Fixed print layout: exactly 6 cards per page (2 × 3)
    const columns = 2;
    const rows = 3;

    // Keep the same card artwork ratio.
    const CARD_SOURCE_W = 420;
    const CARD_SOURCE_H = 760;
    const CARD_ASPECT = CARD_SOURCE_W / CARD_SOURCE_H;

    const usableW = PAGE_W - PAGE_MARGIN * 2;
    const usableH = PAGE_H - PAGE_MARGIN * 2;

    const maxCardWFromGrid = (usableW - (columns - 1) * gapMm) / columns;
    const maxCardHFromGrid = (usableH - (rows - 1) * gapMm) / rows;
    const maxFitCardH = Math.min(maxCardHFromGrid, maxCardWFromGrid / CARD_ASPECT);

    // 100% = fully fill the A4 page (no wasted space). Slider scales down from the max.
    const CARD_H = maxFitCardH * (sizePercent / 100);
    const CARD_W = CARD_H * CARD_ASPECT;

    const contentW = columns * CARD_W + (columns - 1) * gapMm;
    const contentH = rows * CARD_H + (rows - 1) * gapMm;

    return {
      columns,
      rows,
      cardsPerPage: columns * rows,
      CARD_W,
      CARD_H,
      CARD_GAP: gapMm,
      START_X: (PAGE_W - contentW) / 2,
      START_Y: (PAGE_H - contentH) / 2,
    };
  };

  const buildPDFFromStudents = async (
    list: StudentData[],
    opts: { autoPrint?: boolean; filename?: string }
  ) => {
    if (list.length === 0) {
      toast({ title: 'No Students', description: 'Nothing to export', variant: 'destructive' });
      return;
    }
    setIsGenerating(true);
    setPdfProgress({ done: 0, total: list.length, stage: 'Rendering cards' });
    const t0 = performance.now();
    try {
      const { columns, cardsPerPage, CARD_W, CARD_H, CARD_GAP, START_X, START_Y } = getPrintLayout(printSizePercent, printGapMm);

      // Warm the logo cache once so parallel workers don't race the fetch.
      await loadLogoDataUrl();

      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      pdf.setProperties({
        title: `Student ID Cards – ${SCHOOL_NAME}`,
        subject: `Academic Year ${ACADEMIC_YEAR}`,
        author: SCHOOL_NAME,
        creator: 'Presences AI',
      });

      // Render cards in small parallel batches for a big speed win while
      // keeping the main thread responsive. Order is preserved by index.
      const CONCURRENCY = 3;
      const dataUrls: string[] = new Array(list.length);
      let completed = 0;

      for (let start = 0; start < list.length; start += CONCURRENCY) {
        const slice = list.slice(start, start + CONCURRENCY);
        await Promise.all(
          slice.map(async (student, k) => {
            const idx = start + k;
            dataUrls[idx] = await generateIDCard(student);
            completed += 1;
            setPdfProgress({ done: completed, total: list.length, stage: 'Rendering cards' });
          })
        );
        // Yield to the browser so the progress bar animates smoothly.
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }

      setPdfProgress({ done: list.length, total: list.length, stage: 'Assembling PDF' });

      // Faint cut-mark helper for a premium print finish.
      const drawCutMarks = (x: number, y: number, w: number, h: number) => {
        pdf.setDrawColor(210);
        pdf.setLineWidth(0.1);
        const m = 1.6;
        // corners only, very subtle
        pdf.line(x - m, y, x - 0.2, y);
        pdf.line(x, y - m, x, y - 0.2);
        pdf.line(x + w + 0.2, y, x + w + m, y);
        pdf.line(x + w, y - m, x + w, y - 0.2);
        pdf.line(x - m, y + h, x - 0.2, y + h);
        pdf.line(x, y + h + 0.2, x, y + h + m);
        pdf.line(x + w + 0.2, y + h, x + w + m, y + h);
        pdf.line(x + w, y + h + 0.2, x + w, y + h + m);
      };

      for (let i = 0; i < list.length; i++) {
        if (i > 0 && i % cardsPerPage === 0) pdf.addPage();
        const slotIndex = i % cardsPerPage;
        const row = Math.floor(slotIndex / columns);
        const col = slotIndex % columns;
        const x = START_X + col * (CARD_W + CARD_GAP);
        const y = START_Y + row * (CARD_H + CARD_GAP);
        // JPEG @ MEDIUM keeps the file lean and rendering fast in Preview/Acrobat.
        pdf.addImage(dataUrls[i], 'JPEG', x, y, CARD_W, CARD_H, undefined, 'MEDIUM');
        drawCutMarks(x, y, CARD_W, CARD_H);
      }

      const totalPages = Math.ceil(list.length / cardsPerPage);

      if (opts.autoPrint) {
        pdf.autoPrint();
        const blob = pdf.output('blob');
        const blobUrl = URL.createObjectURL(blob);
        const w = window.open(blobUrl, '_blank');
        if (!w) {
          // Pop-up blocked → try hidden iframe print before download fallback
          const iframe = document.createElement('iframe');
          iframe.style.position = 'fixed';
          iframe.style.right = '0';
          iframe.style.bottom = '0';
          iframe.style.width = '0';
          iframe.style.height = '0';
          iframe.style.border = '0';
          iframe.src = blobUrl;
          iframe.onload = () => {
            try {
              iframe.contentWindow?.focus();
              iframe.contentWindow?.print();
            } catch {
              pdf.save(opts.filename || 'student-id-cards.pdf');
            }
            window.setTimeout(() => {
              URL.revokeObjectURL(blobUrl);
              iframe.remove();
            }, 1500);
          };
          document.body.appendChild(iframe);
          toast({ title: 'Print opened', description: 'If print dialog did not open, the PDF will download.' });
        } else {
          window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        }
      } else {
        pdf.save(opts.filename || 'student-id-cards.pdf');
      }

      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      toast({
        title: 'PDF Ready',
        description: `${list.length} card(s) · ${totalPages} A4 page(s) · ${secs}s`,
      });
    } catch (e) {
      console.error('PDF export error:', e);
      toast({ title: 'Error', description: 'Failed to build PDF', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
      setPdfProgress(null);
    }
  };

  const exportPDF = (autoPrint: boolean) => {
    const list = selectedIds.size > 0
      ? students.filter(s => selectedIds.has(s.id))
      : students;
    return buildPDFFromStudents(list, {
      autoPrint,
      filename: `student-id-cards_${list.length}.pdf`,
    });
  };

  const renderQRDataUrl = async (value: string, sizePx = 1024): Promise<string> => {
    const holder = document.createElement('div');
    holder.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
    document.body.appendChild(holder);
    const { createRoot } = await import('react-dom/client');
    const root = createRoot(holder);
    await new Promise<void>((resolve) => {
      root.render(
        <QRCodeSVG value={value} size={sizePx} level="H" bgColor="#ffffff" fgColor="#000000" includeMargin={false} />
      );
      setTimeout(resolve, 80);
    });
    const svg = holder.querySelector('svg');
    const svgStr = svg ? new XMLSerializer().serializeToString(svg) : '';
    root.unmount();
    holder.remove();
    const svg64 = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('qr load')); img.src = svg64; });
    const canvas = document.createElement('canvas');
    canvas.width = sizePx;
    canvas.height = sizePx;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sizePx, sizePx);
    ctx.drawImage(img, 0, 0, sizePx, sizePx);
    return canvas.toDataURL('image/png');
  };

  const exportQRSheet = async (autoPrint: boolean) => {
    const list = selectedIds.size > 0
      ? students.filter(s => selectedIds.has(s.id))
      : students;
    if (list.length === 0) {
      toast({ title: 'No students', description: 'Add or select students first', variant: 'destructive' });
      return;
    }

    setIsGenerating(true);
    setPdfProgress({ stage: 'Rendering QR codes', done: 0, total: list.length });

    try {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      const PAGE_W = 210;
      const PAGE_H = 297;
      const MARGIN = 8;
      const COLS = 2;
      const ROWS = 3;
      const PER_PAGE = COLS * ROWS;
      const GAP = 6;
      const CELL_W = (PAGE_W - MARGIN * 2 - GAP * (COLS - 1)) / COLS;
      const CELL_H = (PAGE_H - MARGIN * 2 - GAP * (ROWS - 1)) / ROWS;
      const TEXT_BAND = 16;
      const QR_SIZE = Math.min(CELL_W, CELL_H - TEXT_BAND) - 4;

      for (let i = 0; i < list.length; i++) {
        const student = list[i];
        if (i > 0 && i % PER_PAGE === 0) pdf.addPage();
        const idxOnPage = i % PER_PAGE;
        const col = idxOnPage % COLS;
        const row = Math.floor(idxOnPage / COLS);
        const cellX = MARGIN + col * (CELL_W + GAP);
        const cellY = MARGIN + row * (CELL_H + GAP);

        pdf.setDrawColor(210);
        pdf.setLineWidth(0.2);
        pdf.roundedRect(cellX, cellY, CELL_W, CELL_H, 2, 2, 'S');

        const qrData = JSON.stringify({
          type: 'student_id',
          id: student.id,
          user_id: student.id,
          student_id: student.employee_id,
          name: student.name,
          employee_id: student.employee_id,
          category: student.category,
          version: 2,
        });
        const qrPng = await renderQRDataUrl(qrData, 1024);

        const qrX = cellX + (CELL_W - QR_SIZE) / 2;
        const qrY = cellY + 3;
        pdf.addImage(qrPng, 'PNG', qrX, qrY, QR_SIZE, QR_SIZE, undefined, 'FAST');

        const textY = qrY + QR_SIZE + 7;
        pdf.setTextColor(15, 23, 42);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(18);
        pdf.text(String(student.employee_id || '—'), cellX + CELL_W / 2, textY, { align: 'center' });

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(110);
        const nameLine = (student.name || '').length > 34
          ? student.name.slice(0, 32) + '…'
          : student.name;
        pdf.text(nameLine, cellX + CELL_W / 2, textY + 5, { align: 'center' });

        const pct = Math.round(((i + 1) / list.length) * 100);
        setPdfProgress({ stage: 'Rendering QR codes', done: i + 1, total: list.length });
        if ((i + 1) % 2 === 0) await new Promise(r => requestAnimationFrame(() => r(null)));
      }

      const filename = `QR_Sheet_${list.length}_${new Date().toISOString().slice(0, 10)}.pdf`;
      if (autoPrint) {
        pdf.autoPrint();
        const blobUrl = pdf.output('bloburl');
        const w = window.open(blobUrl, '_blank');
        if (!w) pdf.save(filename);
      } else {
        pdf.save(filename);
      }
      toast({ title: 'QR sheet ready', description: `${list.length} QR codes · 6 per A4 page` });
    } catch (e) {
      console.error('QR sheet failed', e);
      toast({ title: 'QR sheet failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setPdfProgress(null);
      setIsGenerating(false);
    }
  };


  return (
    <Card className="border-border shadow-lg overflow-hidden">
      <CardHeader className="pb-4 border-b bg-gradient-to-r from-[#1e3a5f] to-[#0d2137]">
        <CardTitle className="flex items-center gap-3 text-white">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <span className="text-lg">School ID Card Generator</span>
            <p className="text-sm font-normal text-white/60">Professional ID cards with QR codes</p>
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-4 sm:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No registered students found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedIds.size === students.length}
                  onCheckedChange={selectAll}
                  id="select-all"
                />
                <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                  Select All ({students.length})
                </label>
              </div>

              <div className="w-full rounded-lg border border-border/60 p-3 sm:p-4 bg-muted/20 space-y-3">
                <p className="text-sm font-medium">PDF print layout (6 cards/page)</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Card size</span>
                      <span>{printSizePercent}%</span>
                    </div>
                    <Slider
                      value={[printSizePercent]}
                      min={85}
                      max={115}
                      step={1}
                      onValueChange={(v) => setPrintSizePercent(v[0] ?? 100)}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Gap between cards</span>
                      <span>{printGapMm}mm</span>
                    </div>
                    <Slider
                      value={[printGapMm]}
                      min={2}
                      max={10}
                      step={1}
                      onValueChange={(v) => setPrintGapMm(v[0] ?? 5)}
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={downloadSelectedCards}
                  disabled={selectedIds.size === 0 || isGenerating}
                  title="Download each selected card as a separate PNG"
                >
                  {isGenerating
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Working…</>
                    : <><FileDown className="w-4 h-4 mr-2" />PNGs ({selectedIds.size})</>
                  }
                </Button>

                <Button
                  onClick={() => exportPDF(false)}
                  disabled={isGenerating || students.length === 0}
                  title="Download A4 PDF with multiple standard-size ID cards per page"
                >
                  {isGenerating
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Building PDF…</>
                    : <><FileText className="w-4 h-4 mr-2" />
                        PDF ({selectedIds.size > 0 ? selectedIds.size : students.length})
                      </>
                  }
                </Button>

                <Button
                  variant="destructive"
                  onClick={removeDuplicateStudents}
                  disabled={isRemovingDuplicates || students.length === 0}
                  title="Delete duplicate student rows from the database (keeps the newest for each student)"
                >
                  {isRemovingDuplicates
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Removing…</>
                    : <><Trash2 className="w-4 h-4 mr-2" />Remove Duplicates</>
                  }
                </Button>

                <Button
                  variant="destructive"
                  onClick={deleteSelectedStudents}
                  disabled={isDeletingSelected || selectedIds.size === 0}
                  title="Permanently delete the selected students from the database"
                >
                  {isDeletingSelected
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting…</>
                    : <><Trash2 className="w-4 h-4 mr-2" />Delete Selected ({selectedIds.size})</>
                  }
                </Button>



                <Button
                  variant="secondary"
                  onClick={() => exportPDF(true)}
                  disabled={isGenerating || students.length === 0}
                  title="Open print dialog with multiple standard-size ID cards per page"
                >

                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>

                <Button
                  variant="outline"
                  onClick={() => exportQRSheet(false)}
                  disabled={isGenerating || students.length === 0}
                  title="Download A4 PDF with 6 large QR codes (with ID number) per page"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  QR Sheet ({selectedIds.size > 0 ? selectedIds.size : students.length})
                </Button>

                <Button
                  variant="secondary"
                  onClick={() => exportQRSheet(true)}
                  disabled={isGenerating || students.length === 0}
                  title="Print 6 large QR codes per A4 page (QR + ID number only)"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Print QR Sheet
                </Button>

              </div>

              {pdfProgress && (
                <div className="mt-3 p-3 rounded-lg border bg-muted/40">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-medium flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                      {pdfProgress.stage}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {pdfProgress.done} / {pdfProgress.total} ·{' '}
                      {Math.round((pdfProgress.done / Math.max(1, pdfProgress.total)) * 100)}%
                    </span>
                  </div>
                  <Progress
                    value={(pdfProgress.done / Math.max(1, pdfProgress.total)) * 100}
                    className="h-2"
                  />
                </div>
              )}
            </div>

            {/* Student Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {students.map((student) => (
                <motion.div
                  key={student.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    selectedIds.has(student.id)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                  }`}
                  onClick={() => toggleSelect(student.id)}
                >
                  <div className="absolute top-3 right-3">
                    <Checkbox
                      checked={selectedIds.has(student.id)}
                      onCheckedChange={() => toggleSelect(student.id)}
                    />
                  </div>
                  
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-lg border-2 border-primary/30 overflow-hidden bg-muted flex-shrink-0">
                      {student.avatar_url ? (
                        <img src={student.avatar_url} className="w-full h-full object-cover" alt={student.name} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><User className="w-6 h-6 text-muted-foreground" /></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{student.name}</p>
                      <p className="text-xs text-muted-foreground">{normalizeCardField(student.employee_id)}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-xs">
                      {getCategoryLabel(student.category)}
                    </Badge>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); setPreviewStudent(student); }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); downloadSingleCard(student); }}
                        disabled={isGenerating}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {/* Preview Modal - rendered via portal to escape overflow/scroll containers */}
      {createPortal(
        <AnimatePresence>
          {previewStudent && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-3 overflow-y-auto"
              style={{ margin: 0 }}
              onClick={() => setPreviewStudent(null)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="relative my-auto w-[310px] sm:w-[350px] max-w-[95vw]"
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute -top-10 right-0 text-white hover:bg-white/10 z-10"
                  onClick={() => setPreviewStudent(null)}
                >
                  <X className="w-5 h-5" />
                </Button>
                
                {/* Live Preview Card */}
                <div
                  ref={cardRef}
                  className="w-full rounded-2xl overflow-hidden shadow-2xl bg-white text-[#1a1a2e]"
                >
                  {/* Header */}
                  <div className="bg-gradient-to-r from-[#1e3a5f] to-[#0d2137] p-3 relative">
                    <div className="absolute inset-0 opacity-10" style={{
                      background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.1) 0px, rgba(255,255,255,0.1) 1px, transparent 1px, transparent 8px)'
                    }} />
                    <div className="relative z-10 flex items-center gap-2.5">
                      <img src={kvLogo} alt="Kendriya Vidyalaya Sangathan logo" loading="lazy" width={64} height={64} className="w-16 h-16 flex-shrink-0 bg-white rounded-full p-0 object-cover border-2 border-white shadow" />
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-white font-extrabold text-[13px] sm:text-sm leading-tight">{SCHOOL_NAME}</p>
                        <p className="text-amber-400 font-bold text-[11px] leading-tight">{SCHOOL_SUBNAME}</p>
                        <p className="text-blue-300 text-[9px] italic mt-0.5">{SCHOOL_TAGLINE}</p>
                      </div>
                    </div>
                    <p className="relative z-10 text-slate-300 text-[8px] mt-1.5 text-center leading-snug">
                      {SCHOOL_ADDRESS}<br/>{SCHOOL_AFFILIATION}
                    </p>
                  </div>

                  {/* Accent Stripe */}
                  <div className="h-1 bg-gradient-to-r from-amber-400 via-red-500 via-purple-500 to-blue-500" />

                  {/* Photo + Name */}
                  <div className="flex items-center gap-3 px-3 sm:px-4 pt-3 pb-2">
                    <div className="w-[75px] h-[88px] sm:w-[90px] sm:h-[100px] flex-shrink-0 rounded-lg overflow-hidden border-[3px] border-[#1e3a5f] bg-slate-100">
                      {previewStudent.avatar_url ? (
                        <img src={previewStudent.avatar_url} className="w-full h-full object-cover" alt={previewStudent.name} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl text-slate-300">👤</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base sm:text-lg font-extrabold text-[#1e3a5f] leading-tight truncate">{normalizeCardField(previewStudent.name)}</p>
                      <span className="inline-block mt-1 bg-[#1e3a5f] text-white text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded">
                        {getCategoryLabel(previewStudent.category)}
                      </span>
                      <p className="text-[10px] sm:text-[11px] text-slate-500 mt-1">
                        Academic Year: <strong className="text-[#1e3a5f]">{ACADEMIC_YEAR}</strong>
                      </p>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="px-3 sm:px-4 mt-1">
                    <div className="bg-slate-50 rounded-lg p-2.5 sm:p-3 border border-slate-200 text-[11px] sm:text-[12px]">
                      {[
                        ['Roll No.', normalizeCardField(previewStudent.roll_number)],
                        ['Student ID', normalizeCardField(previewStudent.employee_id)],
                        ['Blood Group', normalizeCardField(previewStudent.blood_group)],
                        ['Parent/Guardian', normalizeCardField(previewStudent.parent_name)],
                        ['Contact No.', normalizeCardField(previewStudent.parent_phone)],
                        ['Transport', normalizeCardField(previewStudent.transport_mode)],
                        ['Address', normalizeCardField(previewStudent.address)],
                      ].map(([label, value], i) => (
                        <div key={i} className="flex py-[4px]">
                          <span className={`text-slate-500 text-[10px] sm:text-[11px] ${label === 'Address' ? 'w-[40%] pt-[1px]' : 'w-[40%]'}`}>{label}</span>
                          <span className={`font-semibold break-words leading-snug ${label === 'Blood Group' ? 'text-red-600' : 'text-[#1e3a5f]'}`}>
                            : {value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* QR + Signature */}
                  <div className="flex items-stretch justify-between px-3 sm:px-4 pt-3 pb-2 gap-3">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className="border-2 border-[#1e3a5f] rounded-lg p-1.5 bg-white">
                        <QRCodeSVG
                          value={JSON.stringify({
                            type: 'student_id',
                            id: previewStudent.id,
                            user_id: previewStudent.id,
                            student_id: previewStudent.employee_id,
                            name: previewStudent.name,
                            employee_id: previewStudent.employee_id,
                            category: previewStudent.category,
                            version: 2,
                          })}
                          size={140}
                          level="H"
                          bgColor="#ffffff"
                          fgColor="#000000"
                        />
                      </div>
                      <p className="text-[9px] font-bold text-[#1e3a5f] tracking-wide mt-1">SCAN TO VERIFY</p>
                    </div>
                    <div className="flex-1 flex flex-col justify-end text-center">
                      <div className="border-t border-dashed border-[#1e3a5f] pt-2">
                        <p className="text-[11px] font-bold text-[#1e3a5f]">Principal</p>
                        <p className="text-[9px] text-slate-500">Signature & Seal</p>
                      </div>
                    </div>
                  </div>

                  <p className="px-3 text-center text-[8px] text-slate-500 leading-snug pb-1.5">
                    If found, please return to <strong>PM SHRI K.V. NFC Vigyan Vihar, Delhi</strong> · Tel: 011-22154398
                  </p>

                  {/* Footer */}
                  <div className="bg-gradient-to-r from-[#1e3a5f] to-[#0d2137] px-3 py-1.5 text-center">
                    <p className="text-[8px] sm:text-[9px] text-blue-300 tracking-wide">
                      Powered by RCA · Made by Gaurav Raj & Jatin Dhama
                    </p>
                  </div>
                </div>

                {/* Download Button */}
                <Button
                  className="w-full mt-3"
                  onClick={() => downloadSingleCard(previewStudent)}
                  disabled={isGenerating}
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  Download ID Card
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </Card>
  );
};

export default StudentIDCardGenerator;
