import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import LiteHome from '@/components/lite/LiteHome';
import gauravPhoto from '@/assets/gaurav-photo.png';
import swamiAnantVyasPhoto from '@/assets/swami-anant-vyas.png.asset.json';
import jatinDhamaPhoto from '@/assets/jatin-dhama.jpg';
import teamRcaPhoto from '@/assets/team-rca.jpg.asset.json';
import { usePortfolioData } from '@/hooks/usePortfolioData';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { PublicPortfolioView } from '@/pages/Portfolio';
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
import {
  ArrowRight,
  ArrowLeftRight,
  Scan,
  BookOpen,
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
} from 'lucide-react';

const cardTilt = {
  whileHover: { y: -4 },
  transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
};

const Index = () => {
  const { liteMode } = usePerformanceMode();
  const [activeProfile, setActiveProfile] = useState<null | {
    name: string;
    role: string;
    image?: string;
    bio: string;
    details?: string;
  }>(null);

  const navigate = useNavigate();

  const modules = [
    { icon: Scan, label: 'Attendance', tone: 'bg-primary/20 text-primary', to: '/attendance' },
    { icon: BookOpen, label: 'Timetable', tone: 'bg-accent/30 text-accent-foreground', to: '/admin?tab=timetable' },
    { icon: Shield, label: 'Security', tone: 'bg-warning/20 text-warning-foreground', to: '/gate' },
    { icon: Bell, label: 'Alerts', tone: 'bg-success/20 text-success', to: '/admin?tab=emergency' },
    { icon: BarChart3, label: 'Analytics', tone: 'bg-primary/20 text-primary', to: '/admin?tab=reports' },
    { icon: Bus, label: 'Transport', tone: 'bg-accent/30 text-accent-foreground', to: '/features' },
  ];

  const stats = [
    { value: '99.9%', label: 'Attendance accuracy', glow: 'from-[#6c5ce7] to-[#e84393]' },
    { value: '<1s', label: 'Face scan speed', glow: 'from-[#ff6b35] to-[#f7931e]' },
    { value: '1000+', label: 'Bulk registrations', glow: 'from-[#e84393] to-[#6c5ce7]' },
    { value: '24/7', label: 'Campus monitoring', glow: 'from-[#f7931e] to-[#ff6b35]' },
  ];

  const featureCategories = [
    {
      category: 'AI-Powered Attendance',
      icon: Scan,
      gradient: 'from-[#6c5ce7] to-[#e84393]',
      features: [
        { icon: Camera, title: 'Face Recognition', desc: 'Millisecond facial detection with high precision.' },
        { icon: Users, title: 'Multi-Face Scanning', desc: 'Recognize multiple students at once in live gate flow.' },
        { icon: DoorOpen, title: 'Gate Mode', desc: 'Kiosk-ready scanning with stranger detection.' },
        { icon: Clock, title: 'Auto Cutoff Alerts', desc: 'Absence notifications sent after daily cutoff.' },
      ],
    },
    {
      category: 'Timetable & Teachers',
      icon: BookOpen,
      gradient: 'from-[#ff6b35] to-[#f7931e]',
      features: [
        { icon: CalendarDays, title: 'Smart Timetable', desc: 'Structured timetable management for all classes.' },
        { icon: UserCheck, title: 'Auto Substitution', desc: 'Automatic replacement when a teacher is absent.' },
        { icon: ClipboardList, title: 'Teacher Permissions', desc: 'Granular class-section access controls.' },
        { icon: FileText, title: 'Substitution Reports', desc: 'Printable and shareable daily reports.' },
      ],
    },
    {
      category: 'Student Management',
      icon: GraduationCap,
      gradient: 'from-[#e84393] to-[#6c5ce7]',
      features: [
        { icon: Layers, title: 'Class Structure', desc: 'Organize students by classes and sections.' },
        { icon: Fingerprint, title: 'Bulk Registration', desc: 'Import and register students at scale.' },
        { icon: Award, title: 'Gamification', desc: 'Badges, points, and class leaderboards.' },
        { icon: Heart, title: 'Wellness Scores', desc: 'Track punctuality and behavioral trends.' },
      ],
    },
    {
      category: 'Safety & Security',
      icon: Shield,
      gradient: 'from-[#f7931e] to-[#ff6b35]',
      features: [
        { icon: AlertTriangle, title: 'Emergency Alerts', desc: 'Instant lockdown and fire alerts.' },
        { icon: UserCheck, title: 'Visitor Management', desc: 'Visitor face verification and QR pass flow.' },
        { icon: MapPin, title: 'Zone Monitoring', desc: 'Track restricted areas with alerts.' },
        { icon: Lock, title: 'Stranger Detection', desc: 'Unknown face detection at entry points.' },
      ],
    },
    {
      category: 'Parent & Communication',
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
    'Swami Anant Vyas': swamiAnantVyasPhoto.url,
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

  if (liteMode) return <LiteHome />;

  return (
    <PageTransition>
      <PageLayout className="neon-liquid-bg overflow-hidden has-bottom-nav md:pb-0">
        
        {/* ========================================================================= */}
        {/* HERO SECTION — Optimized for Desktop & Mobile Balance                     */}
        {/* ========================================================================= */}
        <section className="pt-2 pb-10 sm:pb-14">
          <div className="grid grid-cols-12 gap-6 items-stretch">
            
            {/* Left Hero Main Card */}
            <RoyalReveal
              effect="fade-up"
              className="liquid-glass-surface liquid-glass-highlight col-span-12 lg:col-span-7 rounded-3xl p-6 sm:p-10 md:p-12 lg:p-14 border border-white/10 shadow-2xl backdrop-blur-2xl flex flex-col justify-between"
            >
              <div>
                {/* Collaboration & Active Status Badges */}
                <div className="flex flex-wrap items-center gap-2.5 mb-6">
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-primary backdrop-blur-md">
                    <Building2 className="h-3.5 w-3.5" />
                    PM Shri Kendriya Vidyalaya NFC Vigyan Vihar
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    AI Campus Active
                  </span>
                </div>

                {/* Hero Title */}
                <h1
                  className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.06] text-foreground tracking-tight"
                  style={{ fontFamily: 'Sora, sans-serif' }}
                >
                  Your School,
                  <br />
                  <span className="text-gradient-neon">
                    Fully Automated
                  </span>
                </h1>

                <p className="mt-6 max-w-xl text-base sm:text-lg md:text-xl leading-relaxed text-muted-foreground font-medium">
                  Face-recognition attendance, intelligent timetable substitution, kiosk security, parent portal & AI analytics — all in one unified, intelligent platform.
                </p>

                {/* Action CTAs */}
                <div className="mt-8 sm:mt-10 flex flex-wrap gap-4 items-center">
                  <Link to="/attendance">
                    <Button className="h-14 rounded-2xl bg-primary px-8 text-base font-bold text-primary-foreground shadow-xl shadow-primary/30 hover:bg-primary/90 btn-spring">
                      Launch Attendance <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link to="/parent">
                    <Button variant="outline" className="h-14 rounded-2xl border-border/70 bg-card/55 px-8 text-base font-bold text-foreground hover:bg-card/80 btn-spring">
                      Parent Portal
                    </Button>
                  </Link>
                  <Link to="/gate">
                    <Button variant="outline" className="h-14 rounded-2xl border-border/70 bg-card/55 px-6 text-base font-bold text-foreground hover:bg-card/80 btn-spring gap-2">
                      <DoorOpen className="h-5 w-5 text-warning" /> Gate Kiosk
                    </Button>
                  </Link>
                  <ThemeToggle className="h-14 w-14 rounded-2xl border-border/70 bg-card/55 hover:bg-card/80 btn-spring" />
                </div>
              </div>

              {/* Desktop Live Speed & Trust Bar */}
              <div className="mt-10 pt-6 border-t border-white/10 grid grid-cols-3 gap-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span className="text-xs font-semibold text-muted-foreground">99.9% Recognition</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Zap className="h-4 w-4 text-amber-400 shrink-0" />
                  <span className="text-xs font-semibold text-muted-foreground">&lt;120ms Fast Scan</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-xs font-semibold text-muted-foreground">Offline AI Sync</span>
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
                className="liquid-glass-surface rounded-3xl p-6 sm:p-7 border border-white/10 shadow-2xl backdrop-blur-2xl flex-1 flex flex-col justify-between"
              >
                <div>
                  <div className="mb-5 flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2">
                      <Cpu className="h-3.5 w-3.5 text-primary" /> System Modules
                    </span>
                    <div className="flex gap-1.5 items-center">
                      <span className="text-[10px] font-bold text-emerald-400 font-mono">LIVE</span>
                      <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)] animate-pulse" />
                    </div>
                  </div>

                  <RoyalStaggerGroup className="grid grid-cols-3 gap-3" stagger={0.05}>
                    {modules.map((mod) => (
                      <RoyalStaggerItem key={mod.label}>
                        <motion.button
                          type="button"
                          onClick={() => navigate(mod.to)}
                          aria-label={`Open ${mod.label}`}
                          className="w-full rounded-2xl border border-border/60 bg-card/55 p-3.5 text-center transition-all hover:border-primary/50 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 card-hover-pop btn-spring"
                          whileHover={{ y: -3 }}
                          whileTap={{ scale: 0.97 }}
                          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <div className={`mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl ${mod.tone}`}>
                            <mod.icon className="h-4 w-4" />
                          </div>
                          <p className="text-[10px] font-bold uppercase tracking-tight text-foreground truncate">{mod.label}</p>
                        </motion.button>
                      </RoyalStaggerItem>
                    ))}
                  </RoyalStaggerGroup>
                </div>

                <p className="mt-5 text-center text-[10px] font-black tracking-widest text-primary uppercase">
                  All Systems Fully Operational
                </p>
              </RoyalReveal>

            </div>

          </div>
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
                <button
                  type="button"
                  onClick={() => creatorMembers[0] && setActiveProfile(creatorMembers[0])}
                  className="relative block w-full h-full text-left"
                  aria-label="Open Team RCA portfolio"
                >
                  <div className="relative min-h-[300px] h-full w-full overflow-hidden">
                    <img
                      src={(teamRcaPhoto as any)?.url || (typeof teamRcaPhoto === 'string' ? teamRcaPhoto : '/team-rca.jpg')}
                      alt="Team RCA — Presences AI creators"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                      loading="lazy"
                    />
                    <div className="pointer-events-none absolute -inset-8 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.28),transparent_55%)]" />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/55 to-transparent" />

                    {/* Top badge */}
                    <div className="absolute left-6 top-6 flex items-center gap-2 rounded-full border border-amber-300/40 bg-black/60 px-3.5 py-1.5 backdrop-blur-md">
                      <span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
                      <span className="text-xs font-black uppercase tracking-[0.22em] text-amber-200">Team RCA</span>
                    </div>

                    {/* Bottom title lockup */}
                    <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
                      <p className="text-xs font-black uppercase tracking-[0.32em] text-amber-200/90">Presences · AI Architecture</p>
                      <h2
                        className="mt-1.5 bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 bg-clip-text text-3xl md:text-4xl font-black leading-tight text-transparent"
                        style={{ fontFamily: 'Sora, sans-serif' }}
                      >
                        Built by Team RCA
                      </h2>
                      <p className="mt-2 text-xs md:text-sm font-semibold uppercase tracking-[0.18em] text-white/80">
                        Together in mind · United in purpose
                      </p>
                    </div>
                  </div>
                </button>
              </motion.div>

              {/* Right: Team Leadership & Members Grid */}
              <div className="lg:col-span-6 flex flex-col justify-between gap-3 bg-card/60 p-6 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-2xl">
                <div>
                  <div className="flex items-center justify-between pb-3 mb-2 border-b border-border/40">
                    <span className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-300" /> Creators & Core Architects
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate('/portfolio')}
                      className="text-xs font-bold text-amber-300 hover:text-amber-200 hover:bg-amber-300/10 rounded-xl"
                    >
                      View Studio <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Lead Creator Spotlight Card */}
                  <button
                    type="button"
                    onClick={() => creatorMembers[0] && setActiveProfile(creatorMembers[0])}
                    className="flex w-full items-center justify-between gap-4 rounded-2xl border border-amber-300/30 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent p-4 text-left transition-all hover:border-amber-300/60 hover:shadow-lg hover:shadow-amber-500/5 mb-3"
                  >
                    <div className="flex items-center gap-3.5">
                      <img
                        src={portfolio.profileImage || creatorMembers[0]?.image || gauravPhoto}
                        alt={creatorMembers[0]?.name || 'Gaurav'}
                        className="h-12 w-12 rounded-2xl border-2 border-amber-300/50 object-cover shadow-md"
                        loading="lazy"
                      />
                      <div>
                        <span className="inline-block text-[9px] font-black uppercase tracking-[0.2em] text-amber-300">Lead · Architect</span>
                        <p className="text-base font-extrabold text-foreground">{creatorMembers[0]?.name || 'Gaurav'}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{creatorMembers[0]?.role || 'Full-Stack & AI Engineer'}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-amber-300 shrink-0" />
                  </button>

                  {/* Team Members List Header & Swap Button */}
                  <div className="flex items-center justify-between mt-3 mb-2 px-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Core Members
                    </span>
                    {displayedTeamMembers.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSwapTeamMembers}
                        className="h-6 px-2.5 text-[11px] font-semibold text-primary hover:text-primary hover:bg-primary/10 rounded-lg gap-1.5 transition-all active:scale-95 border border-primary/20 bg-primary/5 shadow-sm"
                        title="Click to swap members"
                      >
                        <motion.div
                          animate={{ rotate: isSwapped ? 180 : 0 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                        >
                          <ArrowLeftRight className="h-3 w-3 text-primary" />
                        </motion.div>
                        <span>Click to Swap</span>
                      </Button>
                    )}
                  </div>

                  {/* Team Members List */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 relative">
                    {displayedTeamMembers.map((member) => (
                      <motion.button
                        layout
                        key={member.name}
                        type="button"
                        onClick={() => setActiveProfile(member)}
                        transition={{ type: 'spring', stiffness: 450, damping: 30, mass: 0.6 }}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/50 p-3 text-left transition-all hover:border-amber-300/50 hover:bg-card/80 group"
                        aria-label={`Open ${member.name} profile`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <MemberAvatar
                            name={member.name}
                            image={member.image}
                            className="h-9 w-9 rounded-xl border border-border/70 shrink-0 group-hover:scale-105 transition-transform"
                            fallbackClassName="text-xs font-bold"
                          />
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Team Member</p>
                            <p className="text-xs font-bold text-foreground truncate">{member.name}</p>
                          </div>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 group-hover:text-amber-300 group-hover:translate-x-0.5 transition-all" />
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Presences AI Engine</span>
                  <span className="font-mono text-primary font-bold">KV NFC Vigyan Vihar</span>
                </div>
              </div>

            </div>
          </RoyalReveal>
        </section>

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
                <div className="liquid-glass-surface rounded-3xl p-6 text-center card-hover-pop transition-transform duration-300 hover:-translate-y-1.5 border border-white/10 shadow-xl backdrop-blur-2xl">
                  <p className="text-gradient-neon text-3xl md:text-5xl font-black" style={{ fontFamily: 'Sora, sans-serif' }}>
                    {stat.value}
                  </p>
                  <p className="mt-2 text-xs md:text-sm font-bold text-muted-foreground">{stat.label}</p>
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
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-foreground tracking-tight" style={{ fontFamily: 'Sora, sans-serif' }}>
                {cat.category}
              </h2>
            </div>
            <RoyalStaggerGroup className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6" stagger={0.05}>
              {cat.features.map((feature) => (
                <RoyalStaggerItem key={feature.title}>
                  <div className="liquid-glass-surface liquid-glass-highlight group relative overflow-hidden rounded-3xl p-6 h-full transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-primary/15 border border-white/10 flex flex-col justify-between">
                    <div>
                      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-primary via-accent to-warning" />
                      <div className="mb-4 inline-flex rounded-2xl bg-primary/15 p-3 text-primary">
                        <feature.icon className="h-5 w-5" />
                      </div>
                      <h3 className="text-base font-bold text-foreground">{feature.title}</h3>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{feature.desc}</p>
                    </div>
                  </div>
                </RoyalStaggerItem>
              ))}
            </RoyalStaggerGroup>
          </RoyalReveal>
        ))}

        {/* ========================================================================= */}
        {/* DEVELOPER PORTFOLIO SHOWCASE                                              */}
        {/* ========================================================================= */}
        <RoyalReveal effect="fade-up" className="pb-14 min-w-0">
          <section id="developer-portfolio">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
                  <Sparkles className="h-3 w-3" /> Meet the Developer
                </p>
                <h2
                  className="mt-2 text-3xl font-black text-foreground md:text-4xl"
                  style={{ fontFamily: 'Sora, sans-serif' }}
                >
                  {portfolio.name || 'Gaurav Raj'}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground md:text-base">
                  {portfolio.role || 'Developer & Team Leader'}
                </p>
              </div>
            </div>
            <PublicPortfolioView data={portfolio} onUnlock={() => navigate('/portfolio')} />
          </section>
        </RoyalReveal>

        {/* ========================================================================= */}
        {/* BOTTOM CTA BANNER                                                         */}
        {/* ========================================================================= */}
        <RoyalReveal effect="card-lift" className="pb-10">
          <section>
            <div className="liquid-glass-surface relative overflow-hidden rounded-3xl p-8 sm:p-12 md:p-16 border border-white/15 shadow-2xl backdrop-blur-2xl text-center">
              <div className="relative z-10 max-w-3xl mx-auto">
                <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/15 px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary">
                  <Smartphone className="h-4 w-4" /> Smart School Platform
                </p>
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-foreground tracking-tight" style={{ fontFamily: 'Sora, sans-serif' }}>
                  Ready to Automate Your School?
                </h2>
                <p className="mx-auto mt-4 text-sm sm:text-base md:text-lg text-muted-foreground leading-relaxed">
                  Attendance, timetable substitution, kiosk security, communication and analytics in one bright, powerful system.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
                  <Link to="/signup">
                    <Button className="h-14 rounded-2xl bg-primary px-8 text-base font-bold text-primary-foreground shadow-xl shadow-primary/25 hover:bg-primary/90 btn-spring">
                      Get Started — It's Free <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link to="/contact">
                    <Button variant="outline" className="h-14 rounded-2xl border-border/70 bg-card/55 px-8 text-base font-bold text-foreground hover:bg-card/80 btn-spring">
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
          <DialogContent className="max-w-md rounded-3xl border border-border/70 bg-card/95 p-0 backdrop-blur-xl">
            {activeProfile && (
              <div className="p-6">
                <DialogHeader className="space-y-3 text-left">
                  <div className="flex items-center gap-3">
                    <MemberAvatar
                      name={activeProfile.name}
                      image={activeProfile.image}
                      className="h-16 w-16 rounded-2xl border border-border/60"
                      fallbackClassName="text-lg"
                    />

                    <div>
                      <DialogTitle className="text-xl font-bold">{activeProfile.name}</DialogTitle>
                      <p className="text-sm text-muted-foreground">{activeProfile.role}</p>
                    </div>
                  </div>
                  <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
                    {activeProfile.bio}
                  </DialogDescription>
                  {activeProfile.details ? (
                    <p className="text-xs leading-relaxed text-muted-foreground">{activeProfile.details}</p>
                  ) : null}
                  {activeProfile.name === 'Gaurav' ? (
                    <Link
                      to="/portfolio"
                      className="inline-flex w-fit items-center gap-2 rounded-xl border border-border/60 bg-card/55 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-card"
                    >
                      Open secure portfolio
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
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
