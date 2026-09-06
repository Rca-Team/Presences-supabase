// Canonical Curriculum & Class-Specific Subjects Configuration
// Enforces class-specific subject structures and eliminates duplicate subjects across the system

export interface ClassSubject {
  id: string;
  name: string;
  short_name: string;
  code?: string;
  category: 'core' | 'language' | 'lab' | 'activity' | 'sports';
  weeklyDefault: number;
  classLevels: number[];
  stream?: 'science' | 'commerce' | 'humanities' | 'general';
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CANONICAL SUBJECT DEFINITIONS (with stable IDs & UUID aliases)
// ─────────────────────────────────────────────────────────────────────────────

// Middle School (Class 6 to 8)
export const MIDDLE_SCHOOL_SUBJECTS: ClassSubject[] = [
  {
    id: 'ddd3f75e-36f4-4b9d-a689-1c857592bf01', // Math
    name: 'Mathematics',
    short_name: 'Math',
    code: 'MATH-MID',
    category: 'core',
    weeklyDefault: 6,
    classLevels: [6, 7, 8],
  },
  {
    id: 'ca783610-bb5b-459c-87be-cf392143dfd0', // Science
    name: 'Science',
    short_name: 'Science',
    code: 'SCI-MID',
    category: 'core',
    weeklyDefault: 6,
    classLevels: [6, 7, 8],
  },
  {
    id: '523a0126-6a62-4439-8891-5aa71fcee30c', // English
    name: 'English Language & Literature',
    short_name: 'English',
    code: 'ENG-MID',
    category: 'language',
    weeklyDefault: 5,
    classLevels: [6, 7, 8],
  },
  {
    id: 'f317eb9a-05d3-4862-9a3c-9fbf7e2c6786', // Hindi
    name: 'Hindi',
    short_name: 'Hindi',
    code: 'HIN-MID',
    category: 'language',
    weeklyDefault: 5,
    classLevels: [6, 7, 8],
  },
  {
    id: 'e75973fb-6e92-4c2e-b143-84f959466ca4', // SST
    name: 'Social Science (SST)',
    short_name: 'SST',
    code: 'SST-MID',
    category: 'core',
    weeklyDefault: 5,
    classLevels: [6, 7, 8],
  },
  {
    id: 'ee72702c-ad3a-42ce-9572-c2f8bddb08b6', // Sanskrit
    name: 'Sanskrit',
    short_name: 'Sanskrit',
    code: 'SKT-MID',
    category: 'language',
    weeklyDefault: 3,
    classLevels: [6, 7, 8],
  },
  {
    id: '061495a8-2228-4c94-8ec6-5a9f549d17ef', // Computer Science
    name: 'Computer Science & AI Lab',
    short_name: 'CS / AI',
    code: 'CS-MID',
    category: 'activity',
    weeklyDefault: 3,
    classLevels: [6, 7, 8],
  },
  {
    id: '32ce0237-9fd8-4d49-9b23-5272aabeda0b', // Sports
    name: 'Physical Education & Sports',
    short_name: 'PE / Sports',
    code: 'PE-MID',
    category: 'sports',
    weeklyDefault: 3,
    classLevels: [6, 7, 8],
  },
  {
    id: 'cc4e341f-e19f-4db2-86d8-e0492a46e290', // Art & Craft
    name: 'Art, Craft & Aesthetics',
    short_name: 'Art & Craft',
    code: 'ART-MID',
    category: 'activity',
    weeklyDefault: 2,
    classLevels: [6, 7, 8],
  },
  {
    id: '6154ed96-f1fe-4c48-97b1-405ae511ddff', // Library
    name: 'Library & Values',
    short_name: 'Library',
    code: 'LIB-MID',
    category: 'activity',
    weeklyDefault: 1,
    classLevels: [6, 7, 8],
  },
];

// Secondary School (Class 9 & 10) - CBSE Board Standard
export const SECONDARY_SCHOOL_SUBJECTS: ClassSubject[] = [
  {
    id: 'subj-sec-math',
    name: 'Mathematics (Standard / Basic)',
    short_name: 'Mathematics',
    code: 'MATH-041',
    category: 'core',
    weeklyDefault: 7,
    classLevels: [9, 10],
  },
  {
    id: 'subj-sec-sci',
    name: 'Science (Physics, Chemistry, Biology)',
    short_name: 'Science',
    code: 'SCI-086',
    category: 'core',
    weeklyDefault: 7,
    classLevels: [9, 10],
  },
  {
    id: 'subj-sec-sst',
    name: 'Social Science (History, Civics, Geo, Eco)',
    short_name: 'Social Science',
    code: 'SST-087',
    category: 'core',
    weeklyDefault: 6,
    classLevels: [9, 10],
  },
  {
    id: 'subj-sec-eng',
    name: 'English Language & Literature',
    short_name: 'English',
    code: 'ENG-184',
    category: 'language',
    weeklyDefault: 6,
    classLevels: [9, 10],
  },
  {
    id: 'subj-sec-hin',
    name: 'Hindi Course A',
    short_name: 'Hindi',
    code: 'HIN-002',
    category: 'language',
    weeklyDefault: 5,
    classLevels: [9, 10],
  },
  {
    id: 'subj-sec-it',
    name: 'Information Technology / AI (Skill)',
    short_name: 'IT / AI',
    code: 'IT-402',
    category: 'activity',
    weeklyDefault: 4,
    classLevels: [9, 10],
  },
  {
    id: 'subj-sec-pe',
    name: 'Health & Physical Education',
    short_name: 'HPE / Sports',
    code: 'HPE-506',
    category: 'sports',
    weeklyDefault: 2,
    classLevels: [9, 10],
  },
  {
    id: 'subj-sec-art',
    name: 'Art Education & Work Experience',
    short_name: 'Art / WE',
    code: 'ART-501',
    category: 'activity',
    weeklyDefault: 1,
    classLevels: [9, 10],
  },
];

// Senior Secondary Science Stream (Class 11 & 12 - Section A)
export const SENIOR_SCIENCE_SUBJECTS: ClassSubject[] = [
  {
    id: 'subj-sr-phy',
    name: 'Physics (Theory & Lab)',
    short_name: 'Physics',
    code: 'PHY-042',
    category: 'core',
    weeklyDefault: 8,
    classLevels: [11, 12],
    stream: 'science',
  },
  {
    id: 'subj-sr-chem',
    name: 'Chemistry (Theory & Lab)',
    short_name: 'Chemistry',
    code: 'CHEM-043',
    category: 'core',
    weeklyDefault: 8,
    classLevels: [11, 12],
    stream: 'science',
  },
  {
    id: 'subj-sr-math',
    name: 'Mathematics',
    short_name: 'Mathematics',
    code: 'MATH-041',
    category: 'core',
    weeklyDefault: 7,
    classLevels: [11, 12],
    stream: 'science',
  },
  {
    id: 'subj-sr-bio',
    name: 'Biology (Theory & Lab)',
    short_name: 'Biology',
    code: 'BIO-044',
    category: 'core',
    weeklyDefault: 7,
    classLevels: [11, 12],
    stream: 'science',
  },
  {
    id: 'subj-sr-eng-core',
    name: 'English Core',
    short_name: 'English Core',
    code: 'ENG-301',
    category: 'language',
    weeklyDefault: 6,
    classLevels: [11, 12],
    stream: 'science',
  },
  {
    id: 'subj-sr-cs',
    name: 'Computer Science (Python / SQL)',
    short_name: 'Computer Science',
    code: 'CS-083',
    category: 'activity',
    weeklyDefault: 5,
    classLevels: [11, 12],
    stream: 'science',
  },
  {
    id: 'subj-sr-pe',
    name: 'Physical Education',
    short_name: 'Physical Ed',
    code: 'PE-048',
    category: 'sports',
    weeklyDefault: 3,
    classLevels: [11, 12],
    stream: 'science',
  },
];

// Senior Secondary Commerce Stream (Class 11 & 12 - Section B)
export const SENIOR_COMMERCE_SUBJECTS: ClassSubject[] = [
  {
    id: 'subj-sr-acc',
    name: 'Accountancy',
    short_name: 'Accountancy',
    code: 'ACC-055',
    category: 'core',
    weeklyDefault: 8,
    classLevels: [11, 12],
    stream: 'commerce',
  },
  {
    id: 'subj-sr-bst',
    name: 'Business Studies',
    short_name: 'Business Studies',
    code: 'BST-054',
    category: 'core',
    weeklyDefault: 7,
    classLevels: [11, 12],
    stream: 'commerce',
  },
  {
    id: 'subj-sr-eco',
    name: 'Economics',
    short_name: 'Economics',
    code: 'ECO-030',
    category: 'core',
    weeklyDefault: 7,
    classLevels: [11, 12],
    stream: 'commerce',
  },
  {
    id: 'subj-sr-eng-core',
    name: 'English Core',
    short_name: 'English Core',
    code: 'ENG-301',
    category: 'language',
    weeklyDefault: 6,
    classLevels: [11, 12],
    stream: 'commerce',
  },
  {
    id: 'subj-sr-app-math',
    name: 'Applied Mathematics',
    short_name: 'Applied Math',
    code: 'MATH-241',
    category: 'core',
    weeklyDefault: 5,
    classLevels: [11, 12],
    stream: 'commerce',
  },
  {
    id: 'subj-sr-ip',
    name: 'Informatics Practices (IP)',
    short_name: 'IP',
    code: 'IP-065',
    category: 'activity',
    weeklyDefault: 5,
    classLevels: [11, 12],
    stream: 'commerce',
  },
  {
    id: 'subj-sr-pe',
    name: 'Physical Education',
    short_name: 'Physical Ed',
    code: 'PE-048',
    category: 'sports',
    weeklyDefault: 3,
    classLevels: [11, 12],
    stream: 'commerce',
  },
];

// Senior Secondary Humanities Stream (Class 11 & 12 - Section C / D)
export const SENIOR_HUMANITIES_SUBJECTS: ClassSubject[] = [
  {
    id: 'subj-sr-hist',
    name: 'History',
    short_name: 'History',
    code: 'HIST-027',
    category: 'core',
    weeklyDefault: 7,
    classLevels: [11, 12],
    stream: 'humanities',
  },
  {
    id: 'subj-sr-pol',
    name: 'Political Science',
    short_name: 'Political Science',
    code: 'POL-028',
    category: 'core',
    weeklyDefault: 7,
    classLevels: [11, 12],
    stream: 'humanities',
  },
  {
    id: 'subj-sr-geo',
    name: 'Geography',
    short_name: 'Geography',
    code: 'GEO-029',
    category: 'core',
    weeklyDefault: 6,
    classLevels: [11, 12],
    stream: 'humanities',
  },
  {
    id: 'subj-sr-eco',
    name: 'Economics',
    short_name: 'Economics',
    code: 'ECO-030',
    category: 'core',
    weeklyDefault: 6,
    classLevels: [11, 12],
    stream: 'humanities',
  },
  {
    id: 'subj-sr-psych',
    name: 'Psychology / Sociology',
    short_name: 'Psychology',
    code: 'PSYCH-037',
    category: 'core',
    weeklyDefault: 5,
    classLevels: [11, 12],
    stream: 'humanities',
  },
  {
    id: 'subj-sr-eng-core',
    name: 'English Core',
    short_name: 'English Core',
    code: 'ENG-301',
    category: 'language',
    weeklyDefault: 6,
    classLevels: [11, 12],
    stream: 'humanities',
  },
  {
    id: 'subj-sr-hin-core',
    name: 'Hindi Core',
    short_name: 'Hindi Core',
    code: 'HIN-302',
    category: 'language',
    weeklyDefault: 4,
    classLevels: [11, 12],
    stream: 'humanities',
  },
  {
    id: 'subj-sr-pe',
    name: 'Physical Education',
    short_name: 'Physical Ed',
    code: 'PE-048',
    category: 'sports',
    weeklyDefault: 3,
    classLevels: [11, 12],
    stream: 'humanities',
  },
];

// All master curriculum subjects aggregated
export const ALL_MASTER_SUBJECTS: ClassSubject[] = [
  ...MIDDLE_SCHOOL_SUBJECTS,
  ...SECONDARY_SCHOOL_SUBJECTS,
  ...SENIOR_SCIENCE_SUBJECTS,
  ...SENIOR_COMMERCE_SUBJECTS,
  ...SENIOR_HUMANITIES_SUBJECTS,
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. DEDUPLICATION & CANONICAL MAPPING UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeSubjectName(rawName) {
  if (!rawName) return 'General Study';
  const norm = rawName.toLowerCase().trim().replace(/^(subj-|sub_)/i, '');

  if (/^(math|maths|mathematics|mth|ganit)/i.test(norm)) return 'Mathematics';
  if (/^(phy|physics)/i.test(norm)) return 'Physics';
  if (/^(chem|chemistry)/i.test(norm)) return 'Chemistry';
  if (/^(bio|biology)/i.test(norm)) return 'Biology';
  if (/^(sci|science|vigyan|evs)/i.test(norm)) return 'Science';
  if (/^(eng|english)/i.test(norm)) {
    if (norm.includes('core')) return 'English Core';
    return 'English Language & Literature';
  }
  if (/^(hin|hindi)/i.test(norm)) {
    if (norm.includes('core')) return 'Hindi Core';
    return 'Hindi';
  }
  if (/^(skt|sans|sanskrit)/i.test(norm)) return 'Sanskrit';
  if (/^(sst|soc|social|social studies|hist|geo|civic)/i.test(norm)) {
    if (/^hist/i.test(norm)) return 'History';
    if (/^(pol|civic)/i.test(norm)) return 'Political Science';
    if (/^geo/i.test(norm)) return 'Geography';
    return 'Social Science (SST)';
  }
  if (/^(acc|accounts|accountancy)/i.test(norm)) return 'Accountancy';
  if (/^(bst|business|business studies)/i.test(norm)) return 'Business Studies';
  if (/^(eco|economics)/i.test(norm)) return 'Economics';
  if (/^(comp|cs|ai|code|robotics|informatics|ip|it)/i.test(norm)) {
    if (norm.includes('ip') || norm.includes('informatics')) return 'Informatics Practices (IP)';
    if (norm.includes('it') || norm.includes('information')) return 'Information Technology (IT)';
    return 'Computer Science & AI Lab';
  }
  if (/^(pe|sport|sports|game|games|pt|yoga|phys)/i.test(norm)) return 'Physical Education & Sports';
  if (/^(art|craft|drawing|music|dance)/i.test(norm)) return 'Art, Craft & Aesthetics';
  if (/^(lib|library|ethics|values|moral)/i.test(norm)) return 'Library & Values';

  return rawName.trim();
}

export function deduplicateSubjects(list) {
  const seenNames = new Set();
  const seenIds = new Set();
  const deduplicated = [];

  for (const item of list) {
    if (!item || !item.name) continue;
    const normName = normalizeSubjectName(item.name).toLowerCase();
    const idKey = item.id.trim();

    if (seenNames.has(normName) || seenIds.has(idKey)) {
      continue;
    }

    seenNames.add(normName);
    seenIds.add(idKey);
    deduplicated.push({
      ...item,
      name: item.name.length < 3 ? normalizeSubjectName(item.name) : item.name,
    });
  }

  return deduplicated;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CLASS-SPECIFIC SUBJECT RETRIEVAL
// ─────────────────────────────────────────────────────────────────────────────

export function getSubjectsForClass(category: string = '6-A'): ClassSubject[] {
  const match = category.match(/^(\d+)(?:-([A-D]))?$/i);
  if (!match) {
    return deduplicateSubjects(MIDDLE_SCHOOL_SUBJECTS);
  }

  const grade = parseInt(match[1], 10);
  const section = (match[2] || 'A').toUpperCase();

  // Class 6, 7, 8 (Middle School)
  if (grade >= 6 && grade <= 8) {
    return deduplicateSubjects(MIDDLE_SCHOOL_SUBJECTS);
  }

  // Class 9, 10 (Secondary School)
  if (grade === 9 || grade === 10) {
    return deduplicateSubjects(SECONDARY_SCHOOL_SUBJECTS);
  }

  // Class 11, 12 (Senior Secondary School with Streams)
  if (grade === 11 || grade === 12) {
    if (section === 'A') {
      return deduplicateSubjects(SENIOR_SCIENCE_SUBJECTS);
    }
    if (section === 'B') {
      return deduplicateSubjects(SENIOR_COMMERCE_SUBJECTS);
    }
    return deduplicateSubjects(SENIOR_HUMANITIES_SUBJECTS);
  }

  return deduplicateSubjects(MIDDLE_SCHOOL_SUBJECTS);
}

export function resolveSubjectIdentifier(
  identifier?: string | null,
  activeClassSubjects: ClassSubject[] = ALL_MASTER_SUBJECTS
): ClassSubject | undefined {
  if (!identifier) return undefined;
  const clean = identifier.trim();
  const cleanLower = clean.toLowerCase();

  const byId = activeClassSubjects.find((s) => s.id === clean);
  if (byId) return byId;

  const byCode = activeClassSubjects.find(
    (s) => s.short_name?.toLowerCase() === cleanLower || s.code?.toLowerCase() === cleanLower
  );
  if (byCode) return byCode;

  const canonical = normalizeSubjectName(clean).toLowerCase();
  const byNorm = activeClassSubjects.find(
    (s) => normalizeSubjectName(s.name).toLowerCase() === canonical
  );
  if (byNorm) return byNorm;

  return ALL_MASTER_SUBJECTS.find(
    (s) =>
      s.id === clean ||
      s.name.toLowerCase() === cleanLower ||
      normalizeSubjectName(s.name).toLowerCase() === canonical
  );
}
