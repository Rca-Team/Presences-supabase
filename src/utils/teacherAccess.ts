import { supabase } from '@/integrations/supabase/client';
import { CLASSES, SECTIONS, ALL_CLASS_SECTIONS, type ClassSection } from '@/constants/schoolConfig';

const CLASS_ACCESS_PREFIX = 'class_access:';

export interface TeacherPermissions {
  can_take_attendance: boolean;
  can_edit_timetable: boolean;
  can_export_reports: boolean;
  can_manage_students: boolean;
  can_send_notifications: boolean;
  can_verify_leaves: boolean;
  can_view_analytics: boolean;
}

export const DEFAULT_TEACHER_PERMISSIONS: TeacherPermissions = {
  can_take_attendance: true,
  can_edit_timetable: true,
  can_export_reports: true,
  can_manage_students: true,
  can_send_notifications: false,
  can_verify_leaves: true,
  can_view_analytics: true,
};

export interface ClassTeacherAssignment {
  id: string;
  category: string;
  class: string;
  section: string;
  teacher_id: string;
  teacher_name: string;
  teacher_email?: string;
  role: 'class_teacher' | 'co_teacher' | 'subject_teacher' | string;
  created_at?: string;
}

export interface ClassMatrixSlot {
  category: string;
  class: string;
  section: string;
  wing: 'Primary' | 'Middle' | 'Secondary' | 'Senior Secondary';
  primaryTeacher: ClassTeacherAssignment | null;
  coTeachers: ClassTeacherAssignment[];
  isAssigned: boolean;
}

export const getWingForClass = (cls: string | number): 'Primary' | 'Middle' | 'Secondary' | 'Senior Secondary' => {
  const num = parseInt(String(cls), 10);
  if (num <= 5) return 'Primary';
  if (num <= 8) return 'Middle';
  if (num <= 10) return 'Secondary';
  return 'Senior Secondary';
};

export const normalizeCategory = (value: string): string | null => {
  const raw = (value || '').trim();
  if (!raw) return null;

  // Handle standard "6-A", "10-B"
  const directMatch = raw.match(/^(\d+)-([A-Z])$/i);
  if (directMatch) {
    return `${directMatch[1]}-${directMatch[2].toUpperCase()}`;
  }

  // Handle fuzzy formats like "6th A", "6th-A", "6 A", "Class 6 Section A", "Class 6-A", "Class 6 A", "6th_A", "6A", "VI-A", "VI A", "10th B", etc.
  const cleaned = raw.replace(/^class\s+/i, '').replace(/section\s+/i, '').trim();

  // Roman numerals mapping
  const romanMap: Record<string, string> = {
    i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10', xi: '11', xii: '12'
  };

  const match = cleaned.match(/^(\d+|[IVXLCDM]+)(?:st|nd|rd|th)?[\s\-_:]*([A-Z])$/i);
  if (match) {
    let cls = match[1].toLowerCase();
    if (romanMap[cls]) cls = romanMap[cls];
    const sec = match[2].toUpperCase();
    return `${cls}-${sec}`;
  }

  const fuzzyNumberMatch = raw.match(/(\d+)\s*(?:st|nd|rd|th)?[\s\-_:]*([A-Z])/i);
  if (fuzzyNumberMatch) {
    return `${fuzzyNumberMatch[1]}-${fuzzyNumberMatch[2].toUpperCase()}`;
  }

  return null;
};

export const parseClassSection = (category: string): { className: string; section: string } | null => {
  const normalized = normalizeCategory(category);
  if (!normalized) return null;
  const [className, section] = normalized.split('-');
  return { className, section };
};

export const matchesClassAndSection = (
  item: { class?: string | number | null; section?: string | null; category?: string | null; department?: string | null },
  targetClass: string | number,
  targetSection: string
): boolean => {
  const targetNorm = normalizeCategory(`${targetClass}-${targetSection}`);
  if (!targetNorm) return false;
  const [tClass, tSec] = targetNorm.split('-');

  // 1. Direct category match
  if (item.category) {
    const itemNorm = normalizeCategory(item.category);
    if (itemNorm === targetNorm) return true;
  }

  // 2. Department match
  if (item.department) {
    const deptNorm = normalizeCategory(item.department);
    if (deptNorm === targetNorm) return true;
  }

  // 3. Class + Section match
  if (item.class !== undefined && item.class !== null) {
    const cleanCls = String(item.class).replace(/[^0-9]/g, '');
    const cleanSec = item.section ? String(item.section).trim().toUpperCase() : '';

    if (item.section) {
      const rawCat = `${item.class}-${item.section}`;
      const norm = normalizeCategory(rawCat);
      if (norm === targetNorm) return true;
    }

    if (cleanCls === tClass && (!item.section || cleanSec === tSec)) {
      return cleanSec === tSec;
    }
  }

  return false;
};

export const categoryFromPermissionKey = (key: string): string | null => {
  const raw = (key || '').trim();
  if (!raw) return null;
  if (raw.startsWith(CLASS_ACCESS_PREFIX)) {
    return normalizeCategory(raw.slice(CLASS_ACCESS_PREFIX.length));
  }
  return normalizeCategory(raw);
};

export const toClassAccessPermission = (category: string) => `${CLASS_ACCESS_PREFIX}${category}`;

/**
 * Fetch all categories / classes assigned to a teacher
 */
export async function fetchTeacherCategories(userId: string): Promise<string[]> {
  const db = supabase as any;
  const categories = new Set<string>();

  const addFromRow = (row: any) => {
    const direct = normalizeCategory(String(row?.category || ''));
    if (direct) {
      categories.add(direct);
      return;
    }
    const cls = String(row?.class || '').trim();
    const sec = String(row?.section || '').trim();
    const combined = normalizeCategory(`${cls}-${sec}`);
    if (combined) categories.add(combined);
  };

  const permRows = await db
    .from('teacher_permissions')
    .select('category, class, section, teacher_id, user_id')
    .or(`teacher_id.eq.${userId},user_id.eq.${userId}`);

  if (!permRows.error && Array.isArray(permRows.data)) {
    permRows.data.forEach(addFromRow);
  }

  const classRows = await db
    .from('class_teachers')
    .select('category, class, section')
    .eq('teacher_id', userId);

  if (!classRows.error && Array.isArray(classRows.data)) {
    classRows.data.forEach(addFromRow);
  }

  return [...categories];
}

/**
 * Fetch granular permission flags for a teacher
 */
export async function fetchTeacherPermissions(userId: string): Promise<TeacherPermissions> {
  const db = supabase as any;
  try {
    const { data: rows, error } = await db
      .from('teacher_permissions')
      .select('can_take_attendance, can_edit_timetable, can_export_reports, metadata')
      .or(`teacher_id.eq.${userId},user_id.eq.${userId}`)
      .limit(1);

    if (error || !rows || rows.length === 0) {
      return DEFAULT_TEACHER_PERMISSIONS;
    }

    const row = rows[0];
    const meta = (row.metadata || {}) as any;

    return {
      can_take_attendance: row.can_take_attendance ?? meta.can_take_attendance ?? DEFAULT_TEACHER_PERMISSIONS.can_take_attendance,
      can_edit_timetable: row.can_edit_timetable ?? meta.can_edit_timetable ?? DEFAULT_TEACHER_PERMISSIONS.can_edit_timetable,
      can_export_reports: row.can_export_reports ?? meta.can_export_reports ?? DEFAULT_TEACHER_PERMISSIONS.can_export_reports,
      can_manage_students: meta.can_manage_students ?? DEFAULT_TEACHER_PERMISSIONS.can_manage_students,
      can_send_notifications: meta.can_send_notifications ?? DEFAULT_TEACHER_PERMISSIONS.can_send_notifications,
      can_verify_leaves: meta.can_verify_leaves ?? DEFAULT_TEACHER_PERMISSIONS.can_verify_leaves,
      can_view_analytics: meta.can_view_analytics ?? DEFAULT_TEACHER_PERMISSIONS.can_view_analytics,
    };
  } catch {
    return DEFAULT_TEACHER_PERMISSIONS;
  }
}

/**
 * Fetch full class-section assignment matrix for the school
 */
export async function fetchClassTeacherMatrix(): Promise<ClassMatrixSlot[]> {
  const db = supabase as any;
  const { data: ctRows } = await db.from('class_teachers').select('*');

  const assignmentsByCategory = new Map<string, ClassTeacherAssignment[]>();

  (ctRows || []).forEach((row: any) => {
    const directCat = normalizeCategory(row.category || `${row.class}-${row.section}`);
    if (!directCat) return;

    const assignment: ClassTeacherAssignment = {
      id: row.id,
      category: directCat,
      class: row.class || directCat.split('-')[0],
      section: row.section || directCat.split('-')[1],
      teacher_id: row.teacher_id,
      teacher_name: row.teacher_name || 'Teacher',
      teacher_email: row.teacher_email || undefined,
      role: row.role || 'class_teacher',
      created_at: row.created_at,
    };

    const existing = assignmentsByCategory.get(directCat) || [];
    assignmentsByCategory.set(directCat, [...existing, assignment]);
  });

  // Build matrix for ALL_CLASS_SECTIONS
  return ALL_CLASS_SECTIONS.map((category) => {
    const parsed = parseClassSection(category)!;
    const list = assignmentsByCategory.get(category) || [];
    const primary = list.find((a) => a.role === 'class_teacher') || list[0] || null;
    const coTeachers = list.filter((a) => a !== primary);

    return {
      category,
      class: parsed.className,
      section: parsed.section,
      wing: getWingForClass(parsed.className),
      primaryTeacher: primary,
      coTeachers,
      isAssigned: !!primary,
    };
  });
}

/**
 * Assign a teacher to a class-section
 */
export async function assignClassTeacher(
  classNum: string,
  section: string,
  teacherId: string,
  teacherName: string,
  teacherEmail?: string,
  role: 'class_teacher' | 'co_teacher' = 'class_teacher'
): Promise<void> {
  const db = supabase as any;
  const category = `${classNum}-${section.toUpperCase()}`;

  // If assigning as primary class teacher, unassign existing primary class teacher for this category
  if (role === 'class_teacher') {
    await db.from('class_teachers').delete().eq('category', category).eq('role', 'class_teacher');
  }

  const payload: Record<string, any> = {
    class: classNum,
    section: section.toUpperCase(),
    category,
    teacher_id: teacherId,
    teacher_name: teacherName || 'Teacher',
    role,
  };
  if (teacherEmail) payload.teacher_email = teacherEmail;

  const { error } = await db.from('class_teachers').insert(payload);
  if (error) {
    // Retry without email/role if schema variant differs
    await db.from('class_teachers').insert({
      class: classNum,
      section: section.toUpperCase(),
      category,
      teacher_id: teacherId,
      teacher_name: teacherName,
    });
  }

  // Also ensure teacher_permissions has this category entry
  const { data: existingPerm } = await db
    .from('teacher_permissions')
    .select('id')
    .eq('user_id', teacherId)
    .eq('category', category)
    .maybeSingle();

  if (!existingPerm?.id) {
    await db.from('teacher_permissions').insert({
      teacher_id: teacherId,
      user_id: teacherId,
      class: classNum,
      section: section.toUpperCase(),
      category,
      can_take_attendance: true,
      can_edit_timetable: true,
      can_export_reports: true,
    });
  }
}

/**
 * Unassign a teacher from a class-section
 */
export async function unassignClassTeacher(category: string, teacherId?: string): Promise<void> {
  const db = supabase as any;
  let query = db.from('class_teachers').delete().eq('category', category);
  if (teacherId) {
    query = query.eq('teacher_id', teacherId);
  }
  await query;

  if (teacherId) {
    await db.from('teacher_permissions').delete().eq('category', category).eq('user_id', teacherId);
  }
}

/**
 * Smart Auto-Allocation Algorithm:
 * Automatically balances workload and assigns available unassigned teachers to vacant classes
 */
export function calculateAutoAllocationPlan(
  vacantSlots: ClassMatrixSlot[],
  teachers: Array<{ id: string; user_id?: string; name: string; email?: string; currentWorkload?: number }>
): Array<{ slot: ClassMatrixSlot; teacher: { id: string; user_id?: string; name: string; email?: string } }> {
  if (vacantSlots.length === 0 || teachers.length === 0) return [];

  // Sort teachers by current workload ascending (lowest workload first)
  const sortedTeachers = [...teachers].sort((a, b) => (a.currentWorkload ?? 0) - (b.currentWorkload ?? 0));

  const plan: Array<{ slot: ClassMatrixSlot; teacher: { id: string; user_id?: string; name: string; email?: string } }> = [];
  let teacherIdx = 0;

  for (const slot of vacantSlots) {
    if (!slot.isAssigned) {
      const selectedTeacher = sortedTeachers[teacherIdx % sortedTeachers.length];
      plan.push({
        slot,
        teacher: selectedTeacher,
      });
      teacherIdx++;
    }
  }

  return plan;
}

/**
 * Atomic Swap Algorithm:
 * Swaps class assignments between two classes/sections
 */
export async function swapClassTeacherAssignments(categoryA: string, categoryB: string): Promise<void> {
  const db = supabase as any;
  const { data: rowsA } = await db.from('class_teachers').select('*').eq('category', categoryA);
  const { data: rowsB } = await db.from('class_teachers').select('*').eq('category', categoryB);

  // Clear both
  await db.from('class_teachers').delete().in('category', [categoryA, categoryB]);

  const [clsA, secA] = categoryA.split('-');
  const [clsB, secB] = categoryB.split('-');

  // Re-insert rowsA into categoryB
  for (const row of rowsA || []) {
    await db.from('class_teachers').insert({
      class: clsB,
      section: secB,
      category: categoryB,
      teacher_id: row.teacher_id,
      teacher_name: row.teacher_name,
      teacher_email: row.teacher_email,
      role: row.role || 'class_teacher',
    });
  }

  // Re-insert rowsB into categoryA
  for (const row of rowsB || []) {
    await db.from('class_teachers').insert({
      class: clsA,
      section: secA,
      category: categoryA,
      teacher_id: row.teacher_id,
      teacher_name: row.teacher_name,
      teacher_email: row.teacher_email,
      role: row.role || 'class_teacher',
    });
  }
}

export async function hasTeacherAccess(userId: string): Promise<boolean> {
  const db = supabase as any;
  const categories = await fetchTeacherCategories(userId);
  if (categories.length > 0) return true;

  const classTeacherRows = await db
    .from('class_teachers')
    .select('id')
    .eq('teacher_id', userId)
    .limit(1);

  if (!classTeacherRows.error && Array.isArray(classTeacherRows.data) && classTeacherRows.data.length > 0) {
    return true;
  }

  const legacyTeacherRows = await db
    .from('attendance_records')
    .select('id')
    .eq('user_id', userId)
    .eq('category', 'Teacher')
    .eq('status', 'registered')
    .limit(1);

  return !legacyTeacherRows.error && Array.isArray(legacyTeacherRows.data) && legacyTeacherRows.data.length > 0;
}

export async function saveTeacherCategories(
  userId: string,
  categories: string[],
  permissions?: Partial<TeacherPermissions>
): Promise<void> {
  const db = supabase as any;
  const normalized = [...new Set(categories.map((c) => normalizeCategory(c)).filter(Boolean))] as string[];

  // 1. Clear existing assignments safely
  try {
    await db.from('teacher_permissions').delete().or(`teacher_id.eq.${userId},user_id.eq.${userId}`);
  } catch (e) {
    console.warn('Could not clear teacher_permissions:', e);
  }

  try {
    await db.from('class_teachers').delete().eq('teacher_id', userId);
  } catch (e) {
    console.warn('Could not clear class_teachers:', e);
  }

  if (normalized.length === 0) return;

  let teacherName = '';
  let teacherEmail = '';
  try {
    const profile = await db
      .from('profiles')
      .select('display_name, full_name, email')
      .eq('user_id', userId)
      .maybeSingle();
    if (profile?.data) {
      teacherName = profile.data.display_name || profile.data.full_name || '';
      teacherEmail = profile.data.email || '';
    }
  } catch {
    // Ignore profile fetch failure
  }

  const perms = { ...DEFAULT_TEACHER_PERMISSIONS, ...(permissions || {}) };

  // 2. Insert into teacher_permissions with fallback
  for (const category of normalized) {
    const [cls, sec] = category.split('-');

    const corePermPayload: Record<string, any> = {
      teacher_id: userId,
      user_id: userId,
      class: cls,
      section: sec,
      category,
      can_take_attendance: perms.can_take_attendance,
      can_edit_timetable: perms.can_edit_timetable,
      can_export_reports: perms.can_export_reports,
      metadata: {
        can_manage_students: perms.can_manage_students,
        can_send_notifications: perms.can_send_notifications,
        can_verify_leaves: perms.can_verify_leaves,
        can_view_analytics: perms.can_view_analytics,
      },
    };

    let { error: pError } = await db.from('teacher_permissions').insert(corePermPayload);

    if (pError) {
      await db.from('teacher_permissions').insert({
        user_id: userId,
        category,
        can_take_attendance: perms.can_take_attendance,
        can_export_reports: perms.can_export_reports,
      });
    }

    // 3. Insert into class_teachers with fallback
    const ctPayload: Record<string, any> = {
      class: cls,
      section: sec,
      category,
      teacher_id: userId,
      teacher_name: teacherName || 'Teacher',
      role: 'class_teacher',
    };

    if (teacherEmail) ctPayload.teacher_email = teacherEmail;

    let { error: ctError } = await db.from('class_teachers').insert(ctPayload);

    if (ctError) {
      await db.from('class_teachers').insert({
        class: cls,
        section: sec,
        category,
        teacher_id: userId,
        teacher_name: teacherName || 'Teacher',
      });
    }
  }
}


