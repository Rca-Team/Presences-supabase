import { supabase } from '@/integrations/supabase/client';
import { normalizeCategory } from '@/utils/teacherAccess';

export interface StudentIdentityMeta {
  studentId: string;
  classSection: string;
  name: string;
}

const isUuid = (val?: string | null): val is string =>
  typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

const identityCacheByUserId = new Map<string, StudentIdentityMeta>();
const identityCacheByName = new Map<string, StudentIdentityMeta>();
let isDirectoryLoaded = false;
let directoryLoadingPromise: Promise<void> | null = null;

const norm = (s?: string | null) => (s || '').trim().toLowerCase();

/**
 * Sanitizes and normalizes any combination of class, section, and category
 * so it NEVER produces double section concatenations like "11-A-A".
 */
export function normalizeClassSection(
  rawClass?: string | number | null,
  rawSection?: string | null,
  rawCategory?: string | null
): string {
  const clsStr = rawClass !== null && rawClass !== undefined ? String(rawClass).trim() : '';
  const secStr = rawSection !== null && rawSection !== undefined ? String(rawSection).trim().toUpperCase() : '';
  const catStr = rawCategory !== null && rawCategory !== undefined ? String(rawCategory).trim() : '';

  const clean = (s: string) =>
    s
      .replace(/^class\s+/i, '')
      .replace(/^(\d+|[IVXLCDM]+)[-_ ]*([A-Za-z])(?:[-_ ]+[A-Za-z])+$/i, '$1-$2')
      .trim();

  // 1. If category provided, normalize it first
  if (catStr && catStr !== '?' && catStr !== '—' && catStr !== 'unknown') {
    const cleanedCat = clean(catStr);
    const normCat = normalizeCategory(cleanedCat);
    if (normCat) return normCat;
    if (cleanedCat.toLowerCase() === 'teacher') return 'Teacher';
    if (cleanedCat.toLowerCase() === 'staff') return 'Staff';
    if (!cleanedCat.startsWith('?')) return cleanedCat;
  }

  // 2. If class provided
  if (clsStr && clsStr !== '?' && clsStr !== '—' && clsStr !== 'unknown') {
    const cleanedCls = clean(clsStr);

    // If cleanedCls already contains both class and section (e.g. "11-A")
    const normDirect = normalizeCategory(cleanedCls);
    if (normDirect) {
      return normDirect;
    }

    if (cleanedCls.toLowerCase() === 'teacher') return 'Teacher';
    if (cleanedCls.toLowerCase() === 'staff') return 'Staff';

    // If section provided and cleanedCls is pure class (e.g. "11" + "A")
    if (secStr && secStr !== '?' && secStr !== '—') {
      const combined = `${cleanedCls}-${secStr}`;
      const normCombined = normalizeCategory(combined);
      if (normCombined) return normCombined;
      return combined;
    }

    return cleanedCls;
  }

  // 3. Fallback to section if that's all that exists
  if (secStr && secStr !== '?' && secStr !== '—') {
    return secStr;
  }

  return '';
}

/**
 * Register or update an identity entry in the fast local cache
 */
export function registerStudentIdentity(meta: {
  userId?: string | null;
  name?: string | null;
  studentId?: string | null;
  classSection?: string | null;
}) {
  const validStudentId = meta.studentId && !isUuid(meta.studentId) ? String(meta.studentId).trim() : '';
  const validClassSection = meta.classSection && meta.classSection !== '?' ? normalizeClassSection(meta.classSection) : '';
  const name = meta.name?.trim() || '';

  if (!validStudentId && !validClassSection) return;

  const entry: StudentIdentityMeta = {
    studentId: validStudentId,
    classSection: validClassSection,
    name: name || 'Student',
  };

  if (meta.userId) {
    const existing = identityCacheByUserId.get(meta.userId);
    identityCacheByUserId.set(meta.userId, {
      studentId: validStudentId || existing?.studentId || '',
      classSection: validClassSection || existing?.classSection || '',
      name: name || existing?.name || 'Student',
    });
  }

  if (name) {
    const normKey = norm(name);
    const existing = identityCacheByName.get(normKey);
    identityCacheByName.set(normKey, {
      studentId: validStudentId || existing?.studentId || '',
      classSection: validClassSection || existing?.classSection || '',
      name: name || existing?.name || 'Student',
    });
  }
}

/**
 * Loads registered student identities from database (registered attendance records,
 * face descriptors, and profiles) into memory.
 */
export async function prefetchStudentIdentities(): Promise<void> {
  if (isDirectoryLoaded) return;
  if (directoryLoadingPromise) return directoryLoadingPromise;

  directoryLoadingPromise = (async () => {
    try {
      // 1. Fetch from face_descriptors
      const { data: descriptors } = await supabase
        .from('face_descriptors')
        .select('user_id, student_id, student_name, class, section, category, label')
        .not('student_id', 'is', null);

      (descriptors || []).forEach((row) => {
        const classSec = normalizeClassSection(row.class, row.section, row.category);
        const name = (row as any).student_name || row.label;
        registerStudentIdentity({
          userId: row.user_id,
          name,
          studentId: row.student_id,
          classSection: classSec,
        });
      });

      // 2. Fetch from attendance_records (status = 'registered')
      const { data: regRecords } = await supabase
        .from('attendance_records')
        .select('user_id, student_id, student_name, category, class, section, device_info')
        .eq('status', 'registered');

      (regRecords || []).forEach((r) => {
        const m = (r.device_info as any)?.metadata || {};
        const devName = r.student_name || m.name || (r.device_info as any)?.name;
        const devEmpId = r.student_id || m.employee_id || (r.device_info as any)?.employee_id || m.student_id;
        const cls = normalizeClassSection(r.class, r.section, r.category || m.class_section || m.department);

        registerStudentIdentity({
          userId: r.user_id,
          name: devName,
          studentId: devEmpId,
          classSection: cls,
        });
      });

      // 3. Fetch from profiles
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, admission_number, employee_id, class, section, display_name');

      (profs || []).forEach((p) => {
        const cls = normalizeClassSection(p.class, p.section);
        registerStudentIdentity({
          userId: p.user_id,
          name: p.display_name,
          studentId: p.admission_number || p.employee_id,
          classSection: cls,
        });
      });

      isDirectoryLoaded = true;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('presence:student-identities-loaded'));
      }
    } catch (err) {
      console.warn('[studentIdentityResolver] Failed to prefetch student identities:', err);
    } finally {
      directoryLoadingPromise = null;
    }
  })();

  return directoryLoadingPromise;
}

/**
 * Resolves human-readable student admission ID
 */
export function resolveStudentAdmissionId(record: any, fallback?: string): string {
  // 1. Direct record.student_id if valid human ID
  if (record?.student_id && !isUuid(record.student_id) && record.student_id !== 'unknown') {
    return String(record.student_id);
  }

  // 2. device_info metadata
  const devMeta = record?.device_info?.metadata;
  const devEmpId = devMeta?.employee_id || record?.device_info?.employee_id;
  if (devEmpId && !isUuid(devEmpId) && devEmpId !== 'unknown') {
    return String(devEmpId);
  }

  const devStudentId = devMeta?.student_id || record?.device_info?.student_id;
  if (devStudentId && !isUuid(devStudentId) && devStudentId !== 'unknown') {
    return String(devStudentId);
  }

  // 3. Cache lookup by user_id
  if (record?.user_id && identityCacheByUserId.has(record.user_id)) {
    const cached = identityCacheByUserId.get(record.user_id);
    if (cached?.studentId && !isUuid(cached.studentId)) return cached.studentId;
  }

  // 4. Cache lookup by student_name
  const name = record?.student_name || devMeta?.name || record?.device_info?.name;
  if (name) {
    const cached = identityCacheByName.get(norm(name));
    if (cached?.studentId && !isUuid(cached.studentId)) return cached.studentId;
  }

  // 5. If student_id was a UUID, lookup identityCacheByUserId with that UUID
  if (record?.student_id && isUuid(record.student_id) && identityCacheByUserId.has(record.student_id)) {
    const cached = identityCacheByUserId.get(record.student_id);
    if (cached?.studentId && !isUuid(cached.studentId)) return cached.studentId;
  }

  if (fallback) return fallback;
  return '';
}

/**
 * Resolves student class and section cleanly without duplicate suffixes
 */
export function resolveStudentClass(record: any, fallback?: string | null): string | null {
  if (!record) return fallback !== undefined ? fallback : null;

  // 1. Direct class, section, and category on record
  const fromRecord = normalizeClassSection(record.class, record.section, record.category);
  if (fromRecord) return fromRecord;

  // 2. device_info metadata
  const devMeta = record?.device_info?.metadata;
  if (devMeta) {
    const fromMeta = normalizeClassSection(
      devMeta.class,
      devMeta.section,
      devMeta.category || devMeta.class_section || devMeta.department
    );
    if (fromMeta) return fromMeta;
  }

  // 3. Cache lookup by user_id
  if (record?.user_id && identityCacheByUserId.has(record.user_id)) {
    const cached = identityCacheByUserId.get(record.user_id);
    if (cached?.classSection && cached.classSection !== '—') {
      const normalized = normalizeClassSection(cached.classSection);
      if (normalized) return normalized;
    }
  }

  // 4. Cache lookup by student_name
  const name = record?.student_name || devMeta?.name || record?.device_info?.name;
  if (name) {
    const cached = identityCacheByName.get(norm(name));
    if (cached?.classSection && cached.classSection !== '—') {
      const normalized = normalizeClassSection(cached.classSection);
      if (normalized) return normalized;
    }
  }

  // 5. If student_id was a UUID, lookup identityCacheByUserId with that UUID
  if (record?.student_id && isUuid(record.student_id) && identityCacheByUserId.has(record.student_id)) {
    const cached = identityCacheByUserId.get(record.student_id);
    if (cached?.classSection && cached.classSection !== '—') {
      const normalized = normalizeClassSection(cached.classSection);
      if (normalized) return normalized;
    }
  }

  return fallback !== undefined ? fallback : null;
}
