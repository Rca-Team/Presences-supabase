import React, { useEffect, useMemo, useState } from 'react';
import PageLayout from '@/components/layouts/PageLayout';
import PageTransition from '@/components/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lock,
  Unlock,
  Delete,
  Save,
  Plus,
  Trophy,
  ExternalLink,
  Github,
  Linkedin,
  Twitter,
  Instagram,
  Youtube,
  Trash2,
  GripVertical,
  Sparkles,
  MapPin,
  Mail,
  Phone,
  Globe,
  RotateCcw,
  Eye,
  Edit3,
  Users,
  Briefcase,
  Image as ImageIcon,
  CheckCircle2,
  ArrowRight,
  UserCheck,
  SlidersHorizontal,
  LayoutGrid,
} from 'lucide-react';
import {
  DEFAULT_PORTFOLIO,
  PORTFOLIO_KEY,
  type PortfolioData,
  type PortfolioProject,
  type PortfolioMember,
  type PortfolioGalleryItem,
  migratePortfolioData,
  portfolioUid,
} from '@/hooks/usePortfolioData';
import { ImageDropzone } from '@/components/portfolio/ImageDropzone';
import { BatchGalleryUploader } from '@/components/portfolio/BatchGalleryUploader';
import { HomeGallery } from '@/components/portfolio/HomeGallery';
import { MemberAvatar } from '@/components/portfolio/MemberAvatar';
import { savePortfolioToIndexedDb, getPortfolioFromIndexedDb } from '@/utils/portfolioCacheDb';
import { uploadPortfolioImage } from '@/utils/portfolioUploadHelper';
import teamRcaPhoto from '@/assets/team-rca.jpg';
import gauravPhoto from '@/assets/gaurav-photo.png';
import swamiAnantVyasPhoto from '@/assets/swami-anant-vyas.png';
import jatinDhamaPhoto from '@/assets/jatin-dhama.jpg';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const ACCESS_PIN = '2022';

/* ------------------------------------------------------------------ */
/* Sortable wrapper                                                    */
/* ------------------------------------------------------------------ */

function SortableItem({ id, children }: { id: string; children: (handle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const handle = (
    <button
      type="button"
      className="cursor-grab touch-none rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
      aria-label="Drag to reorder"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
  return (
    <div ref={setNodeRef} style={style}>
      {children(handle)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Public View Component                                              */
/* ------------------------------------------------------------------ */

export function PublicPortfolioView({
  data,
  onUnlock,
  showGallery = true,
  showProjects = true,
  showAchievements = true,
}: {
  data: PortfolioData;
  onUnlock?: () => void;
  showGallery?: boolean;
  showProjects?: boolean;
  showAchievements?: boolean;
}) {
  const [selectedMember, setSelectedMember] = useState<PortfolioMember | null>(null);

  return (
    <section className="space-y-10 md:space-y-14 pb-12 md:pb-16 min-w-0">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-card/60 backdrop-blur-2xl shadow-2xl">
        {/* Cover Photo */}
        <div
          className="h-44 sm:h-56 md:h-72 w-full bg-gradient-to-br from-primary/35 via-accent/25 to-primary/10 relative overflow-hidden"
          style={data.coverImage ? { backgroundImage: `url(${data.coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/25 to-transparent" />
        </div>

        <div className="px-5 sm:px-8 md:px-12 pb-6 md:pb-8 relative">
          <div className="-mt-16 sm:-mt-20 md:-mt-24 flex flex-col md:flex-row md:items-end justify-between gap-5">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
              <div className="relative group">
                <div className="p-1 rounded-3xl bg-gradient-to-tr from-cyan-400 via-primary to-purple-500 shadow-xl shadow-primary/25 transition-transform duration-300 group-hover:scale-105">
                  <img
                    src={data.profileImage || gauravPhoto}
                    alt={data.name}
                    className="h-28 w-28 sm:h-36 sm:w-36 md:h-44 md:w-44 rounded-[22px] border-2 border-background object-cover shadow-2xl bg-card"
                    loading="lazy"
                  />
                </div>
                <span className="absolute bottom-2 right-2 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-background" />
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
                  <Sparkles className="h-3.5 w-3.5" /> {data.settings?.customBadge || 'Core Team Lead'}
                </div>
                <h1 className="mt-2 text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>
                  {data.name}
                </h1>
                <p className="text-sm md:text-base font-semibold text-primary/90 mt-1">{data.role}</p>
                {data.tagline && (
                  <p className="mt-2 text-sm md:text-base text-muted-foreground max-w-2xl leading-relaxed">
                    {data.tagline}
                  </p>
                )}
              </div>
            </div>

            {/* Social Links & Edit Button */}
            <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0">
              {data.socials?.github && (
                <a
                  href={data.socials.github}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-border/70 bg-card/60 p-2.5 hover:bg-muted hover:text-primary transition shadow-sm"
                  title="GitHub Profile"
                >
                  <Github className="h-4 w-4" />
                </a>
              )}
              {data.socials?.linkedin && (
                <a
                  href={data.socials.linkedin}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-border/70 bg-card/60 p-2.5 hover:bg-muted hover:text-primary transition shadow-sm"
                  title="LinkedIn Profile"
                >
                  <Linkedin className="h-4 w-4" />
                </a>
              )}
              {data.socials?.twitter && (
                <a
                  href={data.socials.twitter}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-border/70 bg-card/60 p-2.5 hover:bg-muted hover:text-primary transition shadow-sm"
                  title="Twitter / X"
                >
                  <Twitter className="h-4 w-4" />
                </a>
              )}
              {data.socials?.instagram && (
                <a
                  href={data.socials.instagram}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-border/70 bg-card/60 p-2.5 hover:bg-muted hover:text-primary transition shadow-sm"
                  title="Instagram"
                >
                  <Instagram className="h-4 w-4" />
                </a>
              )}
              {data.socials?.youtube && (
                <a
                  href={data.socials.youtube}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-border/70 bg-card/60 p-2.5 hover:bg-muted hover:text-primary transition shadow-sm"
                  title="YouTube Channel"
                >
                  <Youtube className="h-4 w-4" />
                </a>
              )}
              {onUnlock && (
                <Button size="sm" variant="outline" onClick={onUnlock} className="rounded-xl gap-1.5 font-semibold">
                  <Lock className="h-3.5 w-3.5" /> Studio Editor
                </Button>
              )}
            </div>
          </div>

          {/* Contact & Meta Strip */}
          <div className="mt-6 pt-5 border-t border-border/60 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs font-medium">
            {data.location && (
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 min-w-0">
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate">{data.location}</span>
              </div>
            )}
            {data.email && (
              <a href={`mailto:${data.email}`} className="flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-foreground min-w-0 transition">
                <Mail className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate">{data.email}</span>
              </a>
            )}
            {data.phone && (
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 min-w-0">
                <Phone className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate">{data.phone}</span>
              </div>
            )}
            {data.website && (
              <a href={data.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-foreground min-w-0 transition">
                <Globe className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate">{data.website.replace(/^https?:\/\//, '')}</span>
              </a>
            )}
          </div>

          {data.bio && (
            <p className="mt-5 max-w-3xl text-sm md:text-base text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
              {data.bio}
            </p>
          )}
        </div>
      </div>

      {/* Featured Projects */}
      {showProjects && data.projects.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl md:text-2xl font-extrabold text-foreground flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" /> Featured Projects
            </h2>
            <span className="text-xs text-muted-foreground font-semibold">{data.projects.length} Projects</span>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.projects.map((p) => (
              <motion.article
                key={p.id}
                whileHover={{ y: -4 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-card/70 backdrop-blur shadow-md flex flex-col justify-between"
              >
                <div className="relative aspect-video overflow-hidden bg-muted/40 group-hover:shadow-lg transition-shadow">
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.title}
                      className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Sparkles className="h-8 w-8 opacity-40" />
                    </div>
                  )}
                  {/* Hover Light Sheen */}
                  <div className="pointer-events-none absolute -inset-full bg-gradient-to-r from-transparent via-white/20 to-transparent -rotate-45 translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out" />
                  {p.year && (
                    <span className="absolute right-3 top-3 rounded-full border border-white/20 bg-background/90 px-2.5 py-0.5 text-[10px] font-bold text-foreground shadow-sm backdrop-blur-md">
                      {p.year}
                    </span>
                  )}
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                      {p.title}
                    </h3>
                    <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                      {p.description}
                    </p>

                    {(p.tags && p.tags.length > 0) || p.stack ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {(p.tags && p.tags.length > 0 ? p.tags : p.stack.split(',').map((s) => s.trim()).filter(Boolean)).map((t) => (
                          <span key={t} className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-5 pt-3 border-t border-border/40 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {p.link && (
                        <a href={p.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                          <ExternalLink className="h-3.5 w-3.5" /> Live Demo
                        </a>
                      )}
                      {p.githubUrl && (
                        <a href={p.githubUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
                          <Github className="h-3.5 w-3.5" /> Code
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      )}

      {/* Team RCA Creators Section */}
      {data.members.length > 0 && (
        <div className="space-y-5">
          {/* Team Header Banner */}
          <div className="relative overflow-hidden rounded-3xl border border-amber-300/30 bg-card/60 shadow-xl backdrop-blur-xl">
            <div className="relative h-48 sm:h-64 md:h-80 w-full overflow-hidden">
              <img
                src={teamRcaPhoto}
                alt="Team RCA Creators"
                className="h-full w-full object-cover object-center"
                loading="lazy"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
              <div className="absolute left-4 bottom-4 sm:left-6 sm:bottom-6">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-black/60 px-3 py-1 text-xs font-black uppercase tracking-widest text-amber-300 backdrop-blur-md">
                  <Sparkles className="h-3 w-3" /> Team RCA Core
                </span>
                <h2 className="mt-1.5 text-xl sm:text-2xl md:text-3xl font-extrabold text-white" style={{ fontFamily: 'Sora, sans-serif' }}>
                  The Minds Behind Presences AI
                </h2>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-lg md:text-xl font-bold text-foreground flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Core Architects & Contributors
            </h3>
            <span className="text-xs text-muted-foreground font-semibold">{data.members.length} Members</span>
          </div>

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {data.members.map((m) => (
              <motion.div
                key={m.id}
                whileHover={{ y: -3 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                onClick={() => setSelectedMember(m)}
                className="group relative cursor-pointer rounded-3xl border border-border/60 bg-card/60 p-4 backdrop-blur shadow-sm hover:border-primary/50 hover:bg-card/85 transition-all flex flex-col justify-between"
              >
                <div className="flex items-center gap-3.5">
                  <MemberAvatar
                    name={m.name}
                    image={m.image}
                    className="h-14 w-14 rounded-2xl border-2 border-border/70 group-hover:border-primary shrink-0 transition-colors shadow-md"
                    fallbackClassName="text-lg font-bold"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-foreground group-hover:text-primary transition-colors">
                      {m.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground font-medium">{m.role}</p>
                  </div>
                </div>

                {m.bio && (
                  <p className="mt-3 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {m.bio}
                  </p>
                )}

                <div className="mt-3 pt-2.5 border-t border-border/30 flex items-center justify-between text-[11px] text-primary font-bold">
                  <span>View Details</span>
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Achievements + Skills Matrix */}
      {showAchievements && (data.achievements.length > 0 || data.skills.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">
          {data.achievements.length > 0 && (
            <Card className="rounded-3xl border-border/80 dark:border-white/10 bg-white/85 dark:bg-card/60 shadow-lg backdrop-blur">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base md:text-lg font-bold text-slate-900 dark:text-foreground">
                  <Trophy className="h-5 w-5 text-amber-500 dark:text-amber-400" /> Key Milestones & Achievements
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5 text-sm">
                  {data.achievements.map((a, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span className="text-slate-700 dark:text-slate-300 font-medium">{a}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {data.skills.length > 0 && (
            <Card className="rounded-3xl border-border/80 dark:border-white/10 bg-white/85 dark:bg-card/60 shadow-lg backdrop-blur">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base md:text-lg font-bold text-slate-900 dark:text-foreground">
                  <Sparkles className="h-5 w-5 text-primary" /> Technical Core & Capabilities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {data.skills.map((s) => (
                    <span key={s} className="rounded-full bg-primary/10 border border-primary/25 px-3.5 py-1 text-xs font-bold text-primary shadow-xs">
                      {s}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Rebuilt Interactive Media & Campus Gallery Section */}
      {showGallery && data.gallery.length > 0 && (
        <HomeGallery
          items={data.gallery}
          defaultLayout={data.settings?.homeGalleryLayout || 'bento'}
          allowManage={Boolean(onUnlock)}
        />
      )}

      {/* Member Detail Dialog */}
      <Dialog open={!!selectedMember} onOpenChange={(open) => !open && setSelectedMember(null)}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          {selectedMember && (
            <div>
              <div className="flex items-center gap-4 mb-4">
                <MemberAvatar
                  name={selectedMember.name}
                  image={selectedMember.image}
                  className="h-16 w-16 rounded-2xl border-2 border-primary shadow-lg"
                  fallbackClassName="text-xl font-bold"
                />
                <div>
                  <h3 className="text-lg font-extrabold text-foreground">{selectedMember.name}</h3>
                  <p className="text-xs font-semibold text-primary">{selectedMember.role}</p>
                </div>
              </div>

              {selectedMember.bio && (
                <div className="space-y-1.5 mb-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Overview</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{selectedMember.bio}</p>
                </div>
              )}

              {selectedMember.details && (
                <div className="space-y-1.5 mb-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Contributions</p>
                  <p className="text-sm text-foreground/90 leading-relaxed bg-muted/30 p-3 rounded-xl border border-border/50">
                    {selectedMember.details}
                  </p>
                </div>
              )}

              <div className="pt-3 border-t flex justify-end">
                <Button size="sm" onClick={() => setSelectedMember(null)} className="rounded-xl">
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Main Studio Component (PIN Lock + Studio Customizer)               */
/* ------------------------------------------------------------------ */

const Portfolio = () => {
  const { toast } = useToast();
  const [pinDigits, setPinDigits] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<PortfolioData>(DEFAULT_PORTFOLIO);
  const [dirty, setDirty] = useState(false);
  const [studioViewMode, setStudioViewMode] = useState<'editor' | 'preview'>('editor');

  const maskedPin = useMemo(() => '●'.repeat(pinDigits.length), [pinDigits]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = async () => {
    setLoading(true);
    // 1. Try local IndexedDB / localStorage cache for immediate display
    try {
      const dbCached = await getPortfolioFromIndexedDb();
      if (dbCached) {
        setData(migratePortfolioData(dbCached));
      } else {
        const cached = localStorage.getItem('gaurav_portfolio_cache');
        if (cached) setData(migratePortfolioData(JSON.parse(cached)));
      }
    } catch {
      /* ignore */
    }

    try {
      const { data: row, error } = await supabase
        .from('attendance_settings')
        .select('value')
        .eq('key', PORTFOLIO_KEY)
        .maybeSingle();

      if (row?.value) {
        try {
          const parsed = migratePortfolioData(JSON.parse(row.value));
          setData(parsed);
          await savePortfolioToIndexedDb(parsed);
          try {
            localStorage.setItem('gaurav_portfolio_cache', JSON.stringify(parsed));
          } catch {
            /* localStorage quota fallback handled by IndexedDB */
          }
        } catch {
          /* keep current */
        }
      }
    } catch (e) {
      console.warn('Could not load portfolio from cloud, using local cache:', e);
    } finally {
      setDirty(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const update = (patch: Partial<PortfolioData>) => {
    setData((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const sanitizePortfolioImages = async (current: PortfolioData): Promise<PortfolioData> => {
    const next = { ...current };

    // 1. Convert profile image
    if (next.profileImage && next.profileImage.startsWith('data:image/')) {
      next.profileImage = await uploadPortfolioImage(next.profileImage);
    }

    // 2. Convert cover image
    if (next.coverImage && next.coverImage.startsWith('data:image/')) {
      next.coverImage = await uploadPortfolioImage(next.coverImage);
    }

    // 3. Convert projects images
    if (Array.isArray(next.projects)) {
      next.projects = await Promise.all(
        next.projects.map(async (p) => {
          if (p.image && p.image.startsWith('data:image/')) {
            const cleanUrl = await uploadPortfolioImage(p.image);
            return { ...p, image: cleanUrl };
          }
          return p;
        }),
      );
    }

    // 4. Convert member images
    if (Array.isArray(next.members)) {
      next.members = await Promise.all(
        next.members.map(async (m) => {
          if (m.image && m.image.startsWith('data:image/')) {
            const cleanUrl = await uploadPortfolioImage(m.image);
            return { ...m, image: cleanUrl };
          }
          return m;
        }),
      );
    }

    // 5. Convert gallery photos
    if (Array.isArray(next.gallery)) {
      next.gallery = await Promise.all(
        next.gallery.map(async (g) => {
          if (g.url && g.url.startsWith('data:image/')) {
            const cleanUrl = await uploadPortfolioImage(g.url);
            return { ...g, url: cleanUrl };
          }
          return g;
        }),
      );
    }

    return next;
  };

  const save = async () => {
    setSaving(true);

    // Sanitize any base64 images into cloud URLs first
    let cleanData = data;
    try {
      cleanData = await sanitizePortfolioImages(data);
      setData(cleanData);
    } catch (e) {
      console.warn('Image sanitize notice:', e);
    }

    const payload = JSON.stringify(cleanData);

    // 1. Save to local IndexedDB (never throws quota errors) and dispatch instant live event
    try {
      await savePortfolioToIndexedDb(cleanData);
      window.dispatchEvent(new CustomEvent('portfolio-updated', { detail: cleanData }));
      try {
        localStorage.setItem('gaurav_portfolio_cache', payload);
      } catch {
        /* quota exceeded on localStorage is fine since IndexedDB has the data */
      }
    } catch (e) {
      console.warn('Local cache save warning:', e);
    }

    // 2. Persist to Supabase attendance_settings table
    try {
      const { data: existing } = await supabase
        .from('attendance_settings')
        .select('id')
        .eq('key', PORTFOLIO_KEY)
        .maybeSingle();

      let saveErr = null;
      if (existing?.id) {
        const { error } = await supabase
          .from('attendance_settings')
          .update({ value: payload, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        saveErr = error;
      } else {
        const { error } = await supabase
          .from('attendance_settings')
          .insert({ key: PORTFOLIO_KEY, value: payload });
        saveErr = error;
      }

      setSaving(false);
      if (saveErr) {
        console.warn('Cloud sync note:', saveErr.message);
        toast({
          title: 'Saved Locally',
          description: `Saved to browser offline database (${saveErr.message}).`,
        });
        setDirty(false);
        return;
      }

      setDirty(false);
      toast({ title: 'Saved & Published', description: 'Portfolio and Gallery published live across the platform.' });
    } catch (err: any) {
      setSaving(false);
      console.error('Save error:', err);
      toast({
        title: 'Saved Locally',
        description: 'Changes saved locally in browser database.',
      });
      setDirty(false);
    }
  };

  const handleResetToDefaults = () => {
    if (!confirm('Reset portfolio data back to system defaults? Any unsaved edits will be cleared.')) return;
    setData(DEFAULT_PORTFOLIO);
    setDirty(true);
    toast({ title: 'Reset to defaults', description: 'Click "Save now" to persist.' });
  };

  // Debounced Auto-Save
  useEffect(() => {
    if (!isUnlocked || !dirty || loading) return;
    const t = setTimeout(() => {
      void save();
    }, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dirty, isUnlocked, loading]);

  const addPinDigit = (d: string) => {
    if (pinDigits.length >= 4) return;
    const next = pinDigits + d;
    setPinDigits(next);
    if (next.length === 4) {
      if (next === ACCESS_PIN) {
        setIsUnlocked(true);
        setPinDigits('');
        toast({ title: 'Studio Unlocked', description: 'Welcome to Portfolio Studio.' });
      } else {
        toast({ title: 'Wrong PIN', description: 'Access denied.', variant: 'destructive' });
        setPinDigits('');
      }
    }
  };

  /* ---- Public View (Locked Mode) ---- */
  if (!isUnlocked) {
    return (
      <PageTransition>
        <PageLayout className="has-bottom-nav md:pb-0">
          <PublicPortfolioView
            data={data}
            onUnlock={() => {
              const el = document.getElementById('portfolio-pin-lock');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
          />

          {/* PIN Unlock Section */}
          <section id="portfolio-pin-lock" className="mx-auto max-w-sm py-8">
            <Card className="rounded-3xl border border-primary/30 shadow-2xl backdrop-blur-xl">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20">
                  <Lock className="h-6 w-6" />
                </div>
                <CardTitle className="text-lg font-extrabold">Studio Access Lock</CardTitle>
                <CardDescription>Enter the 4-digit PIN to edit and customize</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <p className="text-center text-3xl tracking-[0.4em] font-mono font-bold min-h-10 text-primary">
                  {maskedPin || '○ ○ ○ ○'}
                </p>
                <div className="grid grid-cols-3 gap-2.5">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) => {
                    if (!k) return <div key={i} />;
                    if (k === 'del')
                      return (
                        <Button key="del" variant="outline" className="h-12 rounded-2xl" onClick={() => setPinDigits((p) => p.slice(0, -1))}>
                          <Delete className="h-5 w-5" />
                        </Button>
                      );
                    return (
                      <Button key={k} variant="outline" className="h-12 rounded-2xl text-lg font-bold" onClick={() => addPinDigit(k)}>
                        {k}
                      </Button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </section>
        </PageLayout>
      </PageTransition>
    );
  }

  /* ---- Drag and drop handlers ---- */
  const onDragEndProjects = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = data.projects.findIndex((p) => p.id === active.id);
    const newIndex = data.projects.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    update({ projects: arrayMove(data.projects, oldIndex, newIndex) });
  };

  const onDragEndMembers = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = data.members.findIndex((m) => m.id === active.id);
    const newIndex = data.members.findIndex((m) => m.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    update({ members: arrayMove(data.members, oldIndex, newIndex) });
  };

  const patchProject = (id: string, patch: Partial<PortfolioProject>) =>
    update({ projects: data.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const removeProject = (id: string) => update({ projects: data.projects.filter((p) => p.id !== id) });
  const addProject = () =>
    update({
      projects: [
        ...data.projects,
        { id: portfolioUid(), title: 'New Project', description: '', stack: '', image: '', link: '', year: new Date().getFullYear().toString() },
      ],
    });

  const patchMember = (id: string, patch: Partial<PortfolioMember>) =>
    update({ members: data.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  const removeMember = (id: string) => update({ members: data.members.filter((m) => m.id !== id) });
  const addMember = () =>
    update({
      members: [...data.members, { id: portfolioUid(), name: 'New Team Member', role: 'Contributor', bio: '', image: '' }],
    });

  return (
    <PageTransition>
      <PageLayout className="has-bottom-nav md:pb-0">
        <section className="space-y-6 pb-16">
          {/* Top Sticky Command Strip */}
          <div className="sticky top-2 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-background/90 px-4 py-3 backdrop-blur-xl shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/30">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-extrabold text-foreground">Portfolio Studio</h1>
                <p className="text-[11px] text-muted-foreground font-medium">
                  {loading ? 'Loading…' : dirty ? '● Unsaved changes (auto-saving…)' : '✓ Published live across platform'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-xl border bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setStudioViewMode('editor')}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${studioViewMode === 'editor' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Edit3 className="h-3.5 w-3.5" /> Editor
                </button>
                <button
                  type="button"
                  onClick={() => setStudioViewMode('preview')}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${studioViewMode === 'preview' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Eye className="h-3.5 w-3.5" /> Live Preview
                </button>
              </div>

              <Button size="sm" variant="ghost" onClick={handleResetToDefaults} className="h-8 text-xs text-muted-foreground hover:text-destructive">
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
              </Button>

              <Button size="sm" onClick={save} disabled={saving || loading} className="h-8 rounded-xl font-bold gap-1.5 shadow-md shadow-primary/20">
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Saving…' : 'Save now'}
              </Button>

              <Button size="sm" variant="outline" onClick={() => setIsUnlocked(false)} className="h-8 rounded-xl">
                <Lock className="h-3.5 w-3.5 mr-1" /> Lock
              </Button>
            </div>
          </div>

          {/* Dual Mode Switcher */}
          {studioViewMode === 'preview' ? (
            <Card className="rounded-3xl border border-white/10 shadow-2xl p-4 sm:p-6 bg-card/60 backdrop-blur-xl">
              <PublicPortfolioView data={data} onUnlock={() => setStudioViewMode('editor')} />
            </Card>
          ) : (
            <Tabs defaultValue="gallery" className="space-y-5">
              <TabsList className="flex-wrap bg-muted/40 p-1 rounded-2xl border">
                <TabsTrigger value="gallery" className="rounded-xl font-bold text-xs">
                  📸 Campus Gallery ({data.gallery.length})
                </TabsTrigger>
                <TabsTrigger value="profile" className="rounded-xl font-semibold text-xs">Profile & Bio</TabsTrigger>
                <TabsTrigger value="projects" className="rounded-xl font-semibold text-xs">Projects ({data.projects.length})</TabsTrigger>
                <TabsTrigger value="members" className="rounded-xl font-semibold text-xs">Team Members ({data.members.length})</TabsTrigger>
                <TabsTrigger value="extras" className="rounded-xl font-semibold text-xs">Skills · Socials</TabsTrigger>
                <TabsTrigger value="settings" className="rounded-xl font-semibold text-xs">Display & Layout</TabsTrigger>
              </TabsList>

              {/* 1. GALLERY TAB (Rebuilt with Multi-Photo Batch Uploader) */}
              <TabsContent value="gallery" className="space-y-5">
                <Card className="rounded-3xl border shadow-sm">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                          <ImageIcon className="h-5 w-5 text-primary" /> Multi-Photo Gallery Studio
                        </CardTitle>
                        <CardDescription>
                          Upload multiple photos at once, paste bulk URLs, categorize into tags, and drag to reorder.
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="text-xs font-mono font-bold">
                        {data.gallery.length} Photos
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <BatchGalleryUploader
                      items={data.gallery}
                      onChange={(gallery) => update({ gallery })}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 2. PROFILE TAB */}
              <TabsContent value="profile" className="space-y-5">
                <Card className="rounded-3xl border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base sm:text-lg font-bold">Profile Images & Banner</CardTitle>
                    <CardDescription>Upload, paste link, or drop images. Your profile DP also updates the Home page core card.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-6 md:grid-cols-[220px_1fr]">
                    <ImageDropzone
                      label="Profile Photo (Avatar)"
                      aspect="square"
                      value={data.profileImage}
                      onChange={(url) => update({ profileImage: url })}
                    />
                    <ImageDropzone
                      label="Hero Cover Banner"
                      aspect="cover"
                      value={data.coverImage}
                      onChange={(url) => update({ coverImage: url })}
                    />
                  </CardContent>
                </Card>

                <Card className="rounded-3xl border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base sm:text-lg font-bold">Personal & Leadership Details</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label className="text-xs font-bold">Full Name</Label>
                      <Input value={data.name} onChange={(e) => update({ name: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs font-bold">Designation / Role</Label>
                      <Input value={data.role} onChange={(e) => update({ role: e.target.value })} className="mt-1" />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs font-bold">Short Tagline</Label>
                      <Input value={data.tagline} onChange={(e) => update({ tagline: e.target.value })} className="mt-1" />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs font-bold">Full Bio</Label>
                      <Textarea rows={4} value={data.bio} onChange={(e) => update({ bio: e.target.value })} className="mt-1 leading-relaxed" />
                    </div>
                    <div>
                      <Label className="text-xs font-bold">Location</Label>
                      <Input value={data.location} onChange={(e) => update({ location: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs font-bold">Email</Label>
                      <Input value={data.email} onChange={(e) => update({ email: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs font-bold">Phone</Label>
                      <Input value={data.phone} onChange={(e) => update({ phone: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs font-bold">Personal / School Website</Label>
                      <Input value={data.website} onChange={(e) => update({ website: e.target.value })} className="mt-1" />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 3. PROJECTS TAB */}
              <TabsContent value="projects" className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Drag <GripVertical className="inline h-3 w-3" /> to arrange priority order.</p>
                  <Button size="sm" onClick={addProject} className="rounded-xl font-bold gap-1">
                    <Plus className="h-4 w-4" /> Add Project
                  </Button>
                </div>

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEndProjects}>
                  <SortableContext items={data.projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-4">
                      {data.projects.map((project, i) => (
                        <SortableItem key={project.id} id={project.id}>
                          {(handle) => (
                            <div className="rounded-3xl border bg-card/60 p-5 backdrop-blur shadow-sm">
                              <div className="mb-3 flex items-center justify-between pb-2 border-b">
                                <div className="flex items-center gap-2">
                                  {handle}
                                  <p className="text-sm font-extrabold text-foreground">Project #{i + 1} · {project.title || 'Untitled'}</p>
                                </div>
                                <Button size="sm" variant="ghost" onClick={() => removeProject(project.id)} className="text-destructive hover:bg-destructive/10">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>

                              <div className="grid gap-5 md:grid-cols-[220px_1fr]">
                                <ImageDropzone
                                  aspect="video"
                                  label="Project Preview Screenshot"
                                  value={project.image}
                                  onChange={(url) => patchProject(project.id, { image: url })}
                                />
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div className="md:col-span-2">
                                    <Label className="text-xs font-bold">Project Title</Label>
                                    <Input value={project.title} onChange={(e) => patchProject(project.id, { title: e.target.value })} className="mt-1" />
                                  </div>
                                  <div className="md:col-span-2">
                                    <Label className="text-xs font-bold">Description</Label>
                                    <Textarea rows={2} value={project.description} onChange={(e) => patchProject(project.id, { description: e.target.value })} className="mt-1" />
                                  </div>
                                  <div>
                                    <Label className="text-xs font-bold">Tech Stack (comma-separated)</Label>
                                    <Input value={project.stack} onChange={(e) => patchProject(project.id, { stack: e.target.value })} className="mt-1" />
                                  </div>
                                  <div>
                                    <Label className="text-xs font-bold">Year</Label>
                                    <Input value={project.year ?? ''} onChange={(e) => patchProject(project.id, { year: e.target.value })} className="mt-1" />
                                  </div>
                                  <div>
                                    <Label className="text-xs font-bold">Live URL</Label>
                                    <Input value={project.link} onChange={(e) => patchProject(project.id, { link: e.target.value })} className="mt-1" />
                                  </div>
                                  <div>
                                    <Label className="text-xs font-bold">GitHub Repository</Label>
                                    <Input value={project.githubUrl ?? ''} onChange={(e) => patchProject(project.id, { githubUrl: e.target.value })} className="mt-1" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </SortableItem>
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </TabsContent>

              {/* 4. MEMBERS TAB */}
              <TabsContent value="members" className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">These photos and names drive the Home page team cards & About Me sections.</p>
                  <Button size="sm" onClick={addMember} className="rounded-xl font-bold gap-1">
                    <Plus className="h-4 w-4" /> Add Member
                  </Button>
                </div>

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEndMembers}>
                  <SortableContext items={data.members.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-4">
                      {data.members.map((m, i) => (
                        <SortableItem key={m.id} id={m.id}>
                          {(handle) => (
                            <div className="rounded-3xl border bg-card/60 p-5 backdrop-blur shadow-sm">
                              <div className="mb-3 flex items-center justify-between pb-2 border-b">
                                <div className="flex items-center gap-2">
                                  {handle}
                                  <p className="text-sm font-extrabold text-foreground">Member #{i + 1} · {m.name || 'Unnamed'}</p>
                                </div>
                                <Button size="sm" variant="ghost" onClick={() => removeMember(m.id)} className="text-destructive hover:bg-destructive/10">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>

                              <div className="grid gap-5 md:grid-cols-[180px_1fr]">
                                <ImageDropzone
                                  aspect="square"
                                  label="Portrait Photo"
                                  value={m.image}
                                  onChange={(url) => patchMember(m.id, { image: url })}
                                />
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div>
                                    <Label className="text-xs font-bold">Full Name</Label>
                                    <Input value={m.name} onChange={(e) => patchMember(m.id, { name: e.target.value })} className="mt-1" />
                                  </div>
                                  <div>
                                    <Label className="text-xs font-bold">Role / Contribution</Label>
                                    <Input value={m.role} onChange={(e) => patchMember(m.id, { role: e.target.value })} className="mt-1" />
                                  </div>
                                  <div className="md:col-span-2">
                                    <Label className="text-xs font-bold">Short Bio</Label>
                                    <Textarea rows={2} value={m.bio} onChange={(e) => patchMember(m.id, { bio: e.target.value })} className="mt-1" />
                                  </div>
                                  <div className="md:col-span-2">
                                    <Label className="text-xs font-bold">Detailed Contributions</Label>
                                    <Textarea rows={2} value={m.details ?? ''} onChange={(e) => patchMember(m.id, { details: e.target.value })} className="mt-1" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </SortableItem>
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </TabsContent>

              {/* 5. EXTRAS TAB (Skills & Socials) */}
              <TabsContent value="extras" className="space-y-5">
                <div className="grid gap-5 md:grid-cols-2">
                  <Card className="rounded-3xl border shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base font-bold">
                        <Trophy className="h-4 w-4 text-amber-400" /> Milestones & Achievements
                      </CardTitle>
                      <CardDescription>Enter one line per item</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        rows={7}
                        value={data.achievements.join('\n')}
                        onChange={(e) => update({ achievements: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean) })}
                        className="font-medium text-xs leading-relaxed"
                      />
                    </CardContent>
                  </Card>

                  <Card className="rounded-3xl border shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base font-bold">
                        <Sparkles className="h-4 w-4 text-primary" /> Technical Skills & Tags
                      </CardTitle>
                      <CardDescription>Enter one line per skill</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        rows={7}
                        value={data.skills.join('\n')}
                        onChange={(e) => update({ skills: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean) })}
                        className="font-medium text-xs leading-relaxed"
                      />
                    </CardContent>
                  </Card>
                </div>

                <Card className="rounded-3xl border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base font-bold">Social Media Profiles</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label className="text-xs font-bold">GitHub</Label>
                      <Input value={data.socials.github ?? ''} onChange={(e) => update({ socials: { ...data.socials, github: e.target.value } })} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs font-bold">LinkedIn</Label>
                      <Input value={data.socials.linkedin ?? ''} onChange={(e) => update({ socials: { ...data.socials, linkedin: e.target.value } })} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs font-bold">Twitter / X</Label>
                      <Input value={data.socials.twitter ?? ''} onChange={(e) => update({ socials: { ...data.socials, twitter: e.target.value } })} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs font-bold">Instagram</Label>
                      <Input value={data.socials.instagram ?? ''} onChange={(e) => update({ socials: { ...data.socials, instagram: e.target.value } })} className="mt-1" />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs font-bold">YouTube / Demo Link</Label>
                      <Input value={data.socials.youtube ?? ''} onChange={(e) => update({ socials: { ...data.socials, youtube: e.target.value } })} className="mt-1" />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 6. DISPLAY & HOME SETTINGS TAB */}
              <TabsContent value="settings" className="space-y-5">
                <Card className="rounded-3xl border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                      <SlidersHorizontal className="h-5 w-5 text-primary" /> Home Page & Display Customization
                    </CardTitle>
                    <CardDescription>
                      Customize how the portfolio showcase and campus gallery appear to visitors on the Home page.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between p-4 rounded-2xl border bg-muted/20">
                      <div>
                        <p className="text-sm font-bold text-foreground">Show Developer Showcase on Home Page</p>
                        <p className="text-xs text-muted-foreground">Display the full interactive developer and team spotlight on the main landing page.</p>
                      </div>
                      <Switch
                        checked={data.settings?.showOnHome ?? true}
                        onCheckedChange={(checked) =>
                          update({ settings: { ...data.settings, showOnHome: checked } })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-2xl border bg-muted/20">
                      <div>
                        <p className="text-sm font-bold text-foreground">Show Campus & Media Gallery on Home Page</p>
                        <p className="text-xs text-muted-foreground">Display the media & photo gallery with Bento/Grid/Cinematic layout on the home page.</p>
                      </div>
                      <Switch
                        checked={data.settings?.showGalleryOnHome ?? true}
                        onCheckedChange={(checked) =>
                          update({ settings: { ...data.settings, showGalleryOnHome: checked } })
                        }
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label className="text-xs font-bold">Default Home Gallery View Style</Label>
                        <Select
                          value={data.settings?.homeGalleryLayout || 'bento'}
                          onValueChange={(val: any) =>
                            update({ settings: { ...data.settings, homeGalleryLayout: val } })
                          }
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bento">Bento Masonry Grid (Dynamic)</SelectItem>
                            <SelectItem value="grid">Uniform Cyber Grid</SelectItem>
                            <SelectItem value="carousel">Cinematic Slider Carousel</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs font-bold">Custom Leader / Creator Badge</Label>
                        <Input
                          value={data.settings?.customBadge || ''}
                          placeholder="e.g. Team RCA · Core Lead"
                          onChange={(e) =>
                            update({ settings: { ...data.settings, customBadge: e.target.value } })
                          }
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </section>
      </PageLayout>
    </PageTransition>
  );
};

export default Portfolio;

