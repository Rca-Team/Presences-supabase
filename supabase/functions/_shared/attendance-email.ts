// Shared premium attendance email templates (school-ready, real-world use).
// Used by auto-parent-notification and send-notification.

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'notification';

export function esc(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text ?? '').replace(/[&<>"']/g, (m) => map[m]);
}

const THEME: Record<AttendanceStatus, {
  label: string;
  emoji: string;
  accent: string;
  accentSoft: string;
  ring: string;
  headline: (name: string) => string;
  line: (name: string, time: string, date: string) => string;
  note: string;
}> = {
  present: {
    label: 'Present',
    emoji: '✅',
    accent: '#16a34a',
    accentSoft: '#dcfce7',
    ring: '#16a34a',
    headline: (n) => `${n} is in school`,
    line: (n, t, d) => `${n} was verified at the school entrance and marked <strong>Present</strong> at <strong>${t}</strong> on ${d}.`,
    note: 'Thank you for ensuring timely attendance.',
  },
  late: {
    label: 'Late Arrival',
    emoji: '⏰',
    accent: '#d97706',
    accentSoft: '#fef3c7',
    ring: '#d97706',
    headline: (n) => `${n} arrived late`,
    line: (n, t, d) => `${n} reached school after the reporting time and was marked <strong>Late</strong> at <strong>${t}</strong> on ${d}.`,
    note: 'Kindly ensure your child reaches school before the reporting bell.',
  },
  absent: {
    label: 'Absent',
    emoji: '❌',
    accent: '#dc2626',
    accentSoft: '#fee2e2',
    ring: '#dc2626',
    headline: (n) => `${n} is marked absent`,
    line: (n, _t, d) => `${n} has not been recorded in school today (${d}) and is marked <strong>Absent</strong>.`,
    note: 'If this is unexpected, please contact the school office immediately.',
  },
  notification: {
    label: 'School Notice',
    emoji: '🔔',
    accent: '#1d4ed8',
    accentSoft: '#dbeafe',
    ring: '#1d4ed8',
    headline: (n) => `A message about ${n}`,
    line: (n) => `The school has shared an update regarding ${n}.`,
    note: '',
  },
};

export interface AttendanceEmailInput {
  studentName: string;
  parentName?: string | null;
  status: AttendanceStatus;
  time?: string;
  date?: string;
  className?: string | null;
  section?: string | null;
  photoUrl?: string | null;       // Student's registered face photo / ID avatar
  snapshotUrl?: string | null;    // Live capture snapshot where attendance was marked
  confidence?: number | null;
  method?: string | null;
  schoolName?: string;
  bodyOverride?: string | null;
  subjectOverride?: string | null;
}

function avatarBlock(name: string, photoUrl: string | null | undefined, ring: string, emoji: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  const hasPhoto = photoUrl && /^https?:\/\//i.test(photoUrl);

  const inner = hasPhoto
    ? `<img src="${esc(photoUrl)}" width="112" height="112" alt="${esc(name)}" style="width:112px;height:112px;border-radius:56px;object-fit:cover;display:block;margin:0 auto;border:0;outline:none;" />`
    : `<div style="width:112px;height:112px;border-radius:56px;background:#e5e7eb;color:#374151;font:700 38px Arial,sans-serif;line-height:112px;text-align:center;">${esc(initials || '?')}</div>`;

  return `
    <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
      <tr>
        <td align="center" style="padding:4px;">
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding:6px;border-radius:64px;background:${ring};">
                <table cellpadding="0" cellspacing="0" border="0">
                  <tr><td style="border-radius:60px;background:#ffffff;padding:4px;width:112px;height:112px;overflow:hidden;">${inner}</td></tr>
                </table>
              </td>
            </tr>
          </table>
          <div style="margin-top:-26px;position:relative;">
            <span style="display:inline-block;background:#ffffff;border-radius:20px;padding:4px 10px;font-size:20px;line-height:20px;box-shadow:0 1px 3px rgba(0,0,0,0.18);">${emoji}</span>
          </div>
        </td>
      </tr>
    </table>`;
}

function snapshotBlock(snapshotUrl?: string | null, time?: string, date?: string) {
  if (!snapshotUrl || !/^https?:\/\//i.test(snapshotUrl)) {
    return '';
  }

  return `
    <tr>
      <td style="padding:0 24px 20px;">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px;text-align:center;">
          <div style="font:700 12px Arial,sans-serif;color:#334155;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:10px;">
            📸 Live Verification Snapshot (Attendance Point)
          </div>
          <div style="display:inline-block;border-radius:10px;overflow:hidden;border:1px solid #cbd5e1;background:#0f172a;max-width:100%;">
            <img src="${esc(snapshotUrl)}" alt="Live Attendance Verification Snapshot" width="100%" style="max-width:480px;width:100%;height:auto;max-height:260px;object-fit:cover;display:block;margin:0 auto;" />
          </div>
          <div style="font:400 12px Arial,sans-serif;color:#64748b;margin-top:8px;">
            Captured live at attendance terminal · ${esc(time || '')} · ${esc(date || '')}
          </div>
        </div>
      </td>
    </tr>
  `;
}

export function buildAttendanceEmail(input: AttendanceEmailInput): { subject: string; html: string } {
  const status = (['present', 'late', 'absent'].includes(String(input.status)) ? input.status : 'notification') as AttendanceStatus;
  const t = THEME[status];
  const school = input.schoolName || 'PM Shri Kendriya Vidyalaya NFC Vigyan Vihar';
  const name = input.studentName || 'Student';
  const parent = input.parentName || 'Parent/Guardian';
  const now = new Date();
  const time = input.time || now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const date = input.date || now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const klass = [input.className, input.section].filter(Boolean).join(' - ');

  const subject = input.subjectOverride
    || (status === 'notification'
      ? `School Notice · ${name} · PM Shri KV NFC Vigyan Vihar`
      : `${t.emoji} ${t.label} · ${name} · ${date}`);

  const rows: Array<[string, string]> = [
    ['Student', name],
    ...(klass ? [['Class', klass] as [string, string]] : []),
    ['Status', `${t.emoji} ${t.label}`],
    ['Date', date],
    ...(status === 'absent' ? [] : [['Time', time] as [string, string]]),
    ...(input.method ? [['Verified by', String(input.method)] as [string, string]] : []),
    ...(typeof input.confidence === 'number' && input.confidence > 0
      ? [['Match confidence', `${Math.round(input.confidence * 100)}%`] as [string, string]]
      : []),
  ];

  const detailRows = rows
    .map(
      ([k, v], i) => `
      <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f9fafb'};">
        <td style="padding:10px 14px;font:400 13px Arial,sans-serif;color:#6b7280;white-space:nowrap;">${esc(k)}</td>
        <td style="padding:10px 14px;font:700 13px Arial,sans-serif;color:#111827;text-align:right;">${esc(v)}</td>
      </tr>`,
    )
    .join('');

  const body = input.bodyOverride
    ? `<p style="margin:0;font:400 15px/1.7 Arial,sans-serif;color:#374151;">${esc(input.bodyOverride).replace(/\n/g, '<br />')}</p>`
    : `<p style="margin:0;font:400 15px/1.7 Arial,sans-serif;color:#374151;">${t.line(esc(name), time, date)}</p>`;

  const kvsLogoUrl = 'https://cvdcbcsonlianbfeessy.supabase.co/storage/v1/object/public/face-images/kvs-emblem.png';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <div style="display:none;max-height:0;overflow:hidden;">${esc(name)} · ${esc(t.label)} · ${esc(date)} · PM Shri KV NFC Vigyan Vihar</div>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,0.08);">
        <!-- COLLABORATION HEADER: PM SHRI KV NFC VIGYAN VIHAR ✕ PRESENCE AI -->
        <tr>
          <td style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%);padding:18px 24px;border-bottom:3px solid ${t.accent};">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="52" valign="middle" style="width:52px;padding-right:14px;">
                  <img src="${kvsLogoUrl}" width="52" height="52" alt="KVS Emblem Logo" style="width:52px;height:52px;border-radius:26px;display:block;border:2px solid #ffffff;background:#ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.25);" />
                </td>
                <td valign="middle">
                  <div style="font:700 15px/1.3 Arial,sans-serif;color:#ffffff;letter-spacing:0.3px;">
                    PM SHRI KENDRIYA VIDYALAYA
                  </div>
                  <div style="font:600 12px/1.3 Arial,sans-serif;color:#cbd5e1;margin-top:2px;">
                    NFC VIGYAN VIHAR SHIFT-1
                  </div>
                  <div style="font:500 11px/1.3 Arial,sans-serif;color:#94a3b8;margin-top:4px;">
                    In Collaboration with <strong style="color:#38bdf8;font-weight:700;">Presence AI</strong> · Smart School Attendance
                  </div>
                </td>
                <td align="right" valign="middle" style="white-space:nowrap;font:600 12px Arial,sans-serif;color:#cbd5e1;">
                  ${esc(date)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:28px 24px 8px;background:${t.accentSoft};">
            ${avatarBlock(name, input.photoUrl, t.ring, t.emoji)}
            <h1 style="margin:18px 0 4px;font:700 22px Arial,sans-serif;color:#111827;">${esc(t.headline(name))}</h1>
            <div style="display:inline-block;margin-top:6px;background:${t.accent};color:#ffffff;border-radius:999px;padding:6px 16px;font:700 12px Arial,sans-serif;letter-spacing:.4px;text-transform:uppercase;">${t.emoji} ${esc(t.label)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <p style="margin:0 0 12px;font:400 15px Arial,sans-serif;color:#111827;">Dear ${esc(parent)},</p>
            ${body}
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
              ${detailRows}
            </table>
            ${t.note ? `<p style="margin:0;padding:12px 14px;background:${t.accentSoft};border-radius:10px;font:400 13px/1.6 Arial,sans-serif;color:#374151;">${esc(t.note)}</p>` : ''}
          </td>
        </tr>
        ${snapshotBlock(input.snapshotUrl, time, date)}
        <!-- FOOTER BRANDING -->
        <tr>
          <td style="padding:18px 24px 24px;border-top:1px solid #f1f5f9;background:#fafafa;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font:400 12px/1.6 Arial,sans-serif;color:#64748b;">
                  Official Automated Attendance Notification<br />
                  <strong>PM Shri Kendriya Vidyalaya NFC Vigyan Vihar</strong> &bull; Powered by <strong>Presence AI Engine</strong>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

/** Converts any storage URL or path (including old domain or signed token) into a clean, working public URL. */
export function normalizeToPublicStorageUrl(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let val = raw.trim();
  if (!val) return null;
  if (val.startsWith('data:')) return val;

  const currentProjectUrl = (Deno.env.get('SUPABASE_URL') || 'https://cvdcbcsonlianbfeessy.supabase.co').replace(/\/+$/, '');

  // 1. Rewrite any legacy or mismatched supabase project domain
  val = val.replace(/https:\/\/[a-z0-9-]+\.supabase\.co/gi, currentProjectUrl);

  // 2. Strip expired tokens and convert private sign endpoints to public
  if (val.includes('/storage/v1/object/')) {
    val = val.split('?')[0]; // Remove ?token=...
    val = val.replace('/storage/v1/object/sign/', '/storage/v1/object/public/');
    return val;
  }

  // 3. Handle relative paths
  const clean = val.replace(/^\/+/, '');
  const prefixMatch = clean.match(/^([^/]+)\/(.+)$/);
  if (prefixMatch && ['face-images', 'student-registration-faces', 'attendance-training-faces'].includes(prefixMatch[1])) {
    return `${currentProjectUrl}/storage/v1/object/public/${prefixMatch[1]}/${prefixMatch[2].split('?')[0]}`;
  }

  return `${currentProjectUrl}/storage/v1/object/public/face-images/${clean.split('?')[0]}`;
}

/** Resolves a student's registered face photo / ID image from profiles, face_descriptors, or storage objects. */
export async function resolveStudentPhotoUrl(
  admin: any,
  studentId?: string | null,
  studentName?: string | null
): Promise<string | null> {
  const sid = studentId?.trim() || '';
  const sname = studentName?.trim() || '';
  if (!sid && !sname) return null;

  try {
    // 1. Check profiles table
    let profileQuery = admin.from('profiles').select('photo_url, avatar_url');
    if (sid && /^[0-9a-f-]{36}$/i.test(sid)) {
      profileQuery = profileQuery.eq('user_id', sid);
    } else if (sid) {
      profileQuery = profileQuery.or(`student_id.eq.${sid},roll_number.eq.${sid},employee_id.eq.${sid},admission_number.eq.${sid},display_name.ilike.%${sid}%`);
    } else {
      profileQuery = profileQuery.or(`display_name.ilike.%${sname}%,full_name.ilike.%${sname}%`);
    }
    const { data: profile } = await profileQuery.limit(1).maybeSingle();
    const profileCandidate = profile?.photo_url || profile?.avatar_url;
    if (profileCandidate) {
      const normalized = normalizeToPublicStorageUrl(profileCandidate);
      if (normalized) return normalized;
    }

    // 2. Check face_descriptors table
    let descQuery = admin.from('face_descriptors').select('image_url').not('image_url', 'is', null);
    if (sid && /^[0-9a-f-]{36}$/i.test(sid)) {
      descQuery = descQuery.eq('user_id', sid);
    } else if (sid) {
      descQuery = descQuery.or(`student_id.eq.${sid},label.ilike.%${sid}%,student_name.ilike.%${sid}%`);
    } else {
      descQuery = descQuery.or(`label.ilike.%${sname}%,student_name.ilike.%${sname}%`);
    }
    const { data: descriptor } = await descQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (descriptor?.image_url) {
      const normalized = normalizeToPublicStorageUrl(descriptor.image_url);
      if (normalized) return normalized;
    }

    // 3. Search storage objects in buckets
    const searchTerms = [sid, sname].filter(Boolean);
    for (const term of searchTerms) {
      const { data: objects } = await admin
        .from('objects')
        .select('bucket_id, name')
        .in('bucket_id', ['student-registration-faces', 'face-images', 'attendance-training-faces'])
        .ilike('name', `%${term}%`)
        .ilike('name', '%.jpg')
        .order('created_at', { ascending: false })
        .limit(1);

      if (objects && objects.length > 0) {
        const obj = objects[0];
        const currentProjectUrl = (Deno.env.get('SUPABASE_URL') || 'https://cvdcbcsonlianbfeessy.supabase.co').replace(/\/+$/, '');
        return `${currentProjectUrl}/storage/v1/object/public/${obj.bucket_id}/${obj.name}`;
      }
    }

    // 4. Check attendance_records table for recent registered or recognized record
    let attQuery = admin.from('attendance_records').select('image_url').not('image_url', 'is', null);
    if (sid && /^[0-9a-f-]{36}$/i.test(sid)) {
      attQuery = attQuery.eq('user_id', sid);
    } else if (sid) {
      attQuery = attQuery.or(`student_id.eq.${sid},student_name.ilike.%${sid}%`);
    } else {
      attQuery = attQuery.ilike('student_name', `%${sname}%`);
    }
    const { data: attRecord } = await attQuery.order('timestamp', { ascending: false }).limit(1).maybeSingle();
    if (attRecord?.image_url) {
      const normalized = normalizeToPublicStorageUrl(attRecord.image_url);
      if (normalized) return normalized;
    }
  } catch (err) {
    console.warn('resolveStudentPhotoUrl error:', err);
  }

  return null;
}

/** Uploads a base64 data URL snapshot to public storage and returns a hosted URL (emails cannot render data URIs). */
export async function hostSnapshot(
  admin: any,
  studentId: string,
  imageUrl?: string | null,
): Promise<string | null> {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) {
    return normalizeToPublicStorageUrl(imageUrl);
  }
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(imageUrl.trim());
  if (!match) return null;
  try {
    const [, mime, b64] = match;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = mime.includes('png') ? 'png' : 'jpg';
    const path = `${studentId || 'unknown'}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    
    // Store in public face-images bucket for universal email accessibility
    const { error } = await admin.storage.from('face-images').upload(path, bytes, {
      contentType: mime,
      upsert: true,
    });
    if (error) {
      console.warn('Upload to face-images bucket error:', error);
      return null;
    }
    const { data } = admin.storage.from('face-images').getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (e) {
    console.error('hostSnapshot exception:', e);
    return null;
  }
}
