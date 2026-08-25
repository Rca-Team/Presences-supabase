import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[A-Za-z]{2,}$/;

function cleanEmail(v?: string | null): string | null {
  if (!v) return null;
  let c = String(v).trim();
  const angle = c.match(/<([^>]+)>/);
  if (angle) c = angle[1].trim();
  c = c.replace(/^mailto:/i, '').toLowerCase();
  return EMAIL_RE.test(c) ? c : null;
}

function cleanPhone(v?: string | null): string | null {
  if (!v) return null;
  const digits = String(v).replace(/[^\d]/g, '');
  if (digits.length < 10) return null;
  return digits.length === 10 ? `+91${digits}` : `+${digits.replace(/^0+/, '')}`;
}

/** Strips all spaces, punctuation, special chars, and lowercases for exact normalized matching. */
function strip(v?: string | null): string {
  return String(v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9]/g, '');
}

/** Tokenizes into cleaned lowercase words. */
function tokenize(v?: string | null): string[] {
  return String(v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/** Returns similarity score between 0.0 and 1.0 (1.0 = identical). */
function calculateNameSimilarity(s1: string, s2: string): number {
  const a = strip(s1);
  const b = strip(s2);
  if (!a || !b) return 0;
  if (a === b) return 1.0;
  if (a.includes(b) || b.includes(a)) {
    return Math.min(1.0, (Math.min(a.length, b.length) / Math.max(a.length, b.length)) + 0.15);
  }

  const maxLen = Math.max(a.length, b.length);
  const dist = levenshtein(a, b);
  return Math.max(0, (maxLen - dist) / maxLen);
}

interface Row {
  name?: string;
  email?: string;
  phone?: string;
  parent_name?: string;
  roll_number?: string;
  admission_number?: string;
  class?: string;
  section?: string;
}

interface UnifiedStudent {
  userId: string;
  profileId?: string;
  name: string;
  names: string[];
  roll?: string;
  admission?: string;
  studentId?: string;
  className?: string;
  section?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
      throw new Error('Backend configuration is unavailable');
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;
    if (claimsError || !userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['admin', 'principal'])
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const rows: Row[] = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: 'No rows provided' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (rows.length > 2000) {
      return new Response(JSON.stringify({ error: 'Max 2000 rows per upload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Fetch from profiles, face_descriptors, and attendance_records to aggregate all registered students
    const [profilesRes, descriptorsRes, attendanceRes] = await Promise.all([
      admin.from('profiles').select('id, user_id, display_name, full_name, roll_number, admission_number, class, section, metadata'),
      admin.from('face_descriptors').select('id, user_id, student_id, student_name, label, class, section, metadata'),
      admin.from('attendance_records').select('user_id, student_id, student_name, class, section').order('timestamp', { ascending: false }).limit(1000),
    ]);

    const studentMap = new Map<string, UnifiedStudent>();

    // Add profiles
    for (const p of profilesRes.data || []) {
      const uid = p.user_id || p.id;
      if (!uid) continue;
      const names = [p.display_name, p.full_name, p.metadata?.student_name].filter(Boolean) as string[];
      studentMap.set(uid, {
        userId: uid,
        profileId: p.id,
        name: p.display_name || p.full_name || 'Student',
        names,
        roll: p.roll_number || p.metadata?.roll_number,
        admission: p.admission_number || p.metadata?.admission_number,
        className: p.class || p.metadata?.class,
        section: p.section || p.metadata?.section,
      });
    }

    // Add / merge face_descriptors
    for (const d of descriptorsRes.data || []) {
      const uid = d.user_id || d.student_id || d.id;
      if (!uid) continue;
      const names = [d.student_name, d.label, d.metadata?.student_name, d.metadata?.display_name].filter(Boolean) as string[];
      if (studentMap.has(uid)) {
        const existing = studentMap.get(uid)!;
        existing.names = Array.from(new Set([...existing.names, ...names]));
        existing.studentId = existing.studentId || d.student_id;
        existing.className = existing.className || d.class;
        existing.section = existing.section || d.section;
      } else {
        studentMap.set(uid, {
          userId: uid,
          name: d.student_name || d.label || 'Student',
          names,
          studentId: d.student_id,
          className: d.class,
          section: d.section,
        });
      }
    }

    // Add / merge attendance records
    for (const a of attendanceRes.data || []) {
      const uid = a.user_id || a.student_id;
      if (!uid || !a.student_name) continue;
      if (studentMap.has(uid)) {
        const existing = studentMap.get(uid)!;
        existing.names = Array.from(new Set([...existing.names, a.student_name]));
      } else {
        studentMap.set(uid, {
          userId: uid,
          name: a.student_name,
          names: [a.student_name],
          studentId: a.student_id,
          className: a.class,
          section: a.section,
        });
      }
    }

    const allStudents = Array.from(studentMap.values());
    const results: any[] = [];
    let updated = 0, notFound = 0, invalid = 0;

    for (const row of rows) {
      const studentName = String(row.name ?? '').trim();
      const email = cleanEmail(row.email);
      const phone = cleanPhone(row.phone);
      const parentName = String(row.parent_name ?? '').trim() || null;
      const roll = String(row.roll_number ?? '').trim();
      const admission = String(row.admission_number ?? '').trim();
      const rowClass = String(row.class ?? '').trim();
      const rowSection = String(row.section ?? '').trim();

      if (!studentName && !roll && !admission) {
        invalid++;
        results.push({ name: studentName, status: 'invalid', message: 'Missing student name or identifier' });
        continue;
      }
      if (!email && !phone) {
        invalid++;
        results.push({ name: studentName, status: 'invalid', message: 'No valid email or phone' });
        continue;
      }

      let bestMatch: UnifiedStudent | null = null;
      let highestScore = 0;

      // 1. Check direct ID/Roll/Admission exact matches
      if (admission) {
        bestMatch = allStudents.find((s) => strip(s.admission) === strip(admission) || strip(s.studentId) === strip(admission)) || null;
      }
      if (!bestMatch && roll) {
        bestMatch = allStudents.find((s) => strip(s.roll) === strip(roll) || strip(s.studentId) === strip(roll)) || null;
      }

      // 2. Ultra-Robust Name Matching (Case, Space, Punctuation & Typo Agnostic)
      if (!bestMatch && studentName) {
        const rowTokens = tokenize(studentName);
        const rowStripped = strip(studentName);

        for (const student of allStudents) {
          for (const sName of student.names) {
            const dbStripped = strip(sName);
            const dbTokens = tokenize(sName);

            // A. Perfect Space-less match (e.g. "Swami anant vyas" === "swamianantvyas")
            if (rowStripped === dbStripped) {
              bestMatch = student;
              highestScore = 1.0;
              break;
            }

            // B. Token Set Match (all words in one exist in the other)
            if (rowTokens.length > 0 && dbTokens.length > 0) {
              const allRowInDb = rowTokens.every((rt) => dbTokens.includes(rt));
              const allDbInRow = dbTokens.every((dt) => rowTokens.includes(dt));
              if (allRowInDb || allDbInRow) {
                const score = 0.95;
                if (score > highestScore) {
                  highestScore = score;
                  bestMatch = student;
                }
              }
            }

            // C. Fuzzy Similarity / Typo tolerance (handles "Tarushi bharbwaj" vs "TARUSHI BHARDWAJ")
            const sim = calculateNameSimilarity(studentName, sName);
            if (sim >= 0.82 && sim > highestScore) {
              highestScore = sim;
              bestMatch = student;
            }
          }
          if (highestScore === 1.0) break;
        }

        // Optional class/section disambiguation if ambiguous
        if (bestMatch && highestScore < 1.0 && rowClass) {
          const classMatches = allStudents.filter((s) => {
            return s.names.some((sn) => calculateNameSimilarity(studentName, sn) >= 0.82) &&
              (!s.className || strip(s.className) === strip(rowClass));
          });
          if (classMatches.length === 1) {
            bestMatch = classMatches[0];
          }
        }
      }

      if (!bestMatch) {
        notFound++;
        results.push({ name: studentName, status: 'not_found', message: 'No matching student profile or face record' });
        continue;
      }

      // 3. Save parent details to profiles table
      const patch: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      if (email) patch.parent_email = email;
      if (phone) patch.parent_phone = phone;
      if (parentName) {
        patch.parent_name = parentName;
        patch.father_name = parentName;
      }
      if (rowClass) patch.class = rowClass;
      if (rowSection) patch.section = rowSection;
      if (roll) patch.roll_number = roll;
      if (admission) patch.admission_number = admission;

      if (bestMatch.profileId) {
        // Update existing profile
        const { error } = await admin.from('profiles').update(patch).eq('id', bestMatch.profileId);
        if (error) {
          results.push({ name: studentName, status: 'error', message: error.message });
          continue;
        }
      } else {
        // Create/Upsert profile linked to user_id
        const newProfile = {
          user_id: bestMatch.userId,
          display_name: bestMatch.name || studentName,
          full_name: bestMatch.name || studentName,
          role: 'student',
          ...patch,
        };
        const { error } = await admin.from('profiles').upsert(newProfile, { onConflict: 'user_id' });
        if (error) {
          results.push({ name: studentName, status: 'error', message: error.message });
          continue;
        }
      }

      // 4. Update metadata in face_descriptors as secondary backup
      try {
        await admin
          .from('face_descriptors')
          .update({
            metadata: { parent_email: email, parent_phone: phone, parent_name: parentName, class: rowClass || undefined, section: rowSection || undefined }
          })
          .or(`user_id.eq.${bestMatch.userId},student_id.eq.${bestMatch.userId}`);
      } catch (err) {
        console.warn('Metadata backup update warning:', err);
      }

      updated++;
      results.push({
        name: `${studentName} ➔ ${bestMatch.name}`,
        status: 'updated',
        message: [email, phone].filter(Boolean).join(' · '),
      });
    }

    return new Response(
      JSON.stringify({ summary: { total: rows.length, updated, notFound, invalid }, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Import failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
