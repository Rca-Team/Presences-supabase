import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import { Button } from '@/components/ui/button';
import {
  Scan,
  QrCode,
  DoorOpen,
  BarChart3,
  Users,
  Shield,
  Zap,
  ArrowRight,
  BookOpen,
  Bell,
  Search,
  Building2,
  CheckCircle2,
  Clock,
  UserCheck,
  FileSpreadsheet,
  Layers,
  Globe,
  GraduationCap,
  ShieldCheck,
  UserPlus,
  Sparkles,
  Bot,
  Terminal,
  CircuitBoard,
  Cpu,
  ChevronRight,
  MessageSquare,
  Award,
} from 'lucide-react';
import PageLayout from '@/components/layouts/PageLayout';
import LiteModeToggle from '@/components/LiteModeToggle';
import HomeInstallCard from '@/components/HomeInstallCard';

interface ModuleItem {
  to: string;
  icon: React.ElementType;
  label: string;
  desc: string;
  category: 'Attendance' | 'Academic' | 'Students' | 'Safety' | 'Admin';
  badge?: string;
  colorScheme: 'emerald' | 'blue' | 'purple' | 'amber' | 'rose' | 'indigo';
}

const MODULES_LIST: ModuleItem[] = [
  // Attendance & Gate
  {
    to: '/attendance',
    icon: Scan,
    label: 'Autonomous Face Terminal',
    desc: 'Hands-free continuous face recognition with instant audio chime & parent notification',
    category: 'Attendance',
    badge: 'AI Powered',
    colorScheme: 'emerald',
  },
  {
    to: '/attendance?mode=qr&autostart=1',
    icon: QrCode,
    label: 'Digital ID QR Scanner',
    desc: 'Ultra-fast camera barcode scanning with synthesized tone confirmation',
    category: 'Attendance',
    badge: 'Fast Scan',
    colorScheme: 'blue',
  },
  {
    to: '/gate',
    icon: DoorOpen,
    label: 'Gate Security Kiosk',
    desc: 'Campus boundary monitoring, visitor entry-exit tracking and stranger alerts',
    category: 'Attendance',
    badge: 'Perimeter',
    colorScheme: 'purple',
  },

  // Academic & Schedules
  {
    to: '/admin?tab=timetable',
    icon: BookOpen,
    label: 'Timetable & Period Schedules',
    desc: 'Automated weekly schedule matrix for classes, periods, and room assignments',
    category: 'Academic',
    badge: 'Schedules',
    colorScheme: 'indigo',
  },
  {
    to: '/admin?tab=timetable',
    icon: UserCheck,
    label: 'Smart Teacher Substitution',
    desc: 'Automated teacher absence replacement engine with zero period conflicts',
    category: 'Academic',
    badge: 'Automated',
    colorScheme: 'amber',
  },
  {
    to: '/teacher',
    icon: GraduationCap,
    label: 'Teacher Classroom Portal',
    desc: 'Dedicated teacher workspace for section roll-call, grading, and attendance register',
    category: 'Academic',
    badge: 'Portal',
    colorScheme: 'blue',
  },

  // Student Management
  {
    to: '/register',
    icon: UserPlus,
    label: 'Student Face Enrollment',
    desc: 'Multi-angle 3D face capture with batch ID card photo extraction & training',
    category: 'Students',
    badge: 'Biometric',
    colorScheme: 'purple',
  },
  {
    to: '/admin?tab=students',
    icon: Users,
    label: 'Master Student Directory',
    desc: 'Comprehensive searchable student roster across all classes and sections',
    category: 'Students',
    badge: 'Roster',
    colorScheme: 'emerald',
  },
  {
    to: '/admin?tab=sections',
    icon: Layers,
    label: 'Class & Section Manager',
    desc: 'Manage section allotments, class teachers, roll numbers, and cohort groupings',
    category: 'Students',
    badge: 'Sections',
    colorScheme: 'indigo',
  },

  // Safety & Institutional
  {
    to: '/admin?tab=emergency',
    icon: Bell,
    label: 'Emergency Alert Command',
    desc: 'One-click campus lockdown, audible siren, fire alerts and instant parent broadcasts',
    category: 'Safety',
    badge: 'Emergency',
    colorScheme: 'rose',
  },
  {
    to: '/parent',
    icon: Globe,
    label: 'Parent Communication Portal',
    desc: 'Real-time parent portal for arrival notifications, circulars, and attendance logs',
    category: 'Safety',
    badge: 'Real-Time',
    colorScheme: 'blue',
  },

  // Admin & Reports
  {
    to: '/admin',
    icon: BarChart3,
    label: 'Principal Command Suite',
    desc: 'Centralized school analytics, daily attendance rates, risk prediction and audits',
    category: 'Admin',
    badge: 'Command',
    colorScheme: 'indigo',
  },
  {
    to: '/admin?tab=reports',
    icon: FileSpreadsheet,
    label: 'Attendance Reports & Exports',
    desc: 'Generate daily, monthly, and class-wise attendance summaries with CSV & PDF export',
    category: 'Admin',
    badge: 'Exports',
    colorScheme: 'amber',
  },
  {
    to: '/profile',
    icon: Shield,
    label: 'Security & Access Control',
    desc: 'Manage system credentials, role-based privileges, and telemetry defaults',
    category: 'Admin',
    colorScheme: 'purple',
  },
];

const CATEGORIES = [
  { id: 'All', label: 'All Modules' },
  { id: 'Attendance', label: 'Attendance & Gate' },
  { id: 'Academic', label: 'Academic & Timetable' },
  { id: 'Students', label: 'Students & Classes' },
  { id: 'Safety', label: 'Safety & Parent' },
  { id: 'Admin', label: 'Admin & Operations' },
] as const;

export const LiteHome: React.FC = () => {
  const { setPreference } = usePerformanceMode();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const filteredModules = useMemo(() => {
    return MODULES_LIST.filter((m) => {
      const matchesCategory = selectedCategory === 'All' || m.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        m.label.toLowerCase().includes(q) ||
        m.desc.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        (m.badge && m.badge.toLowerCase().includes(q));

      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, selectedCategory]);

  const getColorClasses = (scheme: ModuleItem['colorScheme']) => {
    switch (scheme) {
      case 'emerald':
        return {
          iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white',
          badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
          borderHover: 'hover:border-emerald-500/40',
        };
      case 'blue':
        return {
          iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white',
          badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/25',
          borderHover: 'hover:border-blue-500/40',
        };
      case 'purple':
        return {
          iconBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 group-hover:bg-purple-600 group-hover:text-white',
          badge: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/25',
          borderHover: 'hover:border-purple-500/40',
        };
      case 'amber':
        return {
          iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 group-hover:bg-amber-500 group-hover:text-white',
          badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25',
          borderHover: 'hover:border-amber-500/40',
        };
      case 'rose':
        return {
          iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 group-hover:bg-rose-600 group-hover:text-white',
          badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/25',
          borderHover: 'hover:border-rose-500/40',
        };
      case 'indigo':
      default:
        return {
          iconBg: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white',
          badge: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/25',
          borderHover: 'hover:border-indigo-500/40',
        };
    }
  };

  return (
    <PageLayout className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-8 sm:space-y-10">

        {/* ========================================================================= */}
        {/* 1. HERO BANNER: GENUINE INSTITUTIONAL LANDING SECTION                     */}
        {/* ========================================================================= */}
        <div className="relative rounded-3xl border border-border/80 bg-gradient-to-br from-card via-card to-primary/5 p-6 sm:p-10 md:p-12 shadow-sm overflow-hidden">
          {/* Subtle Ambient Light Glow in Corner */}
          <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="absolute -left-20 -bottom-20 w-80 h-80 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl space-y-5">
            {/* Institution Badge + Campus Status */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1 text-xs font-bold text-primary">
                <Building2 className="h-3.5 w-3.5" />
                PM Shri Kendriya Vidyalaya NFC Vigyan Vihar
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                Smart Campus Active
              </span>
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-foreground tracking-tight leading-[1.08]">
              Your School,{' '}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 dark:from-cyan-400 dark:via-blue-500 dark:to-indigo-400">
                Fully Automated
              </span>
            </h1>

            {/* Narrative Subtitle */}
            <p className="text-sm sm:text-base md:text-lg text-muted-foreground leading-relaxed max-w-2xl">
              Next-generation smart school automation with instant face recognition attendance, intelligent timetable
              substitution, perimeter gate security, and real-time parent updates.
            </p>

            {/* Primary Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button asChild size="lg" className="h-12 px-6 rounded-2xl font-bold shadow-md shadow-primary/25 gap-2">
                <Link to="/attendance">
                  <Scan className="w-4 h-4" /> Launch Attendance <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>

              <Button asChild variant="outline" size="lg" className="h-12 px-5 rounded-2xl font-semibold gap-2 border-border/80 bg-card hover:bg-muted">
                <Link to="/parent">
                  <Globe className="w-4 h-4 text-blue-500" /> Parent Portal
                </Link>
              </Button>

              <Button asChild variant="outline" size="lg" className="h-12 px-5 rounded-2xl font-semibold gap-2 border-border/80 bg-card hover:bg-muted">
                <Link to="/gate">
                  <DoorOpen className="w-4 h-4 text-purple-500" /> Gate Kiosk
                </Link>
              </Button>

              <Button asChild variant="outline" size="lg" className="h-12 px-5 rounded-2xl font-semibold gap-2 border-border/80 bg-card hover:bg-muted">
                <Link to="/admin?tab=timetable">
                  <BookOpen className="w-4 h-4 text-indigo-500" /> Timetable
                </Link>
              </Button>

              <div className="ml-auto flex items-center gap-2">
                <LiteModeToggle variant="segmented" />
              </div>
            </div>

            {/* Key Quality Pillars Bar */}
            <div className="pt-4 border-t border-border/60 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-semibold text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>AI Face Recognition</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500 shrink-0" />
                <span>Zero-Conflict Timetable</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-500 shrink-0" />
                <span>Perimeter Gate Mode</span>
              </div>
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-indigo-500 shrink-0" />
                <span>ATL Innovation Ready</span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. CORE PLATFORM PILLARS (GENUINE SCHOOL SHOWCASE)                        */}
        {/* ========================================================================= */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">
                Integrated School Capabilities
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Unified AI operations designed for administrators, teachers, parents, and security staff
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Pillar 1: Attendance */}
            <div className="p-5 rounded-2xl border border-border/80 bg-card hover:border-primary/40 transition-all shadow-2xs space-y-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Scan className="h-5 w-5" />
              </div>
              <h3 className="font-extrabold text-sm text-foreground">AI Face Attendance</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Millisecond continuous face tracking at campus terminals with immediate synthesized chime confirmation.
              </p>
              <Link to="/attendance" className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline pt-1">
                Open Terminal <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Pillar 2: Timetable */}
            <div className="p-5 rounded-2xl border border-border/80 bg-card hover:border-primary/40 transition-all shadow-2xs space-y-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <BookOpen className="h-5 w-5" />
              </div>
              <h3 className="font-extrabold text-sm text-foreground">Timetable & Substitution</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                1-click automated AI timetable generation with automatic teacher absence substitution.
              </p>
              <Link to="/admin?tab=timetable" className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline pt-1">
                Manage Timetable <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Pillar 3: Security & Gate */}
            <div className="p-5 rounded-2xl border border-border/80 bg-card hover:border-primary/40 transition-all shadow-2xs space-y-3">
              <div className="h-10 w-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <DoorOpen className="h-5 w-5" />
              </div>
              <h3 className="font-extrabold text-sm text-foreground">Gate Mode & Safety</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Kiosk-ready campus boundary defense with stranger detection and instant emergency broadcasts.
              </p>
              <Link to="/gate" className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline pt-1">
                Launch Gate Mode <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Pillar 4: Parent Portal */}
            <div className="p-5 rounded-2xl border border-border/80 bg-card hover:border-primary/40 transition-all shadow-2xs space-y-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Globe className="h-5 w-5" />
              </div>
              <h3 className="font-extrabold text-sm text-foreground">Parent Portal Link</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Direct parental access for instant arrival notifications, digital circulars, and student registers.
              </p>
              <Link to="/parent" className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline pt-1">
                Visit Portal <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. ATAL TINKERING LAB (ATL) & ROBOTICS INNOVATION HUB                     */}
        {/* ========================================================================= */}
        <div className="p-6 sm:p-8 rounded-3xl border border-border/80 bg-card shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-base sm:text-lg text-foreground">
                    PM Shri ATL Innovation & Robotics Lab
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                    STEM 2026
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Atal Tinkering Lab powered by student-led engineering, 3D prototyping & neural biometrics
                </p>
              </div>
            </div>

            <Button asChild variant="outline" size="sm" className="rounded-xl text-xs font-bold gap-1.5">
              <Link to="/portfolio">
                Explore Portfolios <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <Bot className="h-4 w-4 text-emerald-500" /> Robotics Lab
              </div>
              <p className="text-[11px] text-muted-foreground">Autonomous bots, ROS, servo arrays & microcontrollers</p>
            </div>

            <div className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <Terminal className="h-4 w-4 text-cyan-500" /> Coding Hub
              </div>
              <p className="text-[11px] text-muted-foreground">Python, ArcFace neural models & real-time embedded code</p>
            </div>

            <div className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <CircuitBoard className="h-4 w-4 text-amber-500" /> IoT & Sensors
              </div>
              <p className="text-[11px] text-muted-foreground">ESP32 boards, RFID gate sync & smart environmental sensors</p>
            </div>

            <div className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <Cpu className="h-4 w-4 text-purple-500" /> Neural Biometrics
              </div>
              <p className="text-[11px] text-muted-foreground">High-precision facial recognition running 100% locally on campus</p>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 4. WORKSTATION DIRECTORY: QUICK MODULE ACCESS                             */}
        {/* ========================================================================= */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">
                System Workstations & Tools
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Instant access to all modules, administrative controls, and class rosters
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tools & rosters..."
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-border bg-card text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-2xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/40'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Modules Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredModules.map((m) => {
              const colors = getColorClasses(m.colorScheme);
              return (
                <Link
                  key={m.label}
                  to={m.to}
                  className={`group relative flex flex-col justify-between p-4 rounded-2xl border border-border bg-card transition-all shadow-2xs hover:shadow-sm ${colors.borderHover}`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${colors.iconBg}`}>
                        <m.icon className="h-5 w-5" />
                      </div>
                      {m.badge && (
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${colors.badge}`}>
                          {m.badge}
                        </span>
                      )}
                    </div>

                    <h4 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                      {m.label}
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
                      {m.desc}
                    </p>
                  </div>

                  <div className="pt-3 mt-3 border-t border-border/50 flex items-center justify-between text-xs font-semibold text-muted-foreground group-hover:text-primary transition-colors">
                    <span>Open Tool</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 5. PWA & OFFLINE-READY INSTALLATION CARD                                  */}
        {/* ========================================================================= */}
        <HomeInstallCard />

        {/* ========================================================================= */}
        {/* 6. INSTITUTIONAL CREDITS & FOOTER                                         */}
        {/* ========================================================================= */}
        <footer className="pt-6 pb-12 border-t border-border text-center space-y-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-center gap-2 text-foreground font-semibold">
            <Building2 className="w-4 h-4 text-primary" />
            <span>PM Shri Kendriya Vidyalaya NFC Vigyan Vihar · Delhi</span>
          </div>
          <p className="text-[11px] max-w-md mx-auto">
            Architected and engineered by Gaurav Raj, Swami Anant Vyas, Jatin Dhama & Team RCA
          </p>
          <div className="flex items-center justify-center gap-4 pt-1 text-xs">
            <button
              onClick={() => setPreference('off')}
              className="text-primary hover:underline font-bold"
            >
              Switch to Standard Visual Mode
            </button>
            <span>•</span>
            <Link to="/contact" className="hover:text-foreground transition-colors">
              Help & Support
            </Link>
            <span>•</span>
            <Link to="/portfolio" className="hover:text-foreground transition-colors">
              Team Portfolios
            </Link>
          </div>
        </footer>

      </div>
    </PageLayout>
  );
};

export default LiteHome;
