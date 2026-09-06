import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Normalize status consistently across the project
function normalizeStatus(status: string): string {
  const s = (status || '').toLowerCase().trim();
  if (s === 'unauthorized' || s.includes('present')) return 'present';
  if (s.includes('late')) return 'late';
  if (s.includes('absent')) return 'absent';
  return s;
}

function isSecondSaturday(date: Date): boolean {
  if (date.getDay() !== 6) return false;
  const dayOfMonth = date.getDate();
  return dayOfMonth >= 8 && dayOfMonth <= 14;
}

function isWorkingDayForSchool(date: Date): boolean {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0) return false; // Sunday
  if (dayOfWeek === 6) return !isSecondSaturday(date); // Saturday except 2nd Saturday
  return true; // Monday-Friday
}

function generateWorkingDays(year: number, month: number): number {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    if (isWorkingDayForSchool(date)) count++;
  }
  return count;
}

function buildMonthlySummary(dayMap: Record<string, { status: string; timestamp: string }>) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthStart = new Date(year, month, 1);
  const todayKey = now.toISOString().slice(0, 10);

  let workingDays = 0;
  let presentDays = 0;
  let lateDays = 0;
  let absentDays = 0;

  const totalMonthWorkingDays = generateWorkingDays(year, month);

  for (let d = new Date(monthStart); d <= now; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const isSchoolWork = isWorkingDayForSchool(d);
    const isCurrentDay = key === todayKey;
    const status = dayMap[key]?.status;

    if (status === 'present') {
      workingDays += 1;
      presentDays += 1;
    } else if (status === 'late') {
      workingDays += 1;
      lateDays += 1;
    } else if (status === 'absent') {
      workingDays += 1;
      absentDays += 1;
    } else if (isSchoolWork) {
      if (!isCurrentDay) {
        workingDays += 1;
        absentDays += 1;
      } else if (now.getHours() >= 12) {
        workingDays += 1;
        absentDays += 1;
      }
    }
  }

  const attendanceRate = workingDays > 0 ? Math.round(((presentDays + lateDays) / workingDays) * 100) : 100;

  let streak = 0;
  for (let d = new Date(now); d >= monthStart; d.setDate(d.getDate() - 1)) {
    const isWk = !isWorkingDayForSchool(d);
    const key = d.toISOString().slice(0, 10);
    const status = dayMap[key]?.status;
    if (status === 'present' || status === 'late') {
      streak += 1;
    } else if (isWk) {
      // Don't break streak on inactive weekends if preceding days were attended
      continue;
    } else if (key !== todayKey) {
      break;
    }
  }

  const todayIsWorking = isWorkingDayForSchool(now);
  const todayStatus = dayMap[todayKey]?.status || (!todayIsWorking ? 'weekend' : (now.getHours() >= 12 ? 'absent' : 'weekend'));
  const todayCheckinTime = dayMap[todayKey]?.timestamp || null;

  return { workingDays, totalMonthWorkingDays, presentDays, lateDays, absentDays, attendanceRate, streak, todayStatus, todayCheckinTime };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { student_id, phone } = await req.json();

    if (!student_id || !phone) {
      return new Response(
        JSON.stringify({ error: "student_id and phone are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanId = String(student_id).trim().substring(0, 50).toLowerCase();
    const cleanPhone = String(phone).trim().replace(/[^0-9]/g, "").slice(-10);

    if (cleanPhone.length < 10) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find registered student matching ID + phone
    const { data: registered, error: regError } = await supabase
      .from("attendance_records")
      .select("id, user_id, image_url, category, device_info")
      .eq("status", "registered");

    if (regError) throw regError;

    const matched = (registered || []).find((r: any) => {
      const di = r.device_info as any;
      const meta = di?.metadata || di || {};
      const empId = String(meta.employee_id || meta.roll_number || "").toLowerCase();
      const parentPhone = String(meta.parent_phone || meta.parentPhone || "");
      const phoneLast10 = parentPhone.replace(/[^0-9]/g, "").slice(-10);
      return empId === cleanId && phoneLast10 === cleanPhone;
    });

    if (!matched) {
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const di = matched.device_info as any;
    const meta = di?.metadata || di || {};
    const empId = String(meta.employee_id || meta.roll_number || "").toLowerCase();

    // Build all possible identifiers for this student (same logic as admin calendar)
    const userIds: string[] = [matched.id];
    if (matched.user_id) userIds.push(matched.user_id);
    if (empId) userIds.push(empId);
    const uniqueIds = [...new Set(userIds)];

    // Fetch ALL attendance records matching any identifier — include unauthorized
    const queries = uniqueIds.map(uid =>
      supabase
        .from("attendance_records")
        .select("id, status, timestamp, device_info")
        .or(`user_id.eq.${uid},id.eq.${uid}`)
        .in("status", ["present", "late", "unauthorized", "absent"])
        .order("timestamp", { ascending: true })
    );

    // Also query by employee_id in metadata
    if (empId) {
      queries.push(
        supabase
          .from("attendance_records")
          .select("id, status, timestamp, device_info")
          .contains("device_info", { metadata: { employee_id: empId } })
          .in("status", ["present", "late", "unauthorized", "absent"])
          .order("timestamp", { ascending: true })
      );
    }

    // Also fetch gate entries for this student
    queries.push(
      supabase
        .from("gate_entries")
        .select("id, student_id, student_name, entry_time, entry_type")
        .eq("is_recognized", true)
        .or(uniqueIds.map(uid => `student_id.eq.${uid}`).join(","))
        .order("entry_time", { ascending: true })
    );

    const results = await Promise.all(queries);

    // Deduplicate attendance records by ID, keep earliest per day
    const seen = new Set<string>();
    const allRecords = results.slice(0, -1).flatMap(r => r.data || []).filter((r: any) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      // Skip registration records
      const rdi = r.device_info as any;
      if (rdi?.registration) return false;
      return true;
    });

    // Gate entries (last result)
    const gateEntries = results[results.length - 1]?.data || [];

    // Build per-day map: normalize status, priority: present > late > absent
    const dayMap: Record<string, { status: string; timestamp: string }> = {};
    const statusPriority: Record<string, number> = { present: 3, late: 2, absent: 1 };

    for (const rec of allRecords) {
      const dateKey = rec.timestamp.substring(0, 10); // yyyy-MM-dd
      const status = normalizeStatus(rec.status);
      if (!statusPriority[status]) continue; // skip unknown statuses

      const existing = dayMap[dateKey];
      if (!existing) {
        dayMap[dateKey] = { status, timestamp: rec.timestamp };
      } else {
        // Higher priority status wins; for same priority, keep earliest timestamp
        const existingPriority = statusPriority[existing.status] || 0;
        const newPriority = statusPriority[status] || 0;
        if (newPriority > existingPriority) {
          dayMap[dateKey] = { status, timestamp: status !== 'absent' ? rec.timestamp : existing.timestamp };
        } else if (newPriority === existingPriority && new Date(rec.timestamp) < new Date(existing.timestamp)) {
          dayMap[dateKey] = { status, timestamp: rec.timestamp };
        }
      }
    }

    // Merge gate entries
    for (const ge of gateEntries) {
      const dateKey = ge.entry_time.substring(0, 10);
      if (!dayMap[dateKey]) {
        dayMap[dateKey] = { status: 'present', timestamp: ge.entry_time };
      }
    }

    const attendance = Object.values(dayMap).map(d => ({
      status: d.status,
      timestamp: d.timestamp,
    })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Fetch awarded badges for this student (any matching identifier)
    const badgeQueries = uniqueIds.map(uid =>
      supabase
        .from('student_badges')
        .select('id, badge_name, badge_type, awarded_at, metadata')
        .or(`user_id.eq.${uid},student_id.eq.${uid}`)
        .order('awarded_at', { ascending: false })
    );
    const badgeResults = await Promise.all(badgeQueries);
    const badgeSeen = new Set<string>();
    const badges = badgeResults
      .flatMap(r => r.data || [])
      .filter((b: any) => {
        if (badgeSeen.has(b.id)) return false;
        badgeSeen.add(b.id);
        return true;
      });

    const studentIdCandidates = [empId, ...uniqueIds].map((v) => String(v || '').toLowerCase()).filter(Boolean);

    let leaderboardQuery = supabase
      .from('class_leaderboard')
      .select('id, student_id, student_name, class, section, score, rank, updated_at')
      .order('rank', { ascending: true, nullsFirst: false })
      .order('score', { ascending: false })
      .limit(25);

    if (meta.class) leaderboardQuery = leaderboardQuery.eq('class', String(meta.class));
    if (meta.section) leaderboardQuery = leaderboardQuery.eq('section', String(meta.section));

    const { data: leaderboardRows } = await leaderboardQuery;
    const leaderboard = (leaderboardRows || []).slice(0, 10);
    const studentLeaderboard = (leaderboardRows || []).find((row: any) => {
      const sid = String(row.student_id || '').toLowerCase();
      return studentIdCandidates.includes(sid);
    }) || null;

    const emotionQueries = uniqueIds.map((uid) =>
      supabase
        .from('emotion_events')
        .select('id, emotion_label, confidence_score, valence_score, arousal_score, captured_at, metadata')
        .or(`user_id.eq.${uid},student_id.eq.${uid}`)
        .order('captured_at', { ascending: false })
        .limit(200)
    );

    const emotionResults = await Promise.all(emotionQueries);
    const emotionSeen = new Set<string>();
    const emotions = emotionResults
      .flatMap((r) => r.data || [])
      .filter((e: any) => {
        if (emotionSeen.has(e.id)) return false;
        emotionSeen.add(e.id);
        return true;
      })
      .slice(0, 200);

    const summary = buildMonthlySummary(dayMap);
    const todayDatePrefix = new Date().toISOString().slice(0, 10);
    const todayGateEntries = gateEntries.filter((g: any) => String(g.entry_time || '').startsWith(todayDatePrefix)).length;

    const classTeacherInfo = {
      name: "Swami Anant Vyas",
      designation: "Class Teacher (Class 6-A)",
      department: "Computer Science, AI & Mathematics",
      email: "filterself@gmail.com",
      phone: "+91 98108 81236",
      avatarUrl: "/swami-anant-vyas.png",
      consultationHours: "12:30 PM – 01:30 PM (Mon – Fri)",
      room: "Room 104, Class 6-A (Junior Wing)",
    };

    return new Response(
      JSON.stringify({
        found: true,
        student: {
          id: matched.id,
          name: meta.name || meta.label || "Student",
          employee_id: meta.employee_id || meta.roll_number || "N/A",
          category: matched.category || "A",
          image_url: matched.image_url || "",
        },
        class_teacher: classTeacherInfo,
        attendance,
        badges,
        emotions,
        leaderboard,
        student_leaderboard: studentLeaderboard,
        summary: {
          ...summary,
          badgeCount: badges.length,
          todayGateEntries,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Parent lookup error:", err);
    return new Response(
      JSON.stringify({ error: "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
