import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import LiteHome from '@/components/lite/LiteHome';
import gauravPhoto from '@/assets/gaurav-photo.png';
import swamiAnantVyasPhoto from '@/assets/swami-anant-vyas.png';
import jatinDhamaPhoto from '@/assets/jatin-dhama.jpg';
import teamRcaPhoto from '@/assets/team-rca.jpg';
import { usePortfolioData } from '@/hooks/usePortfolioData';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { PublicPortfolioView } from '@/pages/Portfolio';
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
import { RoyalReveal, RoyalStaggerGroup, RoyalStaggerItem } from '@/components/RoyalReveal';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { hasTeacherAccess } from '@/utils/teacherAccess';
import {
  ArrowRight,
  ArrowLeftRight,
  Scan,
  BookOpen,
  Briefcase,
  ExternalLink,
  Github,
  Trophy,
  Shield,
  Bell,
  BarChart3,
  Bus,
  Sparkles,
  Zap,
  Brain,
  Smartphone,
  Users,
  Camera,
  Clock,
  DoorOpen,
  CalendarDays,
  UserCheck,
  ClipboardList,
  GraduationCap,
  Layers,
  Fingerprint,
  Award,
  Heart,
  AlertTriangle,
  MapPin,
  Lock,
  MessageSquare,
  Globe,
  FileText,
  Building2,
  CheckCircle2,
  ShieldCheck,
  Cpu,
  UserPlus,
} from 'lucide-react';

const cardTilt = {
  whileHover: { y: -4 },
  whileTap: { scale: 0.98 },
  transition: { type: 'spring', stiffness: 420, damping: 28, mass: 0.6 },
};

const Index = () => {
  const { liteMode } = usePerformanceMode();
  const { isTeacher, isAdminOrPrincipal, isLoading: isRoleLoading } = useUserRole();
  const [isTeacherConfirmed, setIsTeacherConfirmed] = useState(false);
  const [activeProfile, setActiveProfile] = useState<null | {
    name: string;
    role: string;
    image?: string;
    bio: string;
    details?: string;
  }>(null);

  const navigate = useNavigate();

  // Redirect teachers immediately away from home page
  useEffect(() => {
    if (!isRoleLoading && isTeacher && !isAdminOrPrincipal) {
      navigate('/teacher', { replace: true });
    }
  }, [isTeacher, isAdminOrPrincipal, isRoleLoading, navigate]);

  // If a logged-in teacher opens the app root /, directly route them to the Teacher Portal
  useEffect(() => {
    let isMounted = true;
    const checkActiveTeacher = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !isMounted) return;

        const [userRolesRes, hasAccess] = await Promise.all([
          (supabase as any).from('user_roles').select('role').eq('user_id', user.id),
          hasTeacherAccess(user.id),
        ]);

        const roles: string[] = (userRolesRes.data || []).map((r: any) => r.role);

        if (roles.includes('teacher') || hasAccess) {
          if (isMounted) {
            setIsTeacherConfirmed(true);
            navigate('/teacher', { replace: true });
          }
        }
      } catch (e) {
        // silent fallback
      }
    };
    checkActiveTeacher();
    return () => { isMounted = false; };
  }, [navigate]);

  const modules = [
    { icon: Scan, label: 'Attendance', tone: 'bg-primary/20 text-primary', to: '/attendance' },
    { icon: BookOpen, label: 'Timetable', tone: 'bg-accent/30 text-accent-foreground', to: '/admin?tab=timetable' },
    { icon: Shield, label: 'Gate Passes', tone: 'bg-warning/20 text-warning-foreground', to: '/gate' },
    { icon: Bell, label: 'Alerts', tone: 'bg-success/20 text-success', to: '/admin?tab=emergency' },
    { icon: BarChart3, label: 'Reports', tone: 'bg-primary/20 text-primary', to: '/admin?tab=reports' },
    { icon: UserPlus, label: 'Add Student', tone: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400', to: '/register' },
  ];

  const stats = [
    { value: '99.9%', label: 'Scan accuracy', glow: 'from-[#6c5ce7] to-[#e84393]' },
    { value: '<1s', label: 'Face scan speed', glow: 'from-[#ff6b35] to-[#f7931e]' },
    { value: '1000+', label: 'Registered students', glow: 'from-[#e84393] to-[#6c5ce7]' },
    { value: '24/7', label: 'Campus safety', glow: 'from-[#f7931e] to-[#ff6b35]' },
  ];

  const featureCategories = [
    {
      category: 'Smart Face Attendance',
      icon: Scan,
      gradient: 'from-[#6c5ce7] to-[#e84393]',
      features: [
        { icon: Camera, title: 'Face Recognition', desc: 'Fast face scan to mark attendance instantly.' },
        { icon: Users, title: 'Group Scanning', desc: 'Quickly scan multiple students entering class.' },
        { icon: DoorOpen, title: 'Gate & Classroom', desc: 'Camera mode for classroom or school gate.' },
        { icon: Clock, title: 'Late Arrival Alerts', desc: 'Notify parents if a student arrives late.' },
      ],
    },
    {
      category: 'Timetable & Teachers',
      icon: BookOpen,
      gradient: 'from-[#ff6b35] to-[#f7931e]',
      features: [
        { icon: CalendarDays, title: 'Class Timetable', desc: 'Daily period schedule for every class.' },
        { icon: UserCheck, title: 'Teacher Substitutions', desc: 'Assign replacement teachers when someone is absent.' },
        { icon: ClipboardList, title: 'Teacher Logins', desc: 'Teachers can view and manage their assigned classes.' },
        { icon: FileText, title: 'Substitution Reports', desc: 'Download and print daily substitution charts.' },
      ],
    },
    {
      category: 'Students & Classes',
      icon: GraduationCap,
      gradient: 'from-[#e84393] to-[#6c5ce7]',
      features: [
        { icon: Layers, title: 'Classes & Sections', desc: 'Organize students by classes and sections.' },
        { icon: Fingerprint, title: 'Easy Registration', desc: 'Add new students with photos in seconds.' },
        { icon: Award, title: 'Punctuality Badges', desc: 'Celebrate students with 100% attendance.' },
        { icon: Heart, title: 'Attendance Health', desc: 'Spot attendance trends before exams.' },
      ],
    },
    {
      category: 'Safety & Security',
      icon: Shield,
      gradient: 'from-[#f7931e] to-[#ff6b35]',
      features: [
        { icon: AlertTriangle, title: 'Emergency Alerts', desc: 'Send urgent alerts to staff and parents.' },
        { icon: UserCheck, title: 'Visitor Passes', desc: 'Track school visitors with photo check-in.' },
        { icon: MapPin, title: 'Gate Exit Passes', desc: 'Verify parent pickup and student leaves.' },
        { icon: Lock, title: 'Security Kiosk', desc: 'Guard camera view for campus entry.' },
      ],
    },
    {
      category: 'Parent Communication',
      icon: MessageSquare,
      gradient: 'from-[#6c5ce7] to-[#ff6b35]',
      features: [
        { icon: Bell, title: 'Smart Notifications', desc: 'Targeted alerts through preferred channels.' },
        { icon: Globe, title: 'Parent Portal', desc: 'Attendance, circulars, and performance access.' },
        { icon: FileText, title: 'Digital Circulars', desc: 'Broadcast updates with acknowledgement trail.' },
        { icon: Bus, title: 'Bus Tracking', desc: 'Boarding and route notifications to guardians.' },
      ],
    },
    {
      category: 'Analytics & Reports',
      icon: BarChart3,
      gradient: 'from-[#e84393] to-[#f7931e]',
      features: [
        { icon: Brain, title: 'AI Insights', desc: 'Predictive analysis for attendance risk.' },
        { icon: BarChart3, title: 'Advanced Reports', desc: 'Class-level and student-level reporting.' },
        { icon: Building2, title: 'Principal Dashboard', desc: 'Real-time school-wide command center.' },
        { icon: CalendarDays, title: 'Holiday Calendar', desc: 'Academic calendar with schedule context.' },
      ],
    },
  ];

  const { data: portfolio } = usePortfolioData();
  const { trigger: haptic } = useHapticFeedback();

  // Fallback (used until portfolio JSON loads, or if a member has no image)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio.members],
  );

  const jatinMember = useMemo(
    () =>
      creatorMembers.find((m) => m.name.toLowerCase().includes('jatin')) || {
        name: 'Jatin Dhama',
        role: 'Team Member · QA & Execution',
        image: jatinDhamaPhoto,
        bio: 'Contributes to system testing, execution support, and project coordination across the Presences platform.',
        details: 'Supports feature QA, user feedback loops, and collaborative delivery for KV NFC Vigyan Vihar.',
      },
    [creatorMembers],
  );

  const gauravMember = useMemo(
    () =>
      creatorMembers.find((m) => m.name.toLowerCase().includes('gaurav')) || {
        name: 'Gaurav Raj',
        role: 'Lead Architect & Full-Stack Developer',
        image: gauravPhoto,
        bio: 'Creator of Presences Smart School automation. Designs scalable attendance, security, and school workflow systems.',
        details: 'Full-stack engineer focused on neural face-recognition pipelines, database architecture, and production-ready education tech.',
      },
    [creatorMembers],
  );

  const swamiMember = useMemo(
    () =>
      creatorMembers.find((m) => m.name.toLowerCase().includes('swami')) || {
        name: 'Swami Anant Vyas',
        role: 'Hardware Prototype & Core Contributor',
        image: swamiAnantVyasPhoto,
        bio: 'Helped build the hardware prototype and contributed key ideas for the software experience.',
        details: 'Built and validated early hardware concepts for kiosk gate mode, physical enclosures, and camera triggers.',
      },
    [creatorMembers],
  );

  const [teamMembersList, setTeamMembersList] = useState<any[]>([]);
  const [isSwapped, setIsSwapped] = useState(false);

  const defaultTeamMembers = useMemo(() => creatorMembers.slice(1), [creatorMembers]);
  const displayedTeamMembers = useMemo(() => {
    if (teamMembersList.length > 0) return teamMembersList;
    return defaultTeamMembers;
  }, [teamMembersList, defaultTeamMembers]);

  const handleSwapTeamMembers = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    haptic('selection');
    setIsSwapped((prev) => !prev);
    setTeamMembersList((prev) => {
      const current = prev.length > 0 ? prev : defaultTeamMembers;
      if (current.length <= 1) return current;
      return [...current].reverse();
    });
  };

  // NEVER show the home page to teachers (placed after all hooks to follow React rules)
  if ((isTeacher && !isAdminOrPrincipal) || isTeacherConfirmed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-xs font-semibold text-muted-foreground">Opening Teacher Portal...</p>
        </div>
      </div>
    );
  }

  if (liteMode) return <LiteHome />;

  return (
    <PageTransition>
      <PageLayout className="neon-liquid-bg has-bottom-nav md:pb-0">
        
        {/* ========================================================================= */}
        {/* HERO SECTION — Optimized for Desktop & Mobile Balance                     */}
        {/* ========================================================================= */}
        <section className="pt-2 pb-10 sm:pb-14">
          <div className="grid grid-cols-12 gap-6 items-stretch">
            
            {/* Left Hero Main Card */}
            <RoyalReveal
              effect="fade-up"
              className="nano-glass-hero nano-texture-grain col-span-12 lg:col-span-7 rounded-3xl p-4 sm:p-8 md:p-12 lg:p-14 border border-white/80 dark:border-white/10 shadow-2xl flex flex-col justify-between max-w-full"
            >
              <div>
                {/* Collaboration & Active Status Badges */}
                <div className="flex flex-wrap items-center gap-2.5 mb-6">
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 backdrop-blur-md shadow-xs">
                    <img 
                      src="/kvs-logo.png" 
                      alt="KVS Logo" 
                      className="h-4 w-4 object-contain rounded-full bg-white p-0.5 border border-amber-400/40 shrink-0" 
                    />
                    PM Shri Kendriya Vidyalaya NFC Vigyan Vihar
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    AI Attendance & Security Active
                  </span>
                </div>

                {/* Hero Title */}
                <h1
                  className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.06] text-slate-900 dark:text-foreground tracking-tight break-words"
                  style={{ fontFamily: 'Sora, sans-serif' }}
                >
                  Your School,
                  <br />
                  <span className="bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 dark:from-cyan-300 dark:via-sky-300 dark:to-indigo-300 bg-clip-text text-transparent">
                    Fully Automated
                  </span>
                </h1>

                <p className="mt-6 max-w-xl text-base sm:text-lg md:text-xl leading-relaxed text-slate-700 dark:text-slate-300 font-medium">
                  Fast face-recognition attendance, teacher substitutions, student gate passes, parent portal & attendance reports — simple and easy for everyday use.
                </p>

                {/* Action CTAs — Rebuilt to precisely match capsule button layout */}
                <div className="mt-8 sm:mt-10 space-y-3.5">
                  {/* Row 1: Launch Attendance, Add Student & Parent Portal */}
                  <div className="flex flex-wrap items-center gap-3">
                    <Link to="/attendance">
                      <Button
                        className="h-12 sm:h-13 rounded-full bg-[#22d3ee] hover:bg-[#06b6d4] text-slate-950 font-bold px-7 text-sm sm:text-base shadow-[0_0_24px_rgba(34,211,238,0.45)] hover:shadow-[0_0_32px_rgba(34,211,238,0.6)] transition-all duration-200 btn-spring gap-2.5 active:scale-95"
                      >
                        <Scan className="w-5 h-5 stroke-[2.2]" />
                        <span>Take Attendance</span>
                        <ArrowRight className="w-4 h-4 stroke-[2.2]" />
                      </Button>
                    </Link>
                    <Link to="/register">
                      <Button
                        variant="outline"
                        className="h-12 sm:h-13 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 px-6 text-sm sm:text-base font-semibold backdrop-blur-md transition-all duration-200 btn-spring gap-2 active:scale-95 shadow-sm"
                      >
                        <UserPlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Add Student</span>
                      </Button>
                    </Link>
                    <Link to="/parent">
                      <Button
                        variant="outline"
                        className="h-12 sm:h-13 rounded-full border border-slate-300/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/60 px-6 text-sm sm:text-base font-semibold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 backdrop-blur-md transition-all duration-200 btn-spring gap-2 active:scale-95"
                      >
                        <Globe className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                        <span>Parent Portal</span>
                      </Button>
                    </Link>
                  </div>

                  {/* Row 2: Gate Kiosk, Timetable & Theme Toggle */}
                  <div className="flex flex-wrap items-center gap-3">
                    <Link to="/gate">
                      <Button
                        variant="outline"
                        className="h-12 sm:h-13 rounded-full border border-slate-300/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/60 px-6 text-sm sm:text-base font-semibold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 backdrop-blur-md transition-all duration-200 btn-spring gap-2 active:scale-95"
                      >
                        <DoorOpen className="w-4 h-4 text-fuchsia-500 dark:text-fuchsia-400" />
                        <span>Gate & Campus</span>
                      </Button>
                    </Link>
                    <Link to="/admin?tab=timetable">
                      <Button
                        variant="outline"
                        className="h-12 sm:h-13 rounded-full border border-slate-300/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/60 px-6 text-sm sm:text-base font-semibold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 backdrop-blur-md transition-all duration-200 btn-spring gap-2 active:scale-95"
                      >
                        <BookOpen className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                        <span>Timetable</span>
                      </Button>
                    </Link>
                    <ThemeToggle className="h-12 w-12 sm:h-13 sm:w-13 rounded-full border border-slate-300/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/80 backdrop-blur-md btn-spring text-slate-900 dark:text-white active:scale-95" />
                  </div>
                </div>
              </div>

              {/* Desktop Live Speed & Trust Bar */}
              <div className="mt-10 pt-6 border-t border-border/70 dark:border-white/10 grid grid-cols-3 gap-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">99.9% Accuracy</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Instant Face Scan</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Safe & Auto-Saved</span>
                </div>
              </div>
            </RoyalReveal>

            {/* Right Hero Duo (Neural Orb & Quick Modules) */}
            <div className="col-span-12 lg:col-span-5 flex flex-col gap-6">
              
              {/* Neural Orb Panel */}
              <RoyalReveal effect="fade-up" delay={0.1} className="w-full">
                <NeuralOrbPanel />
              </RoyalReveal>

              {/* System Modules Quick Launch */}
              <RoyalReveal
                effect="fade-up"
                delay={0.15}
                className="nano-glass-bento rounded-3xl p-6 sm:p-7 border border-white/80 dark:border-white/10 shadow-2xl flex-1 flex flex-col justify-between"
              >
                <div>
                  <div className="mb-5 flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-600 dark:text-slate-400 flex items-center gap-2">
                      <Cpu className="h-3.5 w-3.5 text-primary" /> Quick Features
                    </span>
                    <div className="flex gap-1.5 items-center">
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">LIVE</span>
                      <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.9)] animate-pulse" />
                    </div>
                  </div>

                  <RoyalStaggerGroup className="grid grid-cols-3 gap-3" stagger={0.05}>
                    {modules.map((mod) => (
                      <RoyalStaggerItem key={mod.label}>
                        <motion.button
                          type="button"
                          onClick={() => navigate(mod.to)}
                          aria-label={`Open ${mod.label}`}
                          className="w-full nano-card nano-card-interactive p-3.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 shadow-xs"
                          whileHover={{ y: -3 }}
                          whileTap={{ scale: 0.95 }}
                          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <div className={`mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl ${mod.tone}`}>
                            <mod.icon className="h-4 w-4" />
                          </div>
                          <p className="text-[10px] font-bold uppercase tracking-tight text-slate-800 dark:text-foreground truncate">{mod.label}</p>
                        </motion.button>
                      </RoyalStaggerItem>
                    ))}
                  </RoyalStaggerGroup>
                </div>

                <p className="mt-5 text-center text-[10px] font-black tracking-widest text-primary uppercase">
                  All Features Ready to Use
                </p>
              </RoyalReveal>

            </div>

          </div>
        </section>

        {/* ========================================================================= */}
        {/* OFFICIAL INSTITUTIONAL LEADERSHIP — FROM THE PRINCIPAL'S DESK             */}
        {/* ========================================================================= */}
        <section className="pb-14">
          <RoyalReveal effect="fade-up">
            <div className="relative overflow-hidden rounded-3xl border border-amber-400/30 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-[#1e1b4b]/90 text-white p-6 sm:p-8 md:p-10 shadow-2xl backdrop-blur-2xl">
              <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
              <div className="absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
              
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
                {/* Principal Portrait & Institutional Seal */}
                <div className="lg:col-span-4 flex flex-col items-center text-center">
                  <div className="relative group">
                    <div className="absolute -inset-1.5 rounded-3xl bg-gradient-to-r from-amber-400 to-yellow-500 opacity-70 blur-md group-hover:opacity-100 transition-opacity" />
                    <div className="relative h-64 w-52 sm:h-72 sm:w-60 rounded-2xl overflow-hidden border-2 border-amber-300/80 bg-slate-950 shadow-2xl">
                      <img
                        src="/principal-dr-gaya-ravidas.jpg"
                        alt="Dr. Gaya Ravidas — Principal, PM Shri Kendriya Vidyalaya NFC Vigyan Vihar"
                        className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                    {/* Official KVS Crest Overlay Badge */}
                    <div className="absolute -bottom-3 -right-3 h-14 w-14 rounded-2xl bg-white p-1 shadow-xl border-2 border-amber-400 flex items-center justify-center">
                      <img
                        src="/kvs-logo.png"
                        alt="KVS Emblem"
                        className="h-full w-full object-contain"
                      />
                    </div>
                  </div>

                  <div className="mt-5 space-y-1">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-amber-300 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/30">
                      Head of Institution &amp; Patron
                    </span>
                    <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight pt-1" style={{ fontFamily: 'Sora, sans-serif' }}>
                      Dr. Gaya Ravidas
                    </h3>
                    <p className="text-xs font-semibold text-amber-200">
                      Principal
                    </p>
                    <p className="text-[11px] text-slate-300 font-medium">
                      PM Shri Kendriya Vidyalaya NFC Vigyan Vihar
                    </p>
                  </div>
                </div>

                {/* Principal Message & Institutional Vision */}
                <div className="lg:col-span-8 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-400/10 px-3.5 py-1 text-[11px] font-bold text-amber-200">
                      <Award className="h-3.5 w-3.5 text-amber-300" />
                      Official Institutional Endorsement
                    </div>
                    <span className="text-xs font-semibold text-slate-300">
                      Kendriya Vidyalaya Sangathan • Delhi Region
                    </span>
                  </div>

                  <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight" style={{ fontFamily: 'Sora, sans-serif' }}>
                    From the Principal&apos;s Desk
                  </h2>

                  <p className="text-sm sm:text-base text-slate-200 leading-relaxed font-normal">
                    &ldquo;At <strong className="text-amber-300 font-bold">PM Shri Kendriya Vidyalaya NFC Vigyan Vihar</strong>, our vision is to foster educational excellence through modern innovation. The deployment of the <strong className="text-cyan-300 font-bold">Presences AI Smart School Platform</strong> brings millisecond facial verification, proactive campus gate security, automated timetable substitution, and instantaneous parent communication to our school.&rdquo;
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
                      <p className="text-xs font-bold text-amber-300 uppercase tracking-wider">Zero False Markings</p>
                      <p className="text-xs text-slate-300 mt-1">Multi-angle vector validation and edge facial analysis.</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
                      <p className="text-xs font-bold text-cyan-300 uppercase tracking-wider">Smart Gate Safety</p>
                      <p className="text-xs text-slate-300 mt-1">Direct Principal and Gate Security synchronization with parent alerts.</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
                      <p className="text-xs font-bold text-emerald-300 uppercase tracking-wider">CBSE / KVS Aligned</p>
                      <p className="text-xs text-slate-300 mt-1">Full compliance with academic timetables and attendance regulations.</p>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-400">
                    <span className="flex items-center gap-1 text-amber-300 font-semibold">
                      <CheckCircle2 className="h-4 w-4" /> PM Shri KV NFC Vigyan Vihar Official Deployment
                    </span>
                    <span>•</span>
                    <span>Delhi Region • Shift-1</span>
                  </div>
                </div>
              </div>
            </div>
          </RoyalReveal>
        </section>

        {/* ========================================================================= */}
        {/* PRESTIGIOUS TEAM RCA & LEADERSHIP SPOTLIGHT (Desktop Balanced Showcase)   */}
        {/* ========================================================================= */}
        <section className="pb-14">
          <RoyalReveal effect="fade-up">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              
              {/* Left: Team RCA Cinematic Photo Card */}
              <motion.div
                className="lg:col-span-6 group relative overflow-hidden rounded-3xl border border-amber-300/30 bg-card/60 shadow-2xl backdrop-blur-2xl flex flex-col justify-between"
                {...cardTilt}
              >
                <div className="relative min-h-[500px] sm:min-h-[560px] md:min-h-[600px] h-full w-full overflow-hidden flex flex-col justify-between">
                  {/* Photo adjusted lower so heads sit centered in the aura */}
                  <img
                    src={(teamRcaPhoto as any)?.url || (typeof teamRcaPhoto === 'string' ? teamRcaPhoto : '/team-rca.jpg')}
                    alt="Team RCA — Jatin Dhama, Gaurav Raj, Swami Anant Vyas"
                    className="absolute inset-x-0 -bottom-6 top-10 sm:top-14 h-[105%] w-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                    loading="lazy"
                  />
                  <div className="pointer-events-none absolute -inset-8 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.35),transparent_65%)]" />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/50 via-50% to-transparent" />

                  {/* Top Bar with Team RCA Badge & Studio Navigation */}
                  <div className="relative z-20 p-5 sm:p-6 flex items-center justify-between pointer-events-auto">
                    <div className="flex items-center gap-2 rounded-full border border-amber-300/40 bg-black/70 px-3.5 py-1.5 backdrop-blur-md shadow-md">
                      <span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.9)] animate-pulse" />
                      <span className="text-xs font-black uppercase tracking-[0.22em] text-amber-200">Team RCA</span>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate('/portfolio')}
                      className="text-xs font-bold text-amber-200 bg-black/60 hover:bg-black/90 hover:text-amber-100 border border-amber-300/30 rounded-full px-3 py-1 backdrop-blur-md transition-all shadow-sm cursor-pointer"
                    >
                      <span>Studio</span>
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Interactive Hotspot Zones Across Photo */}
                  <div className="absolute inset-0 z-10 grid grid-cols-3 pt-20 pb-52 pointer-events-auto">
                    <button
                      type="button"
                      onClick={() => {
                        haptic('selection');
                        setActiveProfile(jatinMember);
                      }}
                      className="group/zone h-full w-full focus:outline-none cursor-pointer"
                      aria-label="Open Jatin Dhama profile"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        haptic('selection');
                        setActiveProfile(gauravMember);
                      }}
                      className="group/zone h-full w-full focus:outline-none cursor-pointer"
                      aria-label="Open Gaurav Raj profile"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        haptic('selection');
                        setActiveProfile(swamiMember);
                      }}
                      className="group/zone h-full w-full focus:outline-none cursor-pointer"
                      aria-label="Open Swami Anant Vyas profile"
                    />
                  </div>

                  {/* Bottom Title Lockup, Member Hotspots & Go to RCA Projects Button */}
                  <div className="relative z-20 p-5 sm:p-7 space-y-3.5 pointer-events-auto bg-gradient-to-t from-black via-black/80 to-transparent">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.28em] text-amber-300/90">
                        Presences · AI Architecture
                      </p>
                      <h2
                        className="mt-1 bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 bg-clip-text text-2xl sm:text-3xl md:text-4xl font-black leading-tight text-transparent tracking-tight"
                        style={{ fontFamily: 'Sora, sans-serif' }}
                      >
                        Built by Team RCA
                      </h2>
                      <p className="mt-1 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
                        Together in mind · United in purpose
                      </p>
                    </div>

                    {/* 3 Interactive Member Hotspot Buttons */}
                    <div className="grid grid-cols-3 gap-2 sm:gap-2.5 pt-1">
                      {/* JATIN (LEFT) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          haptic('selection');
                          setActiveProfile(jatinMember);
                        }}
                        className="group/btn relative flex flex-col items-center justify-center rounded-2xl border border-white/15 bg-black/75 hover:bg-black/95 hover:border-amber-400/80 py-2 sm:py-2.5 px-1 backdrop-blur-xl transition-all duration-200 shadow-md active:scale-95 cursor-pointer text-center"
                      >
                        <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-amber-100 group-hover/btn:text-amber-300 transition-colors">
                          JATIN
                        </span>
                        <span className="text-[9px] sm:text-[10px] font-bold text-white/60 group-hover/btn:text-white/90 transition-colors">
                          (LEFT)
                        </span>
                      </button>

                      {/* GAURAV (MIDDLE) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          haptic('selection');
                          setActiveProfile(gauravMember);
                        }}
                        className="group/btn relative flex flex-col items-center justify-center rounded-2xl border border-amber-400/50 bg-amber-500/25 hover:bg-amber-500/35 hover:border-amber-300 py-2 sm:py-2.5 px-1 backdrop-blur-xl transition-all duration-200 shadow-md active:scale-95 cursor-pointer text-center"
                      >
                        <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-amber-200 group-hover/btn:text-amber-100 transition-colors">
                          GAURAV
                        </span>
                        <span className="text-[9px] sm:text-[10px] font-bold text-amber-300/90 group-hover/btn:text-amber-200 transition-colors">
                          (MIDDLE)
                        </span>
                      </button>

                      {/* SWAMI (RIGHT) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          haptic('selection');
                          setActiveProfile(swamiMember);
                        }}
                        className="group/btn relative flex flex-col items-center justify-center rounded-2xl border border-white/15 bg-black/75 hover:bg-black/95 hover:border-amber-400/80 py-2 sm:py-2.5 px-1 backdrop-blur-xl transition-all duration-200 shadow-md active:scale-95 cursor-pointer text-center"
                      >
                        <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-amber-100 group-hover/btn:text-amber-300 transition-colors">
                          SWAMI
                        </span>
                        <span className="text-[9px] sm:text-[10px] font-bold text-white/60 group-hover/btn:text-white/90 transition-colors">
                          (RIGHT)
                        </span>
                      </button>
                    </div>

                    {/* Dedicated Button: Go to RCA Projects */}
                    <div className="pt-1">
                      <Button
                        type="button"
                        onClick={() => {
                          haptic('selection');
                          const projEl = document.getElementById('rca-projects');
                          if (projEl) {
                            projEl.scrollIntoView({ behavior: 'smooth' });
                          } else {
                            navigate('/portfolio');
                          }
                        }}
                        className="w-full h-11 sm:h-12 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg shadow-amber-500/25 border border-amber-300/60 btn-spring flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                      >
                        <Briefcase className="w-4 h-4 text-slate-950" />
                        <span>Go to RCA Projects</span>
                        <ArrowRight className="w-4 h-4 text-slate-950" />
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Right: Team Leadership & Members Grid */}
              <div className="lg:col-span-6 flex flex-col justify-between gap-4 bg-white/90 dark:bg-card/75 p-6 sm:p-7 rounded-3xl border border-border/80 dark:border-white/10 shadow-xl backdrop-blur-2xl">
                <div>
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/50">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-500 dark:text-amber-400" /> Creators &amp; Core Architects
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate('/portfolio')}
                      className="text-xs font-bold text-amber-600 dark:text-amber-300 hover:text-amber-700 dark:hover:text-amber-200 hover:bg-amber-400/10 rounded-xl cursor-pointer"
                    >
                      View Studio <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Lead Creator Spotlight Card */}
                  <button
                    type="button"
                    onClick={() => {
                      haptic('selection');
                      setActiveProfile(gauravMember);
                    }}
                    className="flex w-full items-center justify-between gap-4 rounded-2xl border border-amber-300/70 dark:border-amber-400/40 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent p-4 sm:p-5 text-left transition-all hover:border-amber-400 hover:shadow-lg mb-4 cursor-pointer group"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <img
                        src={portfolio.profileImage || gauravMember.image || gauravPhoto}
                        alt={gauravMember.name}
                        className="h-14 w-14 rounded-2xl border-2 border-amber-400/70 object-cover shadow-md shrink-0 group-hover:scale-105 transition-transform"
                        loading="lazy"
                      />
                      <div className="min-w-0">
                        <span className="inline-block text-[10px] font-black uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">
                          Lead · Architect &amp; Developer
                        </span>
                        <p className="text-lg font-black text-slate-900 dark:text-foreground truncate">{gauravMember.name}</p>
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-300 line-clamp-1">{gauravMember.role}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 group-hover:translate-x-1 transition-transform" />
                  </button>

                  {/* Team Members List Header & Swap Button */}
                  <div className="flex items-center justify-between mt-4 mb-2.5 px-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      Core Team Contributors
                    </span>
                    {displayedTeamMembers.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSwapTeamMembers}
                        className="h-6 px-2.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:bg-emerald-500/15 rounded-lg gap-1.5 transition-all active:scale-95 border border-emerald-500/30 bg-emerald-500/10 shadow-xs cursor-pointer"
                        title="Click to swap members"
                      >
                        <motion.div
                          animate={{ rotate: isSwapped ? 180 : 0 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                        >
                          <ArrowLeftRight className="h-3 w-3 text-emerald-700 dark:text-emerald-400" />
                        </motion.div>
                        <span>Click to Swap</span>
                      </Button>
                    )}
                  </div>

                  {/* Team Members List */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative">
                    {displayedTeamMembers.map((member) => (
                      <motion.button
                        layout
                        key={member.name}
                        type="button"
                        onClick={() => {
                          haptic('selection');
                          setActiveProfile(member);
                        }}
                        transition={{ type: 'spring', stiffness: 450, damping: 30, mass: 0.6 }}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-border/80 bg-white/90 dark:bg-card/60 p-3.5 text-left transition-all hover:border-amber-400/60 hover:bg-amber-50/40 dark:hover:bg-accent/40 group shadow-xs cursor-pointer"
                        aria-label={`Open ${member.name} profile`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <MemberAvatar
                            name={member.name}
                            image={member.image}
                            className="h-10 w-10 rounded-xl border border-border/70 shrink-0 group-hover:scale-105 transition-transform"
                            fallbackClassName="text-xs font-bold"
                          />
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Team Member</p>
                            <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-foreground truncate">{member.name}</p>
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-slate-400 shrink-0 group-hover:text-amber-600 dark:group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-border/50 flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <img src="/kvs-logo.png" alt="KVS" className="h-4 w-4 object-contain rounded-full bg-white p-0.5" />
                    <span>Presences AI Engine</span>
                  </div>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400 font-bold">PM Shri KV NFC Vigyan Vihar</span>
                </div>
              </div>

            </div>
          </RoyalReveal>
        </section>

        {/* ========================================================================= */}
        {/* PORTFOLIO FEATURED PROJECTS & ARCHITECTURE SHOWCASE                       */}
        {/* ========================================================================= */}
        {portfolio.projects.length > 0 && (
          <section id="rca-projects" className="pb-14 scroll-mt-20">
            <RoyalReveal effect="fade-up">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center font-bold shadow-md shrink-0">
                    <Briefcase className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-foreground tracking-tight" style={{ fontFamily: 'Sora, sans-serif' }}>
                      Featured Projects &amp; Architecture
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium mt-0.5">
                      Flagship software engines and high-impact systems built by the team
                    </p>
                  </div>
                </div>

                <Button asChild variant="ghost" size="sm" className="text-xs font-bold text-primary hover:text-primary/80 self-start sm:self-auto gap-1 rounded-xl">
                  <Link to="/portfolio">
                    View Portfolio Studio <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>

              <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {portfolio.projects.map((p) => (
                  <motion.article
                    key={p.id}
                    whileHover={{ y: -4 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                    className="group relative overflow-hidden rounded-3xl border border-border/80 dark:border-white/10 bg-white/90 dark:bg-card/75 backdrop-blur-2xl shadow-xl flex flex-col justify-between"
                  >
                    <div className="relative aspect-video overflow-hidden bg-muted/40 group-hover:shadow-lg transition-shadow">
                      {p.image ? (
                        <img
                          src={p.image}
                          alt={p.title}
                          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          <Sparkles className="h-8 w-8 opacity-40" />
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />
                      {p.year && (
                        <span className="absolute right-3.5 top-3.5 rounded-full border border-white/20 bg-black/60 px-3 py-0.5 text-[10px] font-bold text-white shadow-sm backdrop-blur-md">
                          {p.year}
                        </span>
                      )}
                    </div>

                    <div className="p-6 flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="text-lg font-extrabold text-slate-900 dark:text-foreground group-hover:text-primary transition-colors">
                          {p.title}
                        </h3>
                        <p className="mt-2 line-clamp-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                          {p.description}
                        </p>

                        {(p.tags && p.tags.length > 0) || p.stack ? (
                          <div className="mt-3.5 flex flex-wrap gap-1.5">
                            {(p.tags && p.tags.length > 0 ? p.tags : p.stack.split(',').map((s) => s.trim()).filter(Boolean)).map((t) => (
                              <span key={t} className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[10px] font-bold text-primary">
                                {t}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-6 pt-4 border-t border-border/50 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {p.link && (
                            <a
                              href={p.link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
                            >
                              <ExternalLink className="h-3.5 w-3.5" /> Live Demo
                            </a>
                          )}
                          {p.githubUrl && (
                            <a
                              href={p.githubUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-foreground transition-colors"
                            >
                              <Github className="h-3.5 w-3.5" /> Code
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.article>
                ))}
              </div>
            </RoyalReveal>
          </section>
        )}

        {/* ========================================================================= */}
        {/* KEY MILESTONES & ACHIEVEMENTS + TECHNICAL CAPABILITIES                    */}
        {/* ========================================================================= */}
        {portfolio.achievements.length > 0 && (
          <section className="pb-14">
            <RoyalReveal effect="fade-up">
              <div className="grid gap-6 md:grid-cols-2 items-stretch">
                {/* Milestones Card */}
                <div className="rounded-3xl border border-border/80 dark:border-white/10 bg-white/90 dark:bg-card/75 p-6 sm:p-7 shadow-xl backdrop-blur-2xl flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 mb-4 border-b border-border/50">
                      <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-foreground flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-amber-500 dark:text-amber-400" /> Key Milestones &amp; Achievements
                      </h3>
                      <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                        Milestones
                      </span>
                    </div>

                    <ul className="space-y-3 text-xs sm:text-sm">
                      {portfolio.achievements.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <span className="text-slate-700 dark:text-slate-300 font-medium leading-relaxed">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-4 mt-6 border-t border-border/50 flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                    <span>PM Shri KV NFC Vigyan Vihar</span>
                    <span className="font-bold text-primary">High-Impact Delivery</span>
                  </div>
                </div>

                {/* Technical Core & Capabilities Card */}
                <div className="rounded-3xl border border-border/80 dark:border-white/10 bg-white/90 dark:bg-card/75 p-6 sm:p-7 shadow-xl backdrop-blur-2xl flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 mb-4 border-b border-border/50">
                      <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-foreground flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" /> Technical Core &amp; Capabilities
                      </h3>
                      <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                        Tech Stack
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {portfolio.skills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full bg-primary/10 hover:bg-primary/20 border border-primary/25 px-3.5 py-1.5 text-xs font-bold text-primary shadow-xs transition-colors"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 mt-6 border-t border-border/50 flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                    <span>Modern Tech Architecture</span>
                    <Link to="/portfolio" className="font-bold text-primary hover:underline flex items-center gap-1">
                      Full Portfolio <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </RoyalReveal>
          </section>
        )}

        {/* ========================================================================= */}
        {/* PWA INSTALL CARD                                                          */}
        {/* ========================================================================= */}
        <RoyalReveal effect="fade-up">
          <HomeInstallCard />
        </RoyalReveal>

        {/* ========================================================================= */}
        {/* METRICS & ACCURACY STATS                                                 */}
        {/* ========================================================================= */}
        <section className="pb-14">
          <RoyalStaggerGroup className="grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-6" stagger={0.08}>
            {stats.map((stat) => (
              <RoyalStaggerItem key={stat.label}>
                <div className="nano-card nano-card-interactive rounded-3xl p-6 text-center transition-all duration-300 hover:-translate-y-1.5 border border-white/70 dark:border-white/10 shadow-xl">
                  <p className="text-3xl md:text-5xl font-black bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 dark:from-cyan-300 dark:via-sky-300 dark:to-indigo-300 bg-clip-text text-transparent" style={{ fontFamily: 'Sora, sans-serif' }}>
                    {stat.value}
                  </p>
                  <p className="mt-2 text-xs md:text-sm font-bold text-slate-700 dark:text-slate-300">{stat.label}</p>
                </div>
              </RoyalStaggerItem>
            ))}
          </RoyalStaggerGroup>
        </section>

        {/* ========================================================================= */}
        {/* FEATURE CATEGORIES (Desktop Grid with Neon Glow)                         */}
        {/* ========================================================================= */}
        {featureCategories.map((cat, idx) => (
          <RoyalReveal key={cat.category} effect="fade-up" delay={0.05 * (idx % 2)} className="pb-14">
            <div className="mb-6 flex items-center gap-3">
              <div className="inline-flex rounded-2xl bg-primary/15 p-3 text-primary shadow-sm shadow-primary/20">
                <cat.icon className="h-5 w-5" />
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-foreground tracking-tight" style={{ fontFamily: 'Sora, sans-serif' }}>
                {cat.category}
              </h2>
            </div>
            <RoyalStaggerGroup className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6" stagger={0.05}>
              {cat.features.map((feature) => (
                <RoyalStaggerItem key={feature.title}>
                  <div className="nano-glass-bento nano-card-interactive group relative overflow-hidden rounded-3xl p-6 h-full transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-primary/15 border border-white/80 dark:border-white/10 flex flex-col justify-between">
                    <div>
                      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-primary via-accent to-warning" />
                      <div className="mb-4 inline-flex rounded-2xl bg-primary/15 p-3 text-primary">
                        <feature.icon className="h-5 w-5" />
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-foreground">{feature.title}</h3>
                      <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300 font-medium">{feature.desc}</p>
                    </div>
                  </div>
                </RoyalStaggerItem>
              ))}
            </RoyalStaggerGroup>
          </RoyalReveal>
        ))}

        {/* ========================================================================= */}
        {/* CAMPUS & MEDIA GALLERY (Bento, Grid, and Cinematic Carousel)              */}
        {/* ========================================================================= */}
        {(portfolio.settings?.showGalleryOnHome !== false) && portfolio.gallery.length > 0 && (
          <RoyalReveal effect="fade-up" className="pb-14 min-w-0">
            <HomeGallery
              items={portfolio.gallery}
              defaultLayout={portfolio.settings?.homeGalleryLayout || 'bento'}
              title="Media & Campus Gallery"
              subtitle="Capturing smart gate testing, face-recognition kiosks, school activities, and team milestones at KV NFC Vigyan Vihar."
              allowManage={true}
            />
          </RoyalReveal>
        )}

        {/* ========================================================================= */}
        {/* DEVELOPER PORTFOLIO SHOWCASE                                              */}
        {/* ========================================================================= */}
        {(portfolio.settings?.showOnHome !== false) && (
          <RoyalReveal effect="fade-up" className="pb-14 min-w-0">
            <section id="developer-portfolio">
              <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                  <p className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
                    <Sparkles className="h-3 w-3" /> Meet the Developer
                  </p>
                  <h2
                    className="mt-2 text-3xl font-black text-slate-900 dark:text-foreground md:text-4xl"
                    style={{ fontFamily: 'Sora, sans-serif' }}
                  >
                    {portfolio.name || 'Gaurav Raj'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 font-medium md:text-base">
                    {portfolio.role || 'Developer & Team Leader'}
                  </p>
                </div>
              </div>
              <PublicPortfolioView data={portfolio} showGallery={false} showProjects={false} onUnlock={() => navigate('/portfolio')} />
            </section>
          </RoyalReveal>
        )}

        {/* ========================================================================= */}
        {/* BOTTOM CTA BANNER                                                         */}
        {/* ========================================================================= */}
        <RoyalReveal effect="card-lift" className="pb-10">
          <section>
            <div className="liquid-glass-surface relative overflow-hidden rounded-3xl p-8 sm:p-12 md:p-16 border border-border/80 dark:border-white/15 shadow-2xl backdrop-blur-2xl text-center bg-white/90 dark:bg-card/75">
              <div className="relative z-10 max-w-3xl mx-auto">
                <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/15 px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary">
                  <Smartphone className="h-4 w-4" /> Smart School Platform
                </p>
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 dark:text-foreground tracking-tight" style={{ fontFamily: 'Sora, sans-serif' }}>
                  Ready to Automate Your School?
                </h2>
                <p className="mx-auto mt-4 text-sm sm:text-base md:text-lg text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                  Attendance, timetable substitution, kiosk security, communication and analytics in one bright, powerful system.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
                  <Link to="/signup">
                    <Button className="h-14 rounded-2xl bg-primary px-8 text-base font-bold text-primary-foreground shadow-xl shadow-primary/25 hover:bg-primary/90 btn-spring">
                      Get Started — It's Free <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link to="/contact">
                    <Button variant="outline" className="h-14 rounded-2xl border-border/80 bg-white/80 dark:bg-card/55 px-8 text-base font-bold text-slate-900 dark:text-foreground hover:bg-white dark:hover:bg-card/80 btn-spring">
                      Contact Us
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </RoyalReveal>

        {/* Member Detail Dialog */}
        <Dialog open={Boolean(activeProfile)} onOpenChange={(open) => !open && setActiveProfile(null)}>
          <DialogContent className="max-w-md rounded-3xl border border-amber-300/30 bg-card/95 p-0 backdrop-blur-2xl shadow-2xl overflow-hidden">
            {activeProfile && (
              <div className="p-6 space-y-4">
                {/* Header with Quick Member Switcher */}
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/40">
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                    Team RCA Member Profile
                  </span>
                  <div className="flex gap-1">
                    {[
                      { label: 'Jatin', member: jatinMember },
                      { label: 'Gaurav', member: gauravMember },
                      { label: 'Swami', member: swamiMember },
                    ].map((item) => {
                      const isCurrent = activeProfile.name === item.member.name;
                      return (
                        <button
                          key={item.label}
                          onClick={() => {
                            haptic('selection');
                            setActiveProfile(item.member);
                          }}
                          className={cn(
                            "px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer",
                            isCurrent
                              ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-400/40 shadow-xs"
                              : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                          )}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <DialogHeader className="space-y-3 text-left">
                  <div className="flex items-center gap-3.5">
                    <MemberAvatar
                      name={activeProfile.name}
                      image={activeProfile.image}
                      className="h-16 w-16 rounded-2xl border-2 border-amber-400/40 shadow-md object-cover"
                      fallbackClassName="text-lg font-bold"
                    />

                    <div>
                      <DialogTitle className="text-xl font-extrabold text-slate-900 dark:text-white">
                        {activeProfile.name}
                      </DialogTitle>
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
                        {activeProfile.role}
                      </p>
                    </div>
                  </div>

                  <DialogDescription className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                    {activeProfile.bio}
                  </DialogDescription>

                  {activeProfile.details && (
                    <div className="rounded-xl border border-border/60 bg-slate-50/60 dark:bg-slate-800/40 p-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {activeProfile.details}
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-between">
                    <Link
                      to="/portfolio"
                      onClick={() => setActiveProfile(null)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                    >
                      <span>Explore Team RCA Studio</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </DialogHeader>
              </div>
            )}
          </DialogContent>
        </Dialog>

      </PageLayout>
    </PageTransition>
  );
};

export default Index;
