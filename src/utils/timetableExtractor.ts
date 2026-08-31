import { supabase } from '@/integrations/supabase/client';

export interface ExtractedSlot {
  day: string; // 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
  dayNumber: number; // 1-6
  period_number: number;
  subject: string;
  subject_short?: string | null;
  subjectId?: string;
  teacher?: string | null;
  teacherId?: string;
  room?: string | null;
  notes?: string | null;
}

export interface ExtractedPeriod {
  period_number: number;
  label?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  is_break: boolean;
}

export interface ExtractedTimetableResult {
  class_label?: string;
  className?: string;
  section?: string;
  class_teacher?: string | null;
  co_class_teacher?: string | null;
  periods: ExtractedPeriod[];
  slots: ExtractedSlot[];
  unmatchedSubjects?: string[];
}

export const getSubjectTheme = (name?: string | null) => {
  const normName = (name || '').toLowerCase();
  if (normName.includes('math')) {
    return {
      bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
      text: 'text-emerald-700 dark:text-emerald-300',
      border: 'border-emerald-500/30',
      badge: 'bg-emerald-600 text-white',
    };
  }
  if (normName.includes('sci') || normName.includes('phys') || normName.includes('chem') || normName.includes('bio') || normName.includes('evs')) {
    return {
      bg: 'bg-cyan-500/10 dark:bg-cyan-500/20',
      text: 'text-cyan-700 dark:text-cyan-300',
      border: 'border-cyan-500/30',
      badge: 'bg-cyan-600 text-white',
    };
  }
  if (normName.includes('eng')) {
    return {
      bg: 'bg-indigo-500/10 dark:bg-indigo-500/20',
      text: 'text-indigo-700 dark:text-indigo-300',
      border: 'border-indigo-500/30',
      badge: 'bg-indigo-600 text-white',
    };
  }
  if (normName.includes('hin') || normName.includes('sans') || normName.includes('skt')) {
    return {
      bg: 'bg-amber-500/10 dark:bg-amber-500/20',
      text: 'text-amber-700 dark:text-amber-300',
      border: 'border-amber-500/30',
      badge: 'bg-amber-600 text-white',
    };
  }
  if (normName.includes('soc') || normName.includes('sst') || normName.includes('hist') || normName.includes('geo') || normName.includes('civic')) {
    return {
      bg: 'bg-rose-500/10 dark:bg-rose-500/20',
      text: 'text-rose-700 dark:text-rose-300',
      border: 'border-rose-500/30',
      badge: 'bg-rose-600 text-white',
    };
  }
  if (normName.includes('comp') || normName.includes('cs') || normName.includes('ai') || normName.includes('code') || normName.includes('it')) {
    return {
      bg: 'bg-purple-500/10 dark:bg-purple-500/20',
      text: 'text-purple-700 dark:text-purple-300',
      border: 'border-purple-500/30',
      badge: 'bg-purple-600 text-white',
    };
  }
  if (normName.includes('pe') || normName.includes('sport') || normName.includes('game') || normName.includes('yoga') || normName.includes('pt')) {
    return {
      bg: 'bg-lime-500/10 dark:bg-lime-500/20',
      text: 'text-lime-700 dark:text-lime-300',
      border: 'border-lime-500/30',
      badge: 'bg-lime-600 text-white',
    };
  }
  if (normName.includes('art') || normName.includes('craft') || normName.includes('music') || normName.includes('dance')) {
    return {
      bg: 'bg-pink-500/10 dark:bg-pink-500/20',
      text: 'text-pink-700 dark:text-pink-300',
      border: 'border-pink-500/30',
      badge: 'bg-pink-600 text-white',
    };
  }
  if (normName.includes('lib') || normName.includes('value') || normName.includes('gk') || normName.includes('moral')) {
    return {
      bg: 'bg-sky-500/10 dark:bg-sky-500/20',
      text: 'text-sky-700 dark:text-sky-300',
      border: 'border-sky-500/30',
      badge: 'bg-sky-600 text-white',
    };
  }
  return {
    bg: 'bg-slate-500/10 dark:bg-slate-500/20',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-500/30',
    badge: 'bg-slate-600 text-white',
  };
};

const DAY_MAP: Record<string, number> = {
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

/**
 * Match a raw subject name/code from OCR to a registered Subject object
 */
export function matchSubject(rawName: string, knownSubjects: { id: string; name: string; short_name?: string | null }[]) {
  if (!rawName) return null;
  const norm = rawName.toLowerCase().trim();

  // 1. Exact match on short_name or code
  const exactShort = knownSubjects.find(
    (s) => (s.short_name && s.short_name.toLowerCase() === norm) || s.name.toLowerCase() === norm
  );
  if (exactShort) return exactShort;

  // 2. Common subject keywords matching
  const patterns: [RegExp, string[]][] = [
    [/math|mth|ganit/i, ['math', 'mathematics']],
    [/sci|phys|chem|bio|evs|vigyan/i, ['science', 'science & evs', 'physics', 'chemistry', 'biology']],
    [/eng|english/i, ['english', 'english language']],
    [/hin|hindi/i, ['hindi', 'hindi language']],
    [/sst|soc|social|hist|geo|civic/i, ['social science (sst)', 'social studies', 'history', 'geography']],
    [/comp|cs|ai|it|code|lab|inf/i, ['computer & ai lab', 'computer science', 'information technology']],
    [/pe|sport|game|yoga|pt|phys\s*ed/i, ['physical ed & sports', 'pe', 'sports', 'games']],
    [/art|craft|draw|music|dance/i, ['art & music', 'art education', 'music']],
    [/lib|library/i, ['library & values', 'library']],
    [/skt|sans|sanskrit/i, ['sanskrit']],
  ];

  for (const [regex, subjectAliases] of patterns) {
    if (regex.test(norm)) {
      const match = knownSubjects.find((s) => {
        const sNorm = s.name.toLowerCase();
        return subjectAliases.some((alias) => sNorm.includes(alias));
      });
      if (match) return match;
    }
  }

  // 3. Substring match
  const subMatch = knownSubjects.find((s) => s.name.toLowerCase().includes(norm) || (s.short_name && norm.includes(s.short_name.toLowerCase())));
  if (subMatch) return subMatch;

  return null;
}

/**
 * Match or auto-assign a teacher for a subject
 */
export function matchOrAssignTeacher(
  rawTeacherName: string | null | undefined,
  matchedSubject: { id: string; name: string } | null,
  knownTeachers: { id: string; name: string; specialization?: string }[]
): { id: string; name: string } | null {
  if (knownTeachers.length === 0) return null;

  // 1. If OCR extracted a teacher name, match it against registered teachers
  if (rawTeacherName && rawTeacherName.trim().length > 1) {
    const rawNorm = rawTeacherName.toLowerCase().trim().replace(/^(mr\.|mrs\.|ms\.|dr\.|prof\.)\s*/i, '');
    
    // Exact or contains match
    const exactTeacher = knownTeachers.find((t) => {
      const tNorm = t.name.toLowerCase().replace(/^(mr\.|mrs\.|ms\.|dr\.|prof\.)\s*/i, '');
      return tNorm.includes(rawNorm) || rawNorm.includes(tNorm);
    });
    if (exactTeacher) return exactTeacher;

    // Word/surname token match
    const tokens = rawNorm.split(/\s+/).filter((w) => w.length > 2);
    for (const token of tokens) {
      const tokenMatch = knownTeachers.find((t) => t.name.toLowerCase().includes(token));
      if (tokenMatch) return tokenMatch;
    }
  }

  // 2. If no teacher name in image or no match found: AUTO-ASSIGN by subject specialization
  if (matchedSubject) {
    const subjNorm = matchedSubject.name.toLowerCase();
    
    const subjectKeywords: [RegExp, RegExp][] = [
      [/math/i, /math/i],
      [/sci|phys|chem|bio|evs/i, /sci|phys|chem|bio/i],
      [/eng/i, /eng/i],
      [/hin/i, /hin/i],
      [/sst|soc|hist|geo/i, /sst|soc|hist|geo/i],
      [/comp|cs|ai|it/i, /comp|cs|it|ai|tech/i],
      [/pe|sport|game|yoga|pt/i, /pe|sport|game|yoga|pt/i],
      [/art|music|dance/i, /art|music/i],
      [/skt|sans/i, /skt|sans/i],
    ];

    for (const [subjReg, teacherReg] of subjectKeywords) {
      if (subjReg.test(subjNorm)) {
        const specMatch = knownTeachers.find((t) => {
          const tNorm = `${t.name} ${t.specialization || ''}`.toLowerCase();
          return teacherReg.test(tNorm);
        });
        if (specMatch) return specMatch;
      }
    }
  }

  // 3. Fallback to first available teacher
  return knownTeachers[0] || null;
}

/**
 * Main OCR & AI Timetable Extraction Engine
 */
export async function extractTimetableFromImage(options: {
  fileData: string; // base64 / dataURI
  className?: string;
  section?: string;
  knownSubjects: { id: string; name: string; short_name?: string | null }[];
  knownTeachers: { id: string; name: string; specialization?: string }[];
  geminiApiKey?: string;
}): Promise<ExtractedTimetableResult> {
  const { fileData, className, section, knownSubjects, knownTeachers, geminiApiKey } = options;

  let parsedRaw: any = null;

  // 1. Try Supabase Edge Function first
  try {
    const { data, error } = await supabase.functions.invoke('extract-timetable-photo', {
      body: {
        fileData,
        className,
        section,
        knownSubjects,
        knownTeachers,
        apiKey: geminiApiKey,
      },
    });

    if (!error && data && Array.isArray(data.slots)) {
      parsedRaw = data;
    } else if (error) {
      console.warn('Edge function extract-timetable-photo warning:', error);
    }
  } catch (edgeErr) {
    console.warn('Edge function invoke exception, falling back to direct vision call:', edgeErr);
  }

  // 2. Direct Gemini Vision call if Edge function did not return data or lacked API key
  if (!parsedRaw) {
    const apiKey =
      geminiApiKey ||
      (import.meta as any).env?.VITE_GEMINI_API_KEY ||
      (import.meta as any).env?.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error('Please configure a Gemini API key or backend secret to enable photo timetable extraction.');
    }

    let mimeType = 'image/jpeg';
    let base64Data = fileData;
    const dataUriMatch = fileData.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (dataUriMatch) {
      mimeType = dataUriMatch[1];
      base64Data = dataUriMatch[2];
    }

    const systemPrompt = `You are an expert AI OCR assistant specialized in extracting school class timetables from photos of printed or handwritten timetable grids (e.g. Kendriya Vidyalaya / CBSE school formats).

Return ONLY valid JSON matching this schema:
{
  "class_label": string,
  "class_teacher": string | null,
  "co_class_teacher": string | null,
  "periods": [
    {
      "period_number": number,
      "label": string | null,
      "start_time": "HH:MM" | null,
      "end_time": "HH:MM" | null,
      "is_break": boolean
    }
  ],
  "slots": [
    {
      "day": "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday",
      "period_number": number,
      "subject": string,
      "subject_short": string | null,
      "teacher": string | null,
      "room": string | null,
      "notes": string | null
    }
  ]
}

Extraction Rules:
- Number periods left-to-right from Roman numerals I, II, III, IV, V, VI, VII, VIII into 1, 2, 3, 4, 5, 6, 7, 8.
- Default School Schedule: 07:20 to 12:15.
  * Period 1: 07:20 - 07:55
  * Period 2: 07:55 - 08:30
  * Period 3: 08:30 - 09:05
  * Period 4: 09:05 - 09:40
  * RECESS / LUNCH BREAK: 09:40 - 10:00 (is_break=true)
  * Period 5: 10:00 - 10:35
  * Period 6: 10:35 - 11:10
  * Period 7: 11:10 - 11:45
  * Period 8: 11:45 - 12:15
- If there is a RECESS / BREAK column between periods, mark period with is_break=true.
- Preserve short subject codes exactly (e.g. Eng, Maths, SC, SST, AE, VE, Hindi, Yoga, Games, Comp, SKT, Lib, CLA).
- Expand abbreviations to full names where obvious:
  * "Eng" -> "English"
  * "Maths" -> "Mathematics"
  * "SC" -> "Science"
  * "SST" -> "Social Studies"
  * "AE" -> "Art Education"
  * "VE" -> "Value Education"
  * "SKT" -> "Sanskrit"
  * "Comp" -> "Computer Science"
  * "Lib" -> "Library"
- Extract days: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday.
- Extract Class Teacher and Co-Class Teacher names if present.
- Output pure JSON only.`;

    const userText = `Extract the timetable for class ${className || 'Unknown'} - section ${section || 'A'}.
Known subjects: ${knownSubjects.map((s) => s.short_name || s.name).join(', ')}.
Known teachers: ${knownTeachers.map((t) => t.name).join(', ')}.`;

    const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
    let lastErr = '';

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: `${systemPrompt}\n\n${userText}` },
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: base64Data,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              response_mime_type: 'application/json',
              temperature: 0.1,
            },
          }),
        });

        if (response.ok) {
          const resJson = await response.json();
          const rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const cleanText = rawText.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
          const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsedRaw = JSON.parse(jsonMatch[0]);
            break;
          }
        } else {
          lastErr = await response.text();
        }
      } catch (err: any) {
        lastErr = err?.message || 'Vision fetch failed';
      }
    }

    if (!parsedRaw) {
      throw new Error(`AI Vision extraction failed: ${lastErr || 'Could not parse timetable schedule'}`);
    }
  }

  // 3. Post-Process & Map Subjects, Teachers, and Periods
  const rawPeriods: any[] = Array.isArray(parsedRaw.periods) ? parsedRaw.periods : [];
  const rawSlots: any[] = Array.isArray(parsedRaw.slots) ? parsedRaw.slots : [];

  // Default standard school timings (07:20 - 12:15, lunch at 09:40 - 10:00)
  const defaultTimingsMap: Record<number, { start: string; end: string }> = {
    1: { start: '07:20', end: '07:55' },
    2: { start: '07:55', end: '08:30' },
    3: { start: '08:30', end: '09:05' },
    4: { start: '09:05', end: '09:40' },
    5: { start: '10:00', end: '10:35' },
    6: { start: '10:35', end: '11:10' },
    7: { start: '11:10', end: '11:45' },
    8: { start: '11:45', end: '12:15' },
  };

  // Generate clean PeriodTimings
  const periods: ExtractedPeriod[] = (rawPeriods.length > 0
    ? rawPeriods
    : [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ period_number: n, label: `Period ${n}`, is_break: false }))
  ).map((p: any, idx: number) => {
    const pNum = p.period_number || idx + 1;
    const def = defaultTimingsMap[pNum];
    return {
      period_number: pNum,
      label: p.label || `Period ${pNum}`,
      start_time: p.start_time || def?.start || null,
      end_time: p.end_time || def?.end || null,
      is_break: Boolean(p.is_break),
    };
  });

  const slots: ExtractedSlot[] = [];
  const unmatchedSubjectsSet = new Set<string>();

  for (const s of rawSlots) {
    const rawDay = (s.day || '').toLowerCase().trim();
    const dayNumber = DAY_MAP[rawDay] || 1;
    const periodNumber = Number(s.period_number) || 1;

    // Match Subject
    const matchedSubj = matchSubject(s.subject || s.subject_short || '', knownSubjects);
    if (!matchedSubj && s.subject) {
      unmatchedSubjectsSet.add(s.subject);
    }

    // Match or Auto-assign Teacher by Subject
    const assignedTeacher = matchOrAssignTeacher(s.teacher, matchedSubj, knownTeachers);

    slots.push({
      day: s.day || 'Monday',
      dayNumber,
      period_number: periodNumber,
      subject: matchedSubj?.name || s.subject || 'General Study',
      subject_short: matchedSubj?.short_name || s.subject_short || s.subject,
      subjectId: matchedSubj?.id,
      teacher: assignedTeacher?.name || s.teacher || null,
      teacherId: assignedTeacher?.id,
      room: s.room || null,
      notes: s.notes || null,
    });
  }

  return {
    class_label: parsedRaw.class_label || `${className || 'Class'} ${section || ''}`.trim(),
    className: className || parsedRaw.class_label?.split(/\s|-/)[0] || undefined,
    section: section || parsedRaw.class_label?.split(/\s|-/)[1] || undefined,
    class_teacher: parsedRaw.class_teacher || null,
    co_class_teacher: parsedRaw.co_class_teacher || null,
    periods,
    slots,
    unmatchedSubjects: Array.from(unmatchedSubjectsSet),
  };
}
