// School configuration — Classes 6-12, Sections A-D

export const CLASSES = [6, 7, 8, 9, 10, 11, 12] as const;
export const SECTIONS = ['A', 'B', 'C', 'D'] as const;

export type SchoolClass = typeof CLASSES[number];
export type Section = typeof SECTIONS[number];

// Category format: "6-A", "7-B", etc.
export type ClassSection = `${SchoolClass}-${Section}`;
export type Category = ClassSection | 'Teacher';

// Generate all class-section combinations
export const ALL_CLASS_SECTIONS: ClassSection[] = CLASSES.flatMap(cls =>
  SECTIONS.map(sec => `${cls}-${sec}` as ClassSection)
);

export const ALL_CATEGORIES: Category[] = [...ALL_CLASS_SECTIONS, 'Teacher'];

// Parse a category string into class and section
export const parseCategory = (category: string): { class: number; section: string } | null => {
  const match = category.match(/^(\d+)-([A-D])$/);
  if (!match) return null;
  return { class: parseInt(match[1]), section: match[2] };
};

// Get display label for a category
export const getCategoryLabel = (category: string): string => {
  if (category === 'Teacher') return 'Teachers';
  const parsed = parseCategory(category);
  if (parsed) return `Class ${parsed.class} - Section ${parsed.section}`;
  return category;
};

// Get short label
export const getCategoryShortLabel = (category: string): string => {
  if (category === 'Teacher') return 'Teacher';
  return category; // "6-A", "7-B", etc.
};

// Group categories by class
export const getCategoriesByClass = (): Map<number, ClassSection[]> => {
  const map = new Map<number, ClassSection[]>();
  CLASSES.forEach(cls => {
    map.set(cls, SECTIONS.map(sec => `${cls}-${sec}` as ClassSection));
  });
  return map;
};

// Color mapping for classes
export const CLASS_COLORS: Record<number, string> = {
  6: 'bg-blue-500',
  7: 'bg-emerald-500',
  8: 'bg-amber-500',
  9: 'bg-rose-500',
  10: 'bg-purple-500',
  11: 'bg-cyan-500',
  12: 'bg-indigo-500',
};

// Transport modes
export const TRANSPORT_MODES = ['School Bus', 'Private Vehicle', 'Walk', 'Auto/Rickshaw', 'Other'] as const;
export type TransportMode = typeof TRANSPORT_MODES[number];

// Blood groups
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodGroup = typeof BLOOD_GROUPS[number];
