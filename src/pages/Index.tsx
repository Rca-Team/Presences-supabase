import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import LiteHome from '@/components/lite/LiteHome';
import gauravPhoto from '@/assets/gaurav-photo.png';
import swamiAnantVyasPhoto from '@/assets/swami-anant-vyas.png.asset.json';
import teamRcaPhoto from '@/assets/team-rca.jpg.asset.json';
import { usePortfolioData } from '@/hooks/usePortfolioData';
import { PublicPortfolioView } from '@/pages/Portfolio';
import { MemberAvatar } from '@/components/portfolio/MemberAvatar';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { motion } from 'framer-motion';
import PageLayout from '@/components/layouts/PageLayout';
import PageTransition from '@/components/PageTransition';
import HomeInstallCard from '@/components/HomeInstallCard';
import NeuralOrbPanel from '@/components/home/NeuralOrbPanel';
import {
  ArrowRight,
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
} from 'lucide-react';

// Professional, restrained card motion: a calm lift instead of a 3D tilt.
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
  const navigate = useNavigate();

  // Fallback (used until portfolio JSON loads, or if a member has no image)
  const fallbackImages: Record<string, string> = {
    Gaurav: gauravPhoto,
    'Gaurav Raj': gauravPhoto,
    'Swami Anant Vyas': swamiAnantVyasPhoto.url,
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


  if (liteMode) return <LiteHome />;

  return (
    <PageTransition>
      <PageLayout className="neon-liquid-bg overflow-hidden has-bottom-nav md:pb-0">
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute top-1/4 -left-24 h-80 w-80 rounded-full bg-primary/30 blur-[110px]" />
          <div className="absolute bottom-1/4 -right-20 h-80 w-80 rounded-full bg-accent/25 blur-[110px]" />
          <div className="absolute left-1/2 top-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-warning/20 blur-[160px]" />
        </div>

        <section className="pt-2 pb-10 sm:pb-14">
          <div className="grid grid-cols-12 gap-6">
            <motion.div
              className="liquid-glass-surface liquid-glass-highlight col-span-12 rounded-3xl p-8 md:p-14 lg:col-span-7"
              {...cardTilt}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/55 px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-primary">
                <Sparkles className="h-3.5 w-3.5" /> Complete School Automation
              </div>

              <h1
                className="mt-6 text-5xl font-extrabold leading-[1.05] text-foreground md:text-7xl"
                style={{ fontFamily: 'Sora, sans-serif' }}
              >
                Your School,
                <br />
                <span className="text-gradient-neon">
                  Fully Automated
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">
                Face-recognition attendance, timetable, gate security, parent portal & AI analytics — one platform.
              </p>

              <div className="mt-10 flex flex-wrap gap-4">
                <Link to="/signup">
                  <Button className="h-14 rounded-2xl bg-primary px-8 text-base font-bold text-primary-foreground shadow-xl shadow-primary/30 hover:bg-primary/90">
                    Get Started Free <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/parent">
                  <Button variant="outline" className="h-14 rounded-2xl border-border/70 bg-card/55 px-8 text-base font-bold text-foreground hover:bg-card/80">
                    Parent Portal
                  </Button>
                </Link>
                <ThemeToggle className="h-14 w-14 rounded-2xl border-border/70 bg-card/55 hover:bg-card/80" />
              </div>
            </motion.div>

            <div className="col-span-12 grid grid-cols-2 gap-6 lg:col-span-5 lg:grid-rows-2">
              <motion.div
                className="liquid-glass-surface col-span-2 rounded-3xl p-8"
                {...cardTilt}
              >
                <div className="mb-8 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">System Modules</span>
                  <div className="flex gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-warning/70" />
                    <div className="h-2 w-2 rounded-full bg-accent/70" />
                    <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.9)]" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {modules.map((mod) => (
                    <motion.button
                      key={mod.label}
                      type="button"
                      onClick={() => navigate(mod.to)}
                      aria-label={`Open ${mod.label}`}
                      className="rounded-2xl border border-border/60 bg-card/55 p-4 text-center transition-colors hover:border-primary/50 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      whileHover={{ y: -3 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <div className={`mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl ${mod.tone}`}>
                        <mod.icon className="h-5 w-5" />
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">{mod.label}</p>
                    </motion.button>
                  ))}
                </div>

                <p className="mt-8 text-center text-xs font-bold tracking-widest text-primary">ALL SYSTEMS OPERATIONAL</p>
              </motion.div>

              <motion.div className="col-span-2" {...cardTilt}>
                <NeuralOrbPanel />
              </motion.div>


              <motion.div
                className="group relative overflow-hidden rounded-3xl p-0"
                {...cardTilt}
              >
                {/* Cinematic team photo */}
                <button
                  type="button"
                  onClick={() => creatorMembers[0] && setActiveProfile(creatorMembers[0])}
                  className="relative block w-full text-left"
                  aria-label="Open Team RCA portfolio"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden">
                    <img
                      src={teamRcaPhoto.url}
                      alt="Team RCA — Presences AI creators"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                      loading="lazy"
                    />
                    {/* Golden glow accents */}
                    <div className="pointer-events-none absolute -inset-8 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.28),transparent_55%)]" />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/55 to-transparent" />

                    {/* Top badge */}
                    <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-amber-300/40 bg-black/50 px-3 py-1.5 backdrop-blur-md">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
                      <span className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-200">Team RCA</span>
                    </div>

                    {/* Bottom title lockup */}
                    <div className="absolute inset-x-0 bottom-0 p-5">
                      <p className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-200/90">Presences · AI</p>
                      <p
                        className="mt-1 bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 bg-clip-text text-2xl font-black leading-none text-transparent"
                        style={{ fontFamily: 'Sora, sans-serif' }}
                      >
                        Built by Team RCA
                      </p>
                      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                        Together in mind · United in purpose
                      </p>
                    </div>
                  </div>
                </button>

                {/* Members strip */}
                <div className="space-y-2 bg-card/60 p-4 backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={() => creatorMembers[0] && setActiveProfile(creatorMembers[0])}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-amber-300/25 bg-gradient-to-r from-amber-500/10 via-transparent to-transparent px-3 py-2.5 text-left transition-colors hover:border-amber-300/60"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={portfolio.profileImage || creatorMembers[0]?.image || gauravPhoto}
                        alt={creatorMembers[0]?.name || 'Gaurav'}
                        className="h-9 w-9 rounded-full border border-amber-300/40 object-cover"
                        loading="lazy"
                      />
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-300/90">Lead · Creator</p>
                        <p className="text-sm font-bold text-foreground">{creatorMembers[0]?.name || 'Gaurav'}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-amber-300/80" />
                  </button>

                  {creatorMembers.slice(1).map((member) => (
                    <button
                      key={member.name}
                      type="button"
                      onClick={() => setActiveProfile(member)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/40 bg-card/45 px-3 py-2 text-left transition-colors hover:border-amber-300/40"
                      aria-label={`Open ${member.name} profile`}
                    >
                      <div className="flex items-center gap-3">
                        <MemberAvatar
                          name={member.name}
                          image={member.image}
                          className="h-8 w-8 rounded-full border border-border/60"
                          fallbackClassName="text-[10px]"
                        />
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Team Member</p>
                          <p className="text-sm font-semibold text-foreground">{member.name}</p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>

                {/* Framing border */}
                <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-amber-300/20" />
              </motion.div>
            </div>
          </div>
        </section>

        <HomeInstallCard />

        <section className="pb-14">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
            {stats.map((stat) => (
              <motion.div
                key={stat.label}
                  className="liquid-glass-surface rounded-2xl p-5 text-center"
                {...cardTilt}
              >
                  <p className="text-gradient-neon text-3xl font-black md:text-5xl" style={{ fontFamily: 'Sora, sans-serif' }}>
                  {stat.value}
                </p>
                  <p className="mt-2 text-xs font-semibold text-muted-foreground md:text-sm">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {featureCategories.map((cat) => (
          <section key={cat.category} className="pb-14">
            <div className="mb-6 flex items-center gap-3">
              <div className="inline-flex rounded-2xl bg-primary/15 p-3 text-primary">
                <cat.icon className="h-5 w-5" />
              </div>
              <h2 className="text-3xl font-bold text-foreground md:text-4xl" style={{ fontFamily: 'Sora, sans-serif' }}>{cat.category}</h2>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
              {cat.features.map((feature) => (
                <motion.div
                  key={feature.title}
                  className="liquid-glass-surface liquid-glass-highlight group relative overflow-hidden rounded-2xl p-5"
                    whileHover={{ y: -4 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-primary via-accent to-warning" />
                  <div className="mb-4 inline-flex rounded-2xl bg-primary/15 p-3 text-primary">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground md:text-base">{feature.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground md:text-sm">{feature.desc}</p>
                </motion.div>
              ))}
            </div>
          </section>
        ))}

        {/* Full developer portfolio — profile, projects, gallery, achievements, skills, socials */}
        <section id="developer-portfolio" className="pb-14 min-w-0">
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



        <section className="pb-10">
          <motion.div
            className="liquid-glass-surface relative overflow-hidden rounded-3xl p-8 md:p-14"
            {...cardTilt}
          >
            <div className="relative z-10 text-center">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/15 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary">
                <Smartphone className="h-4 w-4" /> Smart School Platform
              </p>
              <h2 className="text-3xl font-black text-foreground md:text-5xl" style={{ fontFamily: 'Sora, sans-serif' }}>Ready to Automate Your School?</h2>
              <p className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground md:text-lg">
                Attendance, timetable, security, communication and analytics in one bright, powerful system.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link to="/signup">
                  <Button className="h-14 rounded-2xl bg-primary px-8 text-base font-bold text-primary-foreground hover:bg-primary/90">
                    Get Started — It's Free <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/contact">
                  <Button variant="outline" className="h-14 rounded-2xl border-border/70 bg-card/55 px-8 text-base font-bold text-foreground hover:bg-card/80">
                    Contact Us
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        </section>

        <Dialog open={Boolean(activeProfile)} onOpenChange={(open) => !open && setActiveProfile(null)}>
          <DialogContent className="max-w-md rounded-2xl border-border/70 bg-card/95 p-0 backdrop-blur-xl">
            {activeProfile && (
              <div className="p-6">
                <DialogHeader className="space-y-3 text-left">
                  <div className="flex items-center gap-3">
                    <MemberAvatar
                      name={activeProfile.name}
                      image={activeProfile.image}
                      className="h-16 w-16 rounded-xl border border-border/60"
                      fallbackClassName="text-lg"
                    />

                    <div>
                      <DialogTitle className="text-xl">{activeProfile.name}</DialogTitle>
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
                      className="inline-flex w-fit items-center gap-2 rounded-lg border border-border/60 bg-card/55 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-card"
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
