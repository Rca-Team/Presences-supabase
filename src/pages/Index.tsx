import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import gauravPhoto from '@/assets/gaurav-photo.png';
import swamiAnantVyasPhoto from '@/assets/swami-anant-vyas.png';
import jatinDhamaPhoto from '@/assets/jatin-dhama.jpg';
import teamRcaPhoto from '@/assets/team-rca.jpg';
import { usePortfolioData } from '@/hooks/usePortfolioData';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { HomeGallery } from '@/components/portfolio/HomeGallery';
import { MemberAvatar } from '@/components/portfolio/MemberAvatar';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { motion } from 'framer-motion';
import PageLayout from '@/components/layouts/PageLayout';
import PageTransition from '@/components/PageTransition';
import HomeInstallCard from '@/components/HomeInstallCard';
import NeuralOrbPanel from '@/components/home/NeuralOrbPanel';
import LiteModeToggle from '@/components/LiteModeToggle';
import {
  ArrowRight,
  Scan,
  BookOpen,
  Shield,
  Bell,
  BarChart3,
  Sparkles,
  Zap,
  DoorOpen,
  CalendarDays,
  UserCheck,
  GraduationCap,
  Users,
  Globe,
  Building2,
  CheckCircle2,
  ShieldCheck,
  Bot,
  Terminal,
  CircuitBoard,
  Cpu,
  ChevronRight,
  QrCode,
  UserPlus,
  FileSpreadsheet,
  Compass,
  ArrowUpRight,
  Layers,
  HelpCircle,
  Smartphone,
} from 'lucide-react';

const Index: React.FC = () => {
  const { liteMode } = usePerformanceMode();
  const navigate = useNavigate();
  const { data: portfolio } = usePortfolioData();
  const { trigger: haptic } = useHapticFeedback();

  const [activeProfile, setActiveProfile] = useState<null | {
    name: string;
    role: string;
    image?: string;
    bio: string;
    details?: string;
  }>(null);

  const fallbackImages: Record<string, string> = {
    Gaurav: gauravPhoto,
    'Gaurav Raj': gauravPhoto,
    'Swami Anant Vyas': swamiAnantVyasPhoto,
    'Swami Anant': swamiAnantVyasPhoto,
    Swami: swamiAnantVyasPhoto,
    'Jatin Dhama': jatinDhamaPhoto,
    Jatin: jatinDhamaPhoto,
  };

  const creatorMembers = useMemo(
    () =>
      (portfolio.members.length > 0 ? portfolio.members : []).map((m) => ({
        name: m.name,
        role: m.role,
        image: m.image || fallbackImages[m.name] || '',
        bio: m.bio,
        details: m.details,
      })),
    [portfolio.members]
  );

  return (
    <PageTransition>
      <PageLayout className="min-h-screen bg-background pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-12 sm:space-y-16">

          {/* ========================================================================= */}
          {/* 1. HERO SECTION: PROPER FLAGSHIP ACADEMIC PRESENTATION                    */}
          {/* ========================================================================= */}
          <section className="relative rounded-3xl sm:rounded-[36px] border border-border/80 bg-gradient-to-br from-card via-card to-primary/5 p-6 sm:p-10 md:p-14 shadow-sm overflow-hidden">
            {/* Subtle Royal Atmospheric Ambient Glows */}
            <div className="absolute -right-20 -top-20 w-96 h-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
            <div className="absolute -left-20 -bottom-20 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
              {/* Left Column: Heading, Pitch, and Direct Action CTAs */}
              <div className="lg:col-span-7 space-y-6">
                {/* Institutional Accreditation Pill */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-bold text-primary">
                    <Building2 className="h-4 w-4" />
                    PM Shri Kendriya Vidyalaya NFC Vigyan Vihar · Delhi
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    Smart AI Campus Online
                  </span>
                </div>

                {/* Flagship Title */}
                <div className="space-y-2">
                  <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-foreground tracking-tight leading-[1.08]">
                    Smart School Automation,{' '}
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 dark:from-cyan-400 dark:via-blue-500 dark:to-indigo-400">
                      Reimagined
                    </span>
                  </h1>
                </div>

                {/* Subtitle */}
                <p className="text-sm sm:text-base md:text-lg text-muted-foreground leading-relaxed max-w-2xl font-normal">
                  An all-in-one AI platform engineered for Indian schools: millisecond facial recognition attendance,
                  conflict-free timetable substitution, perimeter gate security, and instant parent notifications.
                </p>

                {/* Primary Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Button
                    asChild
                    size="lg"
                    className="h-13 px-7 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm sm:text-base shadow-lg shadow-primary/25 gap-2"
                  >
                    <Link to="/attendance">
                      <Scan className="w-5 h-5" /> Launch Attendance <ArrowRight className="w-4 h-4" />
                    </Link>
                  </Button>

                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="h-13 px-6 rounded-2xl font-semibold text-sm sm:text-base gap-2 border-border/80 bg-card hover:bg-muted"
                  >
                    <Link to="/parent">
                      <Globe className="w-4 h-4 text-blue-500" /> Parent Portal
                    </Link>
                  </Button>

                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="h-13 px-5 rounded-2xl font-semibold text-sm sm:text-base gap-2 border-border/80 bg-card hover:bg-muted"
                  >
                    <Link to="/gate">
                      <DoorOpen className="w-4 h-4 text-purple-500" /> Gate Kiosk
                    </Link>
                  </Button>

                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="h-13 px-5 rounded-2xl font-semibold text-sm sm:text-base gap-2 border-border/80 bg-card hover:bg-muted"
                  >
                    <Link to="/admin?tab=timetable">
                      <BookOpen className="w-4 h-4 text-indigo-500" /> Timetable
                    </Link>
                  </Button>

                  <ThemeToggle className="h-13 w-13 rounded-2xl border-border/80 bg-card hover:bg-muted" />
                </div>

                {/* Feature Proof Strip */}
                <div className="pt-4 border-t border-border/60 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-semibold text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>&lt;120ms AI Face Match</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-500 shrink-0" />
                    <span>Auto Teacher Substitution</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-blue-500 shrink-0" />
                    <span>Perimeter Gate Defense</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-indigo-500 shrink-0" />
                    <span>ATL Innovation Ready</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Interactive Quick Card / Neural Panel */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                {!liteMode ? (
                  <NeuralOrbPanel />
                ) : (
                  <div className="rounded-3xl border border-border/80 bg-card/90 p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-primary" /> Active Workstation
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                        High Speed 60 FPS
                      </span>
                    </div>

                    <h3 className="text-lg font-black text-foreground">
                      PM Shri Kendriya Vidyalaya Operations Suite
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Instant biometric verification, class-wise roll call registers, teacher absence management, and emergency broadcast controls.
                    </p>

                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <Link to="/teacher" className="p-3 rounded-2xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors text-xs space-y-1 block">
                        <GraduationCap className="h-4 w-4 text-blue-500" />
                        <div className="font-bold text-foreground">Teacher Portal</div>
                        <div className="text-[10px] text-muted-foreground">Class rosters & register</div>
                      </Link>
                      <Link to="/register" className="p-3 rounded-2xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors text-xs space-y-1 block">
                        <UserPlus className="h-4 w-4 text-purple-500" />
                        <div className="font-bold text-foreground">Face Enrollment</div>
                        <div className="text-[10px] text-muted-foreground">Register new students</div>
                      </Link>
                      <Link to="/admin?tab=students" className="p-3 rounded-2xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors text-xs space-y-1 block">
                        <Users className="h-4 w-4 text-emerald-500" />
                        <div className="font-bold text-foreground">Student Directory</div>
                        <div className="text-[10px] text-muted-foreground">All classes & sections</div>
                      </Link>
                      <Link to="/admin?tab=reports" className="p-3 rounded-2xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors text-xs space-y-1 block">
                        <FileSpreadsheet className="h-4 w-4 text-amber-500" />
                        <div className="font-bold text-foreground">CBSE Register</div>
                        <div className="text-[10px] text-muted-foreground">Monthly export & print</div>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ========================================================================= */}
          {/* 2. THE 4 CORE WORKSTATION PILLARS (INTERACTIVE DECK)                      */}
          {/* ========================================================================= */}
          <section className="space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3 px-1">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-primary">Core Systems</p>
                <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight mt-1">
                  Integrated Campus Capabilities
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-md">
                Engineered for school administrators, class teachers, students, and guardians
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Pillar 1: Autonomous Face Attendance */}
              <div className="group rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-card to-card p-6 shadow-xs flex flex-col justify-between hover:border-emerald-500/50 hover:shadow-md transition-all space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="h-12 w-12 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                      <Scan className="h-6 w-6" />
                    </div>
                    <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                      Kiosk Ready
                    </span>
                  </div>
                  <div>
                    <h3 className="font-black text-lg text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      Face Recognition Terminal
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                      Hands-free continuous multi-student face recognition with instant audio feedback and automated parent SMS notifications.
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-border/60 flex items-center justify-between">
                  <Button asChild size="sm" className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow-sm shadow-emerald-600/20">
                    <Link to="/attendance">
                      Launch Camera <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <Link to="/attendance?mode=qr&autostart=1" className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <QrCode className="h-3.5 w-3.5" /> QR Mode
                  </Link>
                </div>
              </div>

              {/* Pillar 2: AI Timetable & Substitution */}
              <div className="group rounded-3xl border border-indigo-500/25 bg-gradient-to-br from-indigo-500/10 via-card to-card p-6 shadow-xs flex flex-col justify-between hover:border-indigo-500/50 hover:shadow-md transition-all space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="h-12 w-12 rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                      <BookOpen className="h-6 w-6" />
                    </div>
                    <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                      Automated
                    </span>
                  </div>
                  <div>
                    <h3 className="font-black text-lg text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      Smart Timetable AI
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                      1-click automated schedule generation for all classes and automatic substitution when a faculty member is on leave.
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-border/60 flex items-center justify-between">
                  <Button asChild size="sm" className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-1.5 shadow-sm shadow-indigo-600/20">
                    <Link to="/admin?tab=timetable">
                      Open Schedule <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <Link to="/teacher" className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <GraduationCap className="h-3.5 w-3.5" /> Teacher Hub
                  </Link>
                </div>
              </div>

              {/* Pillar 3: Gate Security & Stranger Alerts */}
              <div className="group rounded-3xl border border-purple-500/25 bg-gradient-to-br from-purple-500/10 via-card to-card p-6 shadow-xs flex flex-col justify-between hover:border-purple-500/50 hover:shadow-md transition-all space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="h-12 w-12 rounded-2xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                      <DoorOpen className="h-6 w-6" />
                    </div>
                    <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                      Perimeter
                    </span>
                  </div>
                  <div>
                    <h3 className="font-black text-lg text-foreground group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                      Gate Security & Alerts
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                      Kiosk boundary monitoring, visitor QR verification, unknown face detection, and instant campus-wide emergency lockdown.
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-border/60 flex items-center justify-between">
                  <Button asChild size="sm" className="h-9 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs gap-1.5 shadow-sm shadow-purple-600/20">
                    <Link to="/gate">
                      Launch Gate <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <Link to="/admin?tab=emergency" className="text-xs font-semibold text-rose-500 hover:underline flex items-center gap-1">
                    <Bell className="h-3.5 w-3.5" /> Emergency
                  </Link>
                </div>
              </div>

              {/* Pillar 4: Parent & Guardian Portal */}
              <div className="group rounded-3xl border border-blue-500/25 bg-gradient-to-br from-blue-500/10 via-card to-card p-6 shadow-xs flex flex-col justify-between hover:border-blue-500/50 hover:shadow-md transition-all space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="h-12 w-12 rounded-2xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <Globe className="h-6 w-6" />
                    </div>
                    <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                      Community
                    </span>
                  </div>
                  <div>
                    <h3 className="font-black text-lg text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      Parent Communication
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                      Real-time child arrival alerts, school circulars, academic notifications, and full monthly attendance transparency.
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-border/60 flex items-center justify-between">
                  <Button asChild size="sm" className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5 shadow-sm shadow-blue-600/20">
                    <Link to="/parent">
                      Open Portal <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <Link to="/contact" className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1">
                    Support <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* ========================================================================= */}
          {/* 3. ATAL TINKERING LAB (ATL) & ROBOTICS SHOWCASE                           */}
          {/* ========================================================================= */}
          <section className="p-6 sm:p-10 rounded-3xl sm:rounded-[32px] border border-border/80 bg-gradient-to-br from-card via-card to-amber-500/5 shadow-sm space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center font-bold shadow-md shrink-0">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                      PM Shri Atal Tinkering Lab & Robotics Hub
                    </h2>
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                      STEM 2026
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    Fostering curiosity, innovation, and technological mastery at PM Shri KV NFC Vigyan Vihar
                  </p>
                </div>
              </div>

              <Button asChild variant="outline" size="sm" className="h-9 rounded-xl font-bold text-xs gap-1.5 self-start md:self-auto">
                <Link to="/portfolio">
                  Student Portfolios <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
              <div className="p-4 rounded-2xl border border-border/70 bg-background/60 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Bot className="h-5 w-5 text-emerald-500" />
                  <span>Autonomous Robotics</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  ROS-enabled ground robots, servo kinematics, obstacle avoidance, and motorized smart assemblies.
                </p>
              </div>

              <div className="p-4 rounded-2xl border border-border/70 bg-background/60 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Terminal className="h-5 w-5 text-cyan-500" />
                  <span>AI & Python Code Hub</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  ArcFace facial recognition pipelines, neural network models, and embedded computer vision algorithms.
                </p>
              </div>

              <div className="p-4 rounded-2xl border border-border/70 bg-background/60 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <CircuitBoard className="h-5 w-5 text-amber-500" />
                  <span>IoT & Sensor Systems</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  ESP32 microcontrollers, RFID gate telemetry, telemetry logs, and wireless environmental monitoring.
                </p>
              </div>

              <div className="p-4 rounded-2xl border border-border/70 bg-background/60 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Cpu className="h-5 w-5 text-purple-500" />
                  <span>Rapid Prototyping</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  3D CAD modeling, 3D printing of custom brackets, sensor enclosures, and hardware integration.
                </p>
              </div>
            </div>
          </section>

          {/* ========================================================================= */}
          {/* 4. INSTITUTIONAL SHOWCASE & ARCHITECTS (TEAM RCA)                         */}
          {/* ========================================================================= */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Team RCA Card */}
            <div className="lg:col-span-6 rounded-3xl border border-amber-300/30 bg-card/70 p-6 sm:p-8 shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 flex items-center gap-2">
                    <Sparkles className="h-4 w-4" /> System Architects
                  </span>
                  <span className="text-xs font-mono text-muted-foreground">Team RCA</span>
                </div>

                <h3 className="text-xl sm:text-2xl font-black text-foreground tracking-tight mt-3">
                  Built by Team RCA for PM Shri Kendriya Vidyalaya
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed">
                  Presences was conceived, architected, and engineered from the ground up by student-technologists
                  at PM Shri KV NFC Vigyan Vihar to solve real-world school attendance and security challenges.
                </p>
              </div>

              {/* Members Row */}
              <div className="grid grid-cols-3 gap-3 pt-3">
                <div className="p-3 rounded-2xl border border-border/70 bg-background/50 text-center space-y-1">
                  <p className="font-extrabold text-xs text-foreground">Gaurav Raj</p>
                  <p className="text-[10px] text-muted-foreground">Lead Architect</p>
                </div>
                <div className="p-3 rounded-2xl border border-border/70 bg-background/50 text-center space-y-1">
                  <p className="font-extrabold text-xs text-foreground">Swami Anant</p>
                  <p className="text-[10px] text-muted-foreground">Co-Founder & AI</p>
                </div>
                <div className="p-3 rounded-2xl border border-border/70 bg-background/50 text-center space-y-1">
                  <p className="font-extrabold text-xs text-foreground">Jatin Dhama</p>
                  <p className="text-[10px] text-muted-foreground">Systems & IoT</p>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <Button asChild variant="outline" size="sm" className="rounded-xl text-xs font-bold gap-1.5">
                  <Link to="/portfolio">
                    View Complete Developer Studio <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                <span className="text-[11px] text-muted-foreground font-semibold">Together in mind</span>
              </div>
            </div>

            {/* CBSE Accreditation & School Security Overview */}
            <div className="lg:col-span-6 rounded-3xl border border-border/80 bg-card/70 p-6 sm:p-8 shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" /> Academic Compliance
                  </span>
                  <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-bold">CBSE Aligned</span>
                </div>

                <h3 className="text-xl sm:text-2xl font-black text-foreground tracking-tight mt-3">
                  Verified Biometric Campus Standards
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed">
                  Structured to satisfy Central Board of Secondary Education guidelines: 75% attendance threshold tracking,
                  accurate day-by-day monthly registers, printable substitution records, and official circular broadcasts.
                </p>
              </div>

              <div className="space-y-2 pt-2 text-xs">
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Face Recognition Accuracy</span>
                  <span className="font-bold text-foreground">99.9% (ArcFace Local Edge Model)</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Attendance Registration Capacity</span>
                  <span className="font-bold text-foreground">1000+ Enrolled Students</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-muted-foreground">Timetable Conflict Resolution</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">Zero-Period Clash Guarantee</span>
                </div>
              </div>

              <div className="pt-2">
                <Button asChild size="sm" className="w-full rounded-xl font-bold text-xs gap-1.5">
                  <Link to="/features">
                    Explore All School Features & Specifications <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          </section>

          {/* ========================================================================= */}
          {/* 5. CAMPUS & MEDIA GALLERY (Bento Layout)                                  */}
          {/* ========================================================================= */}
          {(portfolio.settings?.showGalleryOnHome !== false) && portfolio.gallery.length > 0 && (
            <section className="space-y-4">
              <HomeGallery
                items={portfolio.gallery}
                defaultLayout={portfolio.settings?.homeGalleryLayout || 'bento'}
                title="Media & Campus Moments"
                subtitle="Capturing smart gate testing, face-recognition kiosks, ATL activities, and milestones at PM Shri KV NFC Vigyan Vihar."
                allowManage={true}
              />
            </section>
          )}

          {/* ========================================================================= */}
          {/* 6. PWA & OFFLINE-READY INSTALLATION CARD                                  */}
          {/* ========================================================================= */}
          <HomeInstallCard />

          {/* ========================================================================= */}
          {/* 7. INSTITUTIONAL FOOTER                                                   */}
          {/* ========================================================================= */}
          <footer className="pt-8 pb-12 border-t border-border text-center space-y-3 text-xs text-muted-foreground">
            <div className="flex items-center justify-center gap-2 text-foreground font-bold text-sm">
              <Building2 className="w-5 h-5 text-primary" />
              <span>PM Shri Kendriya Vidyalaya NFC Vigyan Vihar · Delhi</span>
            </div>
            <p className="text-xs max-w-lg mx-auto">
              Presences Smart School Platform — Engineered with passion by Team RCA. Dedicated to excellence in education and school automation.
            </p>
            <div className="flex items-center justify-center gap-4 pt-2 text-xs flex-wrap">
              <Link to="/attendance" className="hover:text-foreground transition-colors font-medium">
                Attendance Terminal
              </Link>
              <span>•</span>
              <Link to="/parent" className="hover:text-foreground transition-colors font-medium">
                Parent Portal
              </Link>
              <span>•</span>
              <Link to="/gate" className="hover:text-foreground transition-colors font-medium">
                Gate Kiosk
              </Link>
              <span>•</span>
              <Link to="/admin?tab=timetable" className="hover:text-foreground transition-colors font-medium">
                Timetable
              </Link>
              <span>•</span>
              <Link to="/portfolio" className="hover:text-foreground transition-colors font-medium">
                Developer Studio
              </Link>
              <span>•</span>
              <Link to="/contact" className="hover:text-foreground transition-colors font-medium">
                Support
              </Link>
            </div>
          </footer>

        </div>
      </PageLayout>
    </PageTransition>
  );
};

export default Index;
