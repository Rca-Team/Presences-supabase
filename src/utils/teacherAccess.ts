import { supabase } from '@/integrations/supabase/client';

const CLASS_ACCESS_PREFIX = 'class_access:';

const normalizeCategory = (value: string): string | null => {
  const raw = (value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d+)-([A-D])$/i);
  if (!match) return null;
  return `${match[1]}-${match[2].toUpperCase()}`;
};

export const parseClassSection = (category: string): { className: string; section: string } | null => {
  const normalized = normalizeCategory(category);
  if (!normalized) return null;
  const [className, section] = normalized.split('-');
  return { className, section };
};

const categoryFromPermissionKey = (key: string): string | null => {
  const raw = (key || '').trim();
  if (!raw) return null;
  if (raw.startsWith(CLASS_ACCESS_PREFIX)) {
    return normalizeCategory(raw.slice(CLASS_ACCESS_PREFIX.length));
  }
  if (/^\d+-[A-D]$/i.test(raw)) {
    return normalizeCategory(raw);
  }
  return null;
};

export const toClassAccessPermission = (category: string) => `${CLASS_ACCESS_PREFIX}${category}`;

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

export async function saveTeacherCategories(userId: string, categories: string[]): Promise<void> {
  const db = supabase as any;
  const normalized = [...new Set(categories.map(c => normalizeCategory(c)).filter(Boolean))] as string[];

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

  // 2. Insert into teacher_permissions with fallback
  for (const category of normalized) {
    const [cls, sec] = category.split('-');
    
    // Core payload supported by all schemas
    const corePermPayload: Record<string, any> = {
      teacher_id: userId,
      user_id: userId,
      class: cls,
      section: sec,
      category,
    };

    // Attempt 1: insert with core schema
    let { error: pError } = await db.from('teacher_permissions').insert(corePermPayload);

    if (pError) {
      // Attempt 2: Minimal fallback (user_id and category)
      const { error: minError } = await db.from('teacher_permissions').insert({
        user_id: userId,
        category,
      });
      if (minError) {
        console.warn('Could not insert teacher_permissions row:', minError);
      }
    }

    // 3. Insert into class_teachers with fallback
    const ctPayload: Record<string, any> = {
      class: cls,
      section: sec,
      category,
      teacher_id: userId,
      teacher_name: teacherName || 'Teacher',
    };

    if (teacherEmail) ctPayload.teacher_email = teacherEmail;
    ctPayload.role = 'class_teacher';

    let { error: ctError } = await db.from('class_teachers').insert(ctPayload);

    if (ctError) {
      // Fallback: without teacher_email / role
      const { error: minCtError } = await db.from('class_teachers').insert({
        class: cls,
        section: sec,
        category,
        teacher_id: userId,
        teacher_name: teacherName || 'Teacher',
      });
      if (minCtError) {
        console.warn('Could not insert class_teachers row:', minCtError);
      }
    }
  }
}

