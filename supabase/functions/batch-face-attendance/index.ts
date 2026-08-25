import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MATCH_THRESHOLD = 0.45;
const AMBIGUITY_RATIO = 0.82;
const MIN_ATTENDANCE_CONFIDENCE = 0.65;

function euclidean(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return Infinity;
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

function distanceToConfidence(dist: number): number {
  const k = 14;
  return 1 / (1 + Math.exp(k * (dist - MATCH_THRESHOLD)));
}

function parseStoredDescriptor(raw: unknown): Float32Array | null {
  try {
    if (!raw) return null;
    if (typeof raw === 'string') {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Float32Array(arr);
    }
    if (Array.isArray(raw)) return new Float32Array(raw as number[]);
    return null;
  } catch { return null; }
}

interface CapturedItem {
  clientId: string;
  descriptor: number[];
  imageDataUrl?: string;
  capturedAt: string;
}

async function processBatch(supabase: any, items: CapturedItem[]) {
  // Group per-user across BOTH sources: face_descriptors table + legacy attendance_records registrations
  const perUser = new Map<string, { userName: string; studentId: string | null; descs: Float32Array[] }>();

  // --- Source 1: face_descriptors table (new path) ---
  const { data: rows, error } = await supabase
    .from('face_descriptors')
    .select('user_id, descriptor, descriptors');
  if (error) console.warn('face_descriptors load failed:', error.message);

  const userIds = Array.from(new Set((rows || []).map((r: any) => r.user_id).filter(Boolean)));
  const nameMap = new Map<string, { name: string }>();
  if (userIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('user_id, full_name, display_name, email')
      .in('user_id', userIds);
    for (const p of profs || []) {
      nameMap.set(p.user_id, { name: p.full_name || p.display_name || p.email || 'Unknown' });
    }
  }

  for (const r of rows || []) {
    const list: unknown[] = Array.isArray(r.descriptors) ? r.descriptors : (r.descriptor ? [r.descriptor] : []);
    for (const raw of list) {
      const d = parseStoredDescriptor(raw);
      if (!d) continue;
      const key = r.user_id;
      if (!perUser.has(key)) {
        perUser.set(key, {
          userName: nameMap.get(key)?.name || 'Unknown',
          studentId: null,
          descs: [],
        });
      }
      perUser.get(key)!.descs.push(d);
    }
  }

  // --- Source 2: legacy attendance_records registrations (old data path) ---
  // Descriptors stored as string inside device_info.metadata.faceDescriptor
  const { data: regRows, error: regErr } = await supabase
    .from('attendance_records')
    .select('id, user_id, device_info')
    .eq('status', 'registered');
  if (regErr) console.warn('legacy registrations load failed:', regErr.message);

  for (const r of regRows || []) {
    const di = r.device_info as any;
    const meta = di?.metadata || {};
    const rawDesc = meta.faceDescriptor ?? meta.face_descriptor ?? meta.descriptor;
    const d = parseStoredDescriptor(rawDesc);
    if (!d) continue;
    // Use user_id when present, otherwise fall back to employee_id or the record id as a stable key
    const key = r.user_id || meta.employee_id || r.id;
    const displayName = meta.name || meta.full_name || 'Unknown';
    if (!perUser.has(key)) {
      perUser.set(key, {
        userName: displayName,
        studentId: meta.employee_id || null,
        descs: [],
      });
    } else if (perUser.get(key)!.userName === 'Unknown' && displayName !== 'Unknown') {
      perUser.get(key)!.userName = displayName;
    }
    perUser.get(key)!.descs.push(d);
  }



  const results: any[] = [];

  // Load configured cutoff (HH:MM) from attendance_settings; default 09:00
  let cutoffTime = '09:00';
  try {
    const { data: cutoffRow } = await supabase
      .from('attendance_settings')
      .select('value')
      .eq('key', 'cutoff_time')
      .maybeSingle();
    if (cutoffRow?.value && /^\d{1,2}:\d{2}/.test(cutoffRow.value)) cutoffTime = cutoffRow.value;
  } catch (e) { console.warn('cutoff_time load failed', e); }
  const [cH, cM] = cutoffTime.split(':').map(Number);

  // Compare against the capture time in the school timezone (Asia/Kolkata).
  // Using Intl avoids the UTC-vs-local pitfall of setHours() inside a Deno edge function.
  const tz = 'Asia/Kolkata';
  const nowInTz = (iso?: string) => {
    const d = iso ? new Date(iso) : new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit',
    }).formatToParts(d);
    const h = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
    const m = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
    return h * 60 + m;
  };
  const cutoffMinutes = cH * 60 + cM;

  for (const item of items) {
    const query = new Float32Array(item.descriptor);
    // find best per name (dedupe multiple user_ids for same person)
    const perName = new Map<string, { userId: string; userName: string; studentId: string | null; dist: number }>();
    for (const [uid, info] of perUser) {
      let best = Infinity;
      for (const d of info.descs) {
        if (d.length !== query.length) continue;
        const dist = euclidean(query, d);
        if (dist < best) best = dist;
      }
      if (!Number.isFinite(best)) continue;
      const key = info.userName.trim().toLowerCase();
      const prev = perName.get(key);
      if (!prev || best < prev.dist) {
        perName.set(key, { userId: uid, userName: info.userName, studentId: info.studentId, dist: best });
      }
    }
    const ranked = Array.from(perName.values()).sort((a, b) => a.dist - b.dist);
    const best = ranked[0];
    const second = ranked[1];

    if (!best || best.dist > MATCH_THRESHOLD) {
      results.push({ clientId: item.clientId, recognized: false, reason: 'no_match' });
      continue;
    }
    if (second && best.dist / second.dist > AMBIGUITY_RATIO) {
      results.push({ clientId: item.clientId, recognized: false, reason: 'ambiguous' });
      continue;
    }
    const confidence = Math.max(0, Math.min(1, distanceToConfidence(best.dist)));
    if (confidence < MIN_ATTENDANCE_CONFIDENCE) {
      results.push({ clientId: item.clientId, recognized: false, reason: 'low_confidence', confidence });
      continue;
    }

    // Skip if already marked today
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const { data: existing } = await supabase
      .from('attendance_records')
      .select('id, status')
      .eq('user_id', best.userId)
      .in('status', ['present', 'late'])
      .gte('timestamp', dayStart.toISOString())
      .limit(1)
      .maybeSingle();
    if (existing) {
      results.push({ clientId: item.clientId, recognized: true, name: best.userName, alreadyMarked: true, confidence });
      continue;
    }

    const nowIso = item.capturedAt || new Date().toISOString();
    const status = nowInTz(nowIso) > cutoffMinutes ? 'late' : 'present';
    const { error: insErr } = await supabase.from('attendance_records').insert({
      user_id: best.userId,
      status,
      method: 'face',
      confidence,
      confidence_score: confidence,
      timestamp: nowIso,
      date: nowIso.slice(0, 10),
      device_info: {
        source: 'loop-mode',
        capture_mode: 'ai-scan',
        confidence,
        metadata: { name: best.userName },
      },
      metadata: { name: best.userName, source: 'loop-mode' },
    });

    if (insErr) {
      results.push({ clientId: item.clientId, recognized: true, name: best.userName, error: insErr.message });
    } else {
      results.push({ clientId: item.clientId, recognized: true, name: best.userName, status, confidence });
    }
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const items: CapturedItem[] = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) {
      return new Response(JSON.stringify({ error: 'No items' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = await processBatch(admin, items);
    const summary = {
      total: items.length,
      recognized: results.filter(r => r.recognized).length,
      marked: results.filter(r => r.status).length,
      alreadyMarked: results.filter(r => r.alreadyMarked).length,
      unrecognized: results.filter(r => !r.recognized).length,
    };
    return new Response(JSON.stringify({ ok: true, summary, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('batch-face-attendance error:', e);
    return new Response(JSON.stringify({ error: e?.message || 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
