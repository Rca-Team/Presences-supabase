/**
 * GalleryScopeService
 *
 * Restricts the face-recognition gallery to the students a signed-in class
 * teacher is responsible for. Admins/principals (and anyone without class
 * assignments) keep the full school-wide gallery.
 *
 * Scoping the gallery has two benefits on a classroom smart-board:
 *   • accuracy — far fewer look-alike candidates to confuse the matcher
 *   • performance — a smaller vector index and fewer descriptors in memory
 */

import { supabase } from '@/integrations/supabase/client';
import { fetchTeacherCategories, parseClassSection } from '@/utils/teacherAccess';

const SCOPE_TTL_MS = 5 * 60 * 1000;

export interface GalleryScope {
  /** Allowed `user_id` values, or null for unrestricted (admin/principal). */
  userIds: Set<string> | null;
  categories: string[];
}

let cached: { at: number; scope: GalleryScope } | null = null;
let inFlight: Promise<GalleryScope> | null = null;

const UNRESTRICTED: GalleryScope = { userIds: null, categories: [] };

export function clearGalleryScope() {
  cached = null;
  inFlight = null;
}

async function resolve(): Promise<GalleryScope> {
  const db = supabase as any;

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return UNRESTRICTED;

  // Admin / principal → full gallery
  const roles = await db.from('user_roles').select('role').eq('user_id', user.id);
  const roleList: string[] = (roles?.data || []).map((r: any) => String(r.role));
  if (roleList.includes('admin') || roleList.includes('principal')) return UNRESTRICTED;

  const categories = await fetchTeacherCategories(user.id);
  if (categories.length === 0) return UNRESTRICTED;

  const allowed = new Set<string>();
  // The teacher's own face stays in the gallery so they can be recognised too.
  allowed.add(user.id);

  for (const category of categories) {
    const parsed = parseClassSection(category);

    const byCategory = await db.from('profiles').select('user_id').eq('category', category);
    (byCategory?.data || []).forEach((r: any) => r?.user_id && allowed.add(r.user_id));

    if (parsed) {
      const byClass = await db
        .from('profiles')
        .select('user_id')
        .eq('class', parsed.className)
        .eq('section', parsed.section);
      (byClass?.data || []).forEach((r: any) => r?.user_id && allowed.add(r.user_id));

      const registered = await db
        .from('attendance_records')
        .select('user_id')
        .eq('class', parsed.className)
        .eq('section', parsed.section)
        .eq('status', 'registered');
      (registered?.data || []).forEach((r: any) => r?.user_id && allowed.add(r.user_id));
    }
  }

  return { userIds: allowed, categories };
}

export async function getGalleryScope(): Promise<GalleryScope> {
  if (cached && Date.now() - cached.at < SCOPE_TTL_MS) return cached.scope;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const scope = await resolve();
      cached = { at: Date.now(), scope };
      return scope;
    } catch (err) {
      console.warn('Gallery scope resolution failed, using full gallery:', err);
      return UNRESTRICTED;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * True when a face-sample row belongs to the current scope.
 * Unrestricted scopes (admin/principal) accept everything. Class-teacher scopes
 * accept a row when the owner is on the roster OR the row itself carries the
 * teacher's class/section/category — this covers students registered without a
 * matching `profiles` entry.
 */
export function isRowInGalleryScope(scope: GalleryScope, row: any): boolean {
  if (!scope.userIds) return true;
  if (row?.user_id && scope.userIds.has(row.user_id)) return true;
  if (scope.categories.length === 0) return false;

  const rowCategory = String(row?.category || row?.metadata?.category || '').trim().toUpperCase();
  if (rowCategory && scope.categories.some(c => c.toUpperCase() === rowCategory)) return true;

  const cls = String(row?.class || '').trim();
  const sec = String(row?.section || '').trim().toUpperCase();
  if (cls && sec) {
    const combined = `${cls}-${sec}`;
    if (scope.categories.some(c => c.toUpperCase() === combined)) return true;
  }
  return false;
}
