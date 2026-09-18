export type AndroidWidgetSize = '1x1' | '2x1' | '2x2' | '4x2' | '4x4';

export type MaterialPalette = 
  | 'dynamic-blue'
  | 'dynamic-amber'
  | 'dynamic-emerald'
  | 'dynamic-purple'
  | 'dynamic-rose'
  | 'dynamic-slate';

export type AndroidWidgetType =
  | 'attendance_kpi'
  | 'timetable_period'
  | 'gate_pass'
  | 'absentee_blast'
  | 'student_picker'
  | 'decibel_meter'
  | 'stopwatch_timer'
  | 'emergency_alert';

export interface AndroidWidgetItem {
  id: string;
  type: AndroidWidgetType;
  title: string;
  size: AndroidWidgetSize;
  palette: MaterialPalette;
  pinned: boolean;
  order: number;
  config?: Record<string, any>;
}

export interface AndroidWidgetCatalogEntry {
  type: AndroidWidgetType;
  title: string;
  description: string;
  category: 'attendance' | 'classroom' | 'security' | 'tools';
  icon: string;
  supportedSizes: AndroidWidgetSize[];
  defaultSize: AndroidWidgetSize;
  defaultPalette: MaterialPalette;
}

export const PALETTE_CLASSES: Record<MaterialPalette, {
  bg: string;
  border: string;
  text: string;
  badge: string;
  badgeText: string;
  accent: string;
  glow: string;
}> = {
  'dynamic-blue': {
    bg: 'bg-gradient-to-br from-blue-500/10 via-sky-500/5 to-indigo-500/10 dark:from-blue-950/50 dark:via-slate-900/60 dark:to-indigo-950/40',
    border: 'border-blue-500/30 hover:border-blue-500/50 dark:border-blue-400/25',
    text: 'text-blue-950 dark:text-blue-100',
    badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
    badgeText: 'text-blue-600 dark:text-blue-400',
    accent: 'bg-blue-600 text-white',
    glow: 'shadow-blue-500/10 dark:shadow-blue-500/5',
  },
  'dynamic-amber': {
    bg: 'bg-gradient-to-br from-amber-500/10 via-yellow-500/5 to-orange-500/10 dark:from-amber-950/50 dark:via-slate-900/60 dark:to-yellow-950/40',
    border: 'border-amber-500/30 hover:border-amber-500/50 dark:border-amber-400/25',
    text: 'text-amber-950 dark:text-amber-100',
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    badgeText: 'text-amber-600 dark:text-amber-400',
    accent: 'bg-amber-500 text-amber-950 font-bold',
    glow: 'shadow-amber-500/10 dark:shadow-amber-500/5',
  },
  'dynamic-emerald': {
    bg: 'bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-green-500/10 dark:from-emerald-950/50 dark:via-slate-900/60 dark:to-teal-950/40',
    border: 'border-emerald-500/30 hover:border-emerald-500/50 dark:border-emerald-400/25',
    text: 'text-emerald-950 dark:text-emerald-100',
    badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    badgeText: 'text-emerald-600 dark:text-emerald-400',
    accent: 'bg-emerald-600 text-white',
    glow: 'shadow-emerald-500/10 dark:shadow-emerald-500/5',
  },
  'dynamic-purple': {
    bg: 'bg-gradient-to-br from-purple-500/10 via-violet-500/5 to-fuchsia-500/10 dark:from-purple-950/50 dark:via-slate-900/60 dark:to-violet-950/40',
    border: 'border-purple-500/30 hover:border-purple-500/50 dark:border-purple-400/25',
    text: 'text-purple-950 dark:text-purple-100',
    badge: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
    badgeText: 'text-purple-600 dark:text-purple-400',
    accent: 'bg-purple-600 text-white',
    glow: 'shadow-purple-500/10 dark:shadow-purple-500/5',
  },
  'dynamic-rose': {
    bg: 'bg-gradient-to-br from-rose-500/10 via-pink-500/5 to-red-500/10 dark:from-rose-950/50 dark:via-slate-900/60 dark:to-pink-950/40',
    border: 'border-rose-500/30 hover:border-rose-500/50 dark:border-rose-400/25',
    text: 'text-rose-950 dark:text-rose-100',
    badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
    badgeText: 'text-rose-600 dark:text-rose-400',
    accent: 'bg-rose-600 text-white',
    glow: 'shadow-rose-500/10 dark:shadow-rose-500/5',
  },
  'dynamic-slate': {
    bg: 'bg-gradient-to-br from-slate-500/10 via-zinc-500/5 to-neutral-500/10 dark:from-slate-900/70 dark:via-slate-900/50 dark:to-zinc-900/60',
    border: 'border-slate-400/30 hover:border-slate-400/50 dark:border-white/10',
    text: 'text-slate-900 dark:text-slate-100',
    badge: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
    badgeText: 'text-slate-600 dark:text-slate-400',
    accent: 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900',
    glow: 'shadow-slate-500/10 dark:shadow-slate-900/20',
  },
};

export const ANDROID_WIDGET_CATALOG: AndroidWidgetCatalogEntry[] = [
  {
    type: 'attendance_kpi',
    title: 'Attendance KPI Glance',
    description: 'Real-time class attendance rate with donut indicator and Present/Absent/Late counts.',
    category: 'attendance',
    icon: 'BarChart3',
    supportedSizes: ['2x2', '4x2', '2x1'],
    defaultSize: '2x2',
    defaultPalette: 'dynamic-blue',
  },
  {
    type: 'timetable_period',
    title: 'Live Timetable & Period',
    description: 'Live school period countdown, current class subject, teacher, and upcoming period.',
    category: 'classroom',
    icon: 'Clock',
    supportedSizes: ['2x1', '4x2', '2x2'],
    defaultSize: '4x2',
    defaultPalette: 'dynamic-amber',
  },
  {
    type: 'gate_pass',
    title: 'Gate Pass Quick Actions',
    description: 'Active gate pass monitor with 1-tap QR scanner and emergency pass slip creator.',
    category: 'security',
    icon: 'QrCode',
    supportedSizes: ['2x2', '4x2'],
    defaultSize: '2x2',
    defaultPalette: 'dynamic-purple',
  },
  {
    type: 'absentee_blast',
    title: 'Absentee WhatsApp Blast',
    description: 'Glanceable carousel of absent students with 1-tap parent WhatsApp alert actions.',
    category: 'attendance',
    icon: 'MessageSquare',
    supportedSizes: ['4x2', '4x4'],
    defaultSize: '4x2',
    defaultPalette: 'dynamic-emerald',
  },
  {
    type: 'student_picker',
    title: 'Random Student Picker',
    description: 'Animated random student selector with roll number and avatar for classroom participation.',
    category: 'classroom',
    icon: 'Shuffle',
    supportedSizes: ['2x2'],
    defaultSize: '2x2',
    defaultPalette: 'dynamic-rose',
  },
  {
    type: 'decibel_meter',
    title: 'Decibel & Noise Meter',
    description: 'Real-time microphone noise level visualizer with classroom quiet/focus alerts.',
    category: 'classroom',
    icon: 'Mic',
    supportedSizes: ['2x2'],
    defaultSize: '2x2',
    defaultPalette: 'dynamic-blue',
  },
  {
    type: 'stopwatch_timer',
    title: 'Class Stopwatch & Timer',
    description: 'Material You clock stopwatch with quick preset buttons (5m, 10m, 15m) and lap counter.',
    category: 'tools',
    icon: 'Timer',
    supportedSizes: ['2x1', '2x2'],
    defaultSize: '2x1',
    defaultPalette: 'dynamic-amber',
  },
  {
    type: 'emergency_alert',
    title: 'Campus Emergency Alert',
    description: 'Instant school security status and 1-tap emergency broadcast alert trigger.',
    category: 'security',
    icon: 'ShieldAlert',
    supportedSizes: ['4x2'],
    defaultSize: '4x2',
    defaultPalette: 'dynamic-rose',
  },
];

export const DEFAULT_ANDROID_WIDGETS: AndroidWidgetItem[] = [
  {
    id: 'w-attendance-kpi',
    type: 'attendance_kpi',
    title: 'Attendance KPI Glance',
    size: '2x2',
    palette: 'dynamic-blue',
    pinned: true,
    order: 0,
  },
  {
    id: 'w-timetable-period',
    type: 'timetable_period',
    title: 'Live Timetable & Period',
    size: '4x2',
    palette: 'dynamic-amber',
    pinned: true,
    order: 1,
  },
  {
    id: 'w-gate-pass',
    type: 'gate_pass',
    title: 'Gate Pass Quick Actions',
    size: '2x2',
    palette: 'dynamic-purple',
    pinned: true,
    order: 2,
  },
  {
    id: 'w-absentee-blast',
    type: 'absentee_blast',
    title: 'Absentee WhatsApp Blast',
    size: '4x2',
    palette: 'dynamic-emerald',
    pinned: true,
    order: 3,
  },
  {
    id: 'w-student-picker',
    type: 'student_picker',
    title: 'Random Student Picker',
    size: '2x2',
    palette: 'dynamic-rose',
    pinned: false,
    order: 4,
  },
  {
    id: 'w-stopwatch-timer',
    type: 'stopwatch_timer',
    title: 'Class Stopwatch & Timer',
    size: '2x1',
    palette: 'dynamic-amber',
    pinned: false,
    order: 5,
  },
];
