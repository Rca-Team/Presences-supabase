import React, { useState, useMemo, useEffect } from 'react';
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
  Calendar,
  Compass,
  LayoutGrid,
  Laptop,
  Radio,
  Sliders,
  ExternalLink,
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
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000 * 30);
    return () => clearInterval(timer);
  }, []);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  const currentDateString = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);

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
          iconBg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white',
          badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
          borderHover: 'hover:border-emerald-500/40 hover:shadow-emerald-500/10',
          accent: 'from-emerald-500/10 to-teal-500/5',
        };
      case 'blue':
        return {
          iconBg: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white',
          badge: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/25',
          borderHover: 'hover:border-blue-500/40 hover:shadow-blue-500/10',
          accent: 'from-blue-500/10 to-cyan-500/5',
        };
      case 'purple':
        return {
          iconBg: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 group-hover:bg-purple-600 group-hover:text-white',
          badge: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/25',
          borderHover: 'hover:border-purple-500/40 hover:shadow-purple-500/10',
          accent: 'from-purple-500/10 to-pink-500/5',
        };
      case 'amber':
        return {
          iconBg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 group-hover:bg-amber-600 group-hover:text-white',
          badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25',
          borderHover: 'hover:border-amber-500/40 hover:shadow-amber-500/10',
          accent: 'from-amber-500/10 to-orange-500/5',
        };
      case 'rose':
        return {
          iconBg: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 group-hover:bg-rose-600 group-hover:text-white',
          badge: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25',
          borderHover: 'hover:border-rose-500/40 hover:shadow-rose-500/10',
          accent: 'from-rose-500/10 to-red-500/5',
        };
      case 'indigo':
      default:
        return {
          iconBg: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white',
          badge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/25',
          borderHover: 'hover:border-indigo-500/40 hover:shadow-indigo-500/10',
          accent: 'from-indigo-500/10 to-violet-500/5',
        };
    }
  };

  return (
    <PageLayout className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-6 sm:space-y-8">

        {/* ========================================================================= */}
        {/* 1. OPERATING COCKPIT HEADER BAR                                           */}
        {/* ========================================================================= */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 sm:p-5 rounded-3xl border border-border/80 bg-card shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-md shadow-blue-500/20 shrink-0">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-extrabold text-base sm:text-lg text-foreground tracking-tight">
                  PM Shri KV NFC Vigyan Vihar
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[11px] font-bold">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Presences Workspace
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {greeting} · Session 2026–27 · {currentDateString} {currentTime && `· ${currentTime}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end md:self-center">
            <LiteModeToggle variant="segmented" />
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. DISTINCTIVE ACTION LAUNCHPAD: 4 TACTILE BENTO TILES                    */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* TILE 1: FACE ATTENDANCE */}
          <div className="group relative rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-card to-card p-5 shadow-xs flex flex-col justify-between hover:border-emerald-500/60 transition-all">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-11 w-11 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <Scan className="h-6 w-6" />
                </div>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  Primary Hub
                </span>
              </div>
              <div>
                <h2 className="font-black text-lg text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  Face Terminal
                </h2>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Hands-free continuous multi-student face scan with instant audio confirmation.
                </p>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-border/60 flex items-center justify-between">
              <Button asChild size="sm" className="h-8 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow-sm shadow-emerald-600/25">
                <Link to="/attendance">
                  Launch Kiosk <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <Link to="/attendance?mode=qr&autostart=1" className="text-[11px] font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1">
                <QrCode className="h-3.5 w-3.5" /> QR Scan
              </Link>
            </div>
          </div>

          {/* TILE 2: TIMETABLE & SUBSTITUTION */}
          <div className="group relative rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 via-card to-card p-5 shadow-xs flex flex-col justify-between hover:border-indigo-500/60 transition-all">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-11 w-11 rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                  <BookOpen className="h-6 w-6" />
                </div>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                  Automated AI
                </span>
              </div>
              <div>
                <h2 className="font-black text-lg text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  Smart Timetable
                </h2>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Period allocation matrices & automatic teacher absence replacement engine.
                </p>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-border/60 flex items-center justify-between">
              <Button asChild size="sm" className="h-8 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-1.5 shadow-sm shadow-indigo-600/25">
                <Link to="/admin?tab=timetable">
                  Open Schedule <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <Link to="/teacher" className="text-[11px] font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1">
                <GraduationCap className="h-3.5 w-3.5" /> Teachers
              </Link>
            </div>
          </div>

          {/* TILE 3: GATE SECURITY KIOSK */}
          <div className="group relative rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-card to-card p-5 shadow-xs flex flex-col justify-between hover:border-purple-500/60 transition-all">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-11 w-11 rounded-2xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                  <DoorOpen className="h-6 w-6" />
                </div>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                  Perimeter
                </span>
              </div>
              <div>
                <h2 className="font-black text-lg text-foreground group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                  Gate Security
                </h2>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Perimeter monitoring, stranger alerts, and visitor verification at school gates.
                </p>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-border/60 flex items-center justify-between">
              <Button asChild size="sm" className="h-8 px-3.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs gap-1.5 shadow-sm shadow-purple-600/25">
                <Link to="/gate">
                  Launch Gate <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <Link to="/admin?tab=emergency" className="text-[11px] font-semibold text-rose-500 hover:underline flex items-center gap-1">
                <Bell className="h-3.5 w-3.5" /> Alert Mode
              </Link>
            </div>
          </div>

          {/* TILE 4: PARENT & GUARDIAN PORTAL */}
          <div className="group relative rounded-3xl border border-blue-500/30 bg-gradient-to-br from-blue-500/10 via-card to-card p-5 shadow-xs flex flex-col justify-between hover:border-blue-500/60 transition-all">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-11 w-11 rounded-2xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <Globe className="h-6 w-6" />
                </div>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                  Public Link
                </span>
              </div>
              <div>
                <h2 className="font-black text-lg text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  Parent Portal
                </h2>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Real-time arrival alerts, digital school circulars, and attendance logs.
                </p>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-border/60 flex items-center justify-between">
              <Button asChild size="sm" className="h-8 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5 shadow-sm shadow-blue-600/25">
                <Link to="/parent">
                  Open Portal <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <Link to="/features" className="text-[11px] font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1">
                Features <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* 3. QUICK ACCESS LAUNCH RIBBON (1-Tap Workstation Shortcuts)               */}
        {/* ========================================================================= */}
        <div className="p-3.5 sm:p-4 rounded-2xl border border-border/80 bg-card flex items-center justify-between gap-2 overflow-x-auto scrollbar-none shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground shrink-0 pr-2 border-r border-border/60">
            <Compass className="h-4 w-4 text-primary" />
            <span>Fast Links:</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button asChild variant="ghost" size="sm" className="h-8 px-3 text-xs font-semibold rounded-xl gap-1.5">
              <Link to="/teacher">
                <GraduationCap className="h-3.5 w-3.5 text-blue-500" /> Teacher Portal
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-8 px-3 text-xs font-semibold rounded-xl gap-1.5">
              <Link to="/register">
                <UserPlus className="h-3.5 w-3.5 text-purple-500" /> Face Enrollment
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-8 px-3 text-xs font-semibold rounded-xl gap-1.5">
              <Link to="/admin?tab=students">
                <Users className="h-3.5 w-3.5 text-emerald-500" /> Student Directory
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-8 px-3 text-xs font-semibold rounded-xl gap-1.5">
              <Link to="/admin?tab=reports">
                <FileSpreadsheet className="h-3.5 w-3.5 text-amber-500" /> Class Reports
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-8 px-3 text-xs font-semibold rounded-xl gap-1.5">
              <Link to="/portfolio">
                <Sparkles className="h-3.5 w-3.5 text-indigo-500" /> Team & Hall of Fame
              </Link>
            </Button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 4. PM SHRI ATL LAB & ROBOTICS SHOWCASE CAROUSEL DECK                      */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
          
          {/* ATL Innovation Banner (8 Cols) */}
          <div className="md:col-span-8 rounded-3xl border border-border/80 bg-gradient-to-br from-card via-card to-amber-500/5 p-6 shadow-xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <span className="font-extrabold text-sm sm:text-base text-foreground">
                    PM Shri Atal Tinkering Lab (ATL)
                  </span>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                  Robotics & AI 2026
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-black text-foreground tracking-tight mt-3">
                Innovate, Create & Automate
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-relaxed">
                Empowering Kendriya Vidyalaya students with cutting-edge hands-on robotics, ROS-enabled autonomous systems,
                3D rapid prototyping, and embedded neural computer vision.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2">
              <div className="p-3 rounded-2xl border border-border/70 bg-background/60 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <Bot className="h-4 w-4 text-emerald-500" /> Robotics Wing
                </div>
                <p className="text-[10px] text-muted-foreground">Autonomous ground bots & servo arrays</p>
              </div>

              <div className="p-3 rounded-2xl border border-border/70 bg-background/60 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <Terminal className="h-4 w-4 text-cyan-500" /> Python Code Club
                </div>
                <p className="text-[10px] text-muted-foreground">ArcFace AI models & embedded C++</p>
              </div>

              <div className="p-3 rounded-2xl border border-border/70 bg-background/60 space-y-1 col-span-2 sm:col-span-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <CircuitBoard className="h-4 w-4 text-amber-500" /> Smart IoT Sensors
                </div>
                <p className="text-[10px] text-muted-foreground">RFID gate sync & ESP32 automation</p>
              </div>
            </div>
          </div>

          {/* School Overview Card (4 Cols) */}
          <div className="md:col-span-4 rounded-3xl border border-border/80 bg-card p-6 shadow-xs flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                  Institution Status
                </span>
                <ShieldCheck className="h-4 w-4 text-primary" />
              </div>

              <h4 className="font-extrabold text-base text-foreground">
                CBSE Certified Smart Campus
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Official biometric attendance compliance, automated teacher substitution logs, and multi-channel parental communication.
              </p>

              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">Biometric Engine</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">Online & Verified</span>
                </div>
                <div className="flex items-center justify-between text-xs py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">Timetable Matrix</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">Class 6–12 Ready</span>
                </div>
                <div className="flex items-center justify-between text-xs py-1.5">
                  <span className="text-muted-foreground">Gate Mode Kiosk</span>
                  <span className="font-bold text-purple-600 dark:text-purple-400">Active Perimeter</span>
                </div>
              </div>
            </div>

            <Button asChild variant="outline" size="sm" className="w-full rounded-xl text-xs font-bold gap-1.5">
              <Link to="/features">
                Explore Full Platform <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* 5. ALL MODULES COMMAND SUITE & INSTANT SEARCH                             */}
        {/* ========================================================================= */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <LayoutGrid className="h-5 w-5 text-primary" />
              <div>
                <h3 className="font-extrabold text-base sm:text-lg text-foreground">
                  System Workstations Directory
                </h3>
                <p className="text-xs text-muted-foreground">
                  All administrative controls, registries, schedules, and tools
                </p>
              </div>
            </div>

            {/* Live Search Bar */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tools, rosters, classes..."
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

          {/* Category Tabs */}
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
                    <span>Open Workstation</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 6. PWA INSTALLATION PROMPT                                                */}
        {/* ========================================================================= */}
        <HomeInstallCard />

        {/* ========================================================================= */}
        {/* 7. INSTITUTIONAL CREDITS & FOOTER                                         */}
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
