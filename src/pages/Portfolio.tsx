import React, { useEffect, useMemo, useState } from 'react';
import PageLayout from '@/components/layouts/PageLayout';
import PageTransition from '@/components/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import {
  Lock,
  Delete,
  Save,
  Plus,
  Trophy,
  ExternalLink,
  Github,
  Linkedin,
  Twitter,
  Instagram,
  Trash2,
  GripVertical,
  Sparkles,
  MapPin,
  Mail,
  Phone,
  Globe,
} from 'lucide-react';
import {
  DEFAULT_PORTFOLIO,
  PORTFOLIO_KEY,
  type PortfolioData,
  type PortfolioProject,
  type PortfolioMember,
  migratePortfolioData,
  portfolioUid,
} from '@/hooks/usePortfolioData';
import { ImageDropzone } from '@/components/portfolio/ImageDropzone';
import { MemberAvatar } from '@/components/portfolio/MemberAvatar';
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
      className="cursor-grab touch-none rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
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
/* Public View                                                         */
/* ------------------------------------------------------------------ */

export function PublicPortfolioView({ data, onUnlock }: { data: PortfolioData; onUnlock?: () => void }) {
  return (
    <section className="space-y-8 md:space-y-12 pb-12 md:pb-16 min-w-0">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl md:rounded-3xl border bg-card/60 backdrop-blur">
        <div
          className="h-36 sm:h-48 md:h-64 w-full bg-gradient-to-br from-primary/30 via-accent/20 to-primary/10"
          style={data.coverImage ? { backgroundImage: `url(${data.coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        />
        <div className="px-4 sm:px-6 md:px-10 pb-6 md:pb-8">
          <div className="-mt-12 sm:-mt-14 md:-mt-20 flex flex-col md:flex-row md:items-end gap-4 md:gap-5">
            <img
              src={data.profileImage}
              alt={data.name}
              className="h-24 w-24 sm:h-28 sm:w-28 md:h-36 md:w-36 rounded-2xl border-4 border-background object-cover shadow-xl"
            />
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-primary">
                <Sparkles className="h-3 w-3" /> Portfolio
              </div>
              <h1 className="mt-2 text-2xl sm:text-3xl md:text-5xl font-extrabold tracking-tight break-words">{data.name}</h1>
              <p className="text-sm md:text-base text-muted-foreground break-words">{data.role}</p>
              <p className="mt-2 max-w-2xl text-sm md:text-base break-words">{data.tagline}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.socials?.github && (
                <a href={data.socials.github} target="_blank" rel="noreferrer" className="rounded-full border p-2 hover:bg-muted">
                  <Github className="h-4 w-4" />
                </a>
              )}
              {data.socials?.linkedin && (
                <a href={data.socials.linkedin} target="_blank" rel="noreferrer" className="rounded-full border p-2 hover:bg-muted">
                  <Linkedin className="h-4 w-4" />
                </a>
              )}
              {data.socials?.twitter && (
                <a href={data.socials.twitter} target="_blank" rel="noreferrer" className="rounded-full border p-2 hover:bg-muted">
                  <Twitter className="h-4 w-4" />
                </a>
              )}
              {data.socials?.instagram && (
                <a href={data.socials.instagram} target="_blank" rel="noreferrer" className="rounded-full border p-2 hover:bg-muted">
                  <Instagram className="h-4 w-4" />
                </a>
              )}
              {onUnlock && (
                <Button size="sm" variant="outline" onClick={onUnlock}>
                  <Lock className="mr-1 h-3.5 w-3.5" /> Edit
                </Button>
              )}
            </div>
          </div>

          <div className="mt-5 md:mt-6 grid gap-2.5 md:gap-3 md:grid-cols-2 lg:grid-cols-4 text-sm">
            {data.location && (
              <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                <MapPin className="h-4 w-4 flex-shrink-0" /> <span className="truncate">{data.location}</span>
              </div>
            )}
            {data.email && (
              <a href={`mailto:${data.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground min-w-0">
                <Mail className="h-4 w-4 flex-shrink-0" /> <span className="truncate">{data.email}</span>
              </a>
            )}
            {data.phone && (
              <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                <Phone className="h-4 w-4 flex-shrink-0" /> <span className="truncate">{data.phone}</span>
              </div>
            )}
            {data.website && (
              <a href={data.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-muted-foreground hover:text-foreground min-w-0">
                <Globe className="h-4 w-4 flex-shrink-0" /> <span className="truncate">{data.website.replace(/^https?:\/\//, '')}</span>
              </a>
            )}
          </div>

          {data.bio && <p className="mt-5 md:mt-6 max-w-3xl text-sm md:text-base text-muted-foreground leading-relaxed break-words">{data.bio}</p>}
        </div>
      </div>


      {/* Projects */}
      {data.projects.length > 0 && (
        <div>
          <h2 className="mb-3 md:mb-4 text-lg md:text-xl font-bold">Featured Projects</h2>
          <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">

            {data.projects.map((p) => (
              <motion.article
                key={p.id}
                whileHover={{ y: -4 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                className="group relative overflow-hidden rounded-2xl border bg-card/70 backdrop-blur shadow-sm"
              >
                <div className="relative aspect-video overflow-hidden bg-muted">
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Sparkles className="h-8 w-8 opacity-40" />
                    </div>
                  )}
                  {p.year && (
                    <span className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-bold text-foreground shadow">
                      {p.year}
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="text-base font-bold">{p.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                  {(p.tags && p.tags.length > 0) || p.stack ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(p.tags && p.tags.length > 0 ? p.tags : p.stack.split(',').map((s) => s.trim()).filter(Boolean)).map((t) => (
                        <span key={t} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-4 flex items-center gap-2">
                    {p.link && (
                      <a href={p.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" /> Live
                      </a>
                    )}
                    {p.githubUrl && (
                      <a href={p.githubUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
                        <Github className="h-3 w-3" /> Code
                      </a>
                    )}
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      )}

      {/* Members */}
      {data.members.length > 0 && (
        <div>
          <h2 className="mb-3 md:mb-4 text-lg md:text-xl font-bold">Team</h2>
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">

            {data.members.map((m) => (
              <div key={m.id} className="rounded-2xl border bg-card/70 p-4 backdrop-blur">
                <div className="flex items-center gap-3">
                  <MemberAvatar
                    name={m.name}
                    image={m.image}
                    className="h-14 w-14 rounded-xl border"
                    fallbackClassName="text-lg"
                  />

                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{m.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{m.role}</p>
                  </div>
                </div>
                {m.bio && <p className="mt-3 text-xs text-muted-foreground leading-relaxed line-clamp-3">{m.bio}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Achievements + Skills */}
      <div className="grid gap-6 md:grid-cols-2">
        {data.achievements.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4 text-primary" /> Achievements
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {data.achievements.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        {data.skills.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Skills</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {data.skills.map((s) => (
                  <span key={s} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    {s}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Gallery */}
      {data.gallery.length > 0 && (
        <div>
          <h2 className="mb-3 md:mb-4 text-lg md:text-xl font-bold">Gallery</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-3 md:grid-cols-4">

            {data.gallery.map((src, i) => (
              <img key={i} src={src} alt={`Gallery ${i + 1}`} className="aspect-square w-full rounded-xl border object-cover" loading="lazy" />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Main page (PIN gate + editor)                                       */
/* ------------------------------------------------------------------ */

const Portfolio = () => {
  const { toast } = useToast();
  const [pinDigits, setPinDigits] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<PortfolioData>(DEFAULT_PORTFOLIO);
  const [dirty, setDirty] = useState(false);

  const maskedPin = useMemo(() => '●'.repeat(pinDigits.length), [pinDigits]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const load = async () => {
    setLoading(true);
    const { data: row, error } = await supabase.from('attendance_settings').select('value').eq('key', PORTFOLIO_KEY).maybeSingle();
    if (error) {
      toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    if (row?.value) {
      try {
        setData(migratePortfolioData(JSON.parse(row.value)));
      } catch {
        setData(DEFAULT_PORTFOLIO);
      }
    }
    setDirty(false);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const update = (patch: Partial<PortfolioData>) => {
    setData((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    const payload = JSON.stringify(data);
    const { data: existing } = await supabase.from('attendance_settings').select('id').eq('key', PORTFOLIO_KEY).maybeSingle();
    const mutation = existing?.id
      ? supabase.from('attendance_settings').update({ value: payload }).eq('id', existing.id)
      : supabase.from('attendance_settings').insert({ key: PORTFOLIO_KEY, value: payload });
    const { error } = await mutation;
    setSaving(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    setDirty(false);
    toast({ title: 'Saved', description: 'Portfolio updated. Live everywhere.' });
  };

  // Auto-save (debounced) while editor is unlocked
  useEffect(() => {
    if (!isUnlocked || !dirty || loading) return;
    const t = setTimeout(() => {
      void save();
    }, 1500);
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
      } else {
        toast({ title: 'Wrong PIN', variant: 'destructive' });
        setPinDigits('');
      }
    }
  };

  /* ---- Public view (no PIN yet) ---- */
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
          <section id="portfolio-pin-lock" className="mx-auto max-w-sm py-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lock className="h-4 w-4" /> Secured Editor
                </CardTitle>
                <CardDescription>4-digit PIN unlocks the studio.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-center text-2xl tracking-[0.4em] font-semibold min-h-9">{maskedPin || '○ ○ ○ ○'}</p>
                <div className="grid grid-cols-3 gap-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) => {
                    if (!k) return <div key={i} />;
                    if (k === 'del')
                      return (
                        <Button key="del" variant="outline" className="h-12" onClick={() => setPinDigits((p) => p.slice(0, -1))}>
                          <Delete className="h-4 w-4" />
                        </Button>
                      );
                    return (
                      <Button key={k} variant="outline" className="h-12 text-lg" onClick={() => addPinDigit(k)}>
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

  /* ---- Editor ---- */
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
        { id: portfolioUid(), title: 'New Project', description: '', stack: '', image: '', link: '', year: '' },
      ],
    });

  const patchMember = (id: string, patch: Partial<PortfolioMember>) =>
    update({ members: data.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  const removeMember = (id: string) => update({ members: data.members.filter((m) => m.id !== id) });
  const addMember = () =>
    update({
      members: [...data.members, { id: portfolioUid(), name: 'New Member', role: '', bio: '', image: '' }],
    });

  return (
    <PageTransition>
      <PageLayout className="has-bottom-nav md:pb-0">
        <section className="space-y-6 pb-16">
          <div className="sticky top-2 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-background/85 px-4 py-3 backdrop-blur">
            <div>
              <h1 className="text-xl font-bold">Portfolio Studio</h1>
              <p className="text-xs text-muted-foreground">
                {loading ? 'Loading…' : dirty ? 'Auto-saving…' : 'Saved — live everywhere'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Secured</Badge>
              <Button size="sm" variant="outline" onClick={() => setIsUnlocked(false)}>
                <Lock className="mr-1 h-3.5 w-3.5" /> Lock
              </Button>
              <Button size="sm" onClick={save} disabled={saving || loading}>
                <Save className="mr-1 h-3.5 w-3.5" />
                {saving ? 'Saving…' : 'Save now'}
              </Button>
            </div>
          </div>

          <Tabs defaultValue="profile" className="space-y-5">
            <TabsList className="flex-wrap">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="projects">Projects ({data.projects.length})</TabsTrigger>
              <TabsTrigger value="members">Members ({data.members.length})</TabsTrigger>
              <TabsTrigger value="gallery">Gallery ({data.gallery.length})</TabsTrigger>
              <TabsTrigger value="extras">Achievements · Skills · Socials</TabsTrigger>
            </TabsList>

            {/* PROFILE */}
            <TabsContent value="profile" className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>Photos</CardTitle>
                  <CardDescription>Drop or paste images. Your profile photo also drives the Home page team card & About Me.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-5 md:grid-cols-[220px_1fr]">
                  <ImageDropzone label="Profile photo (DP)" aspect="square" value={data.profileImage} onChange={(url) => update({ profileImage: url })} />
                  <ImageDropzone label="Cover image" aspect="cover" value={data.coverImage} onChange={(url) => update({ coverImage: url })} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Basic details</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Name</Label>
                    <Input value={data.name} onChange={(e) => update({ name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Role</Label>
                    <Input value={data.role} onChange={(e) => update({ role: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Tagline</Label>
                    <Input value={data.tagline} onChange={(e) => update({ tagline: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Bio</Label>
                    <Textarea rows={4} value={data.bio} onChange={(e) => update({ bio: e.target.value })} />
                  </div>
                  <div>
                    <Label>Location</Label>
                    <Input value={data.location} onChange={(e) => update({ location: e.target.value })} />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input value={data.email} onChange={(e) => update({ email: e.target.value })} />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input value={data.phone} onChange={(e) => update({ phone: e.target.value })} />
                  </div>
                  <div>
                    <Label>Website</Label>
                    <Input value={data.website} onChange={(e) => update({ website: e.target.value })} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* PROJECTS */}
            <TabsContent value="projects" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Drag <GripVertical className="inline h-3 w-3" /> to reorder.</p>
                <Button size="sm" onClick={addProject}>
                  <Plus className="mr-1 h-4 w-4" /> Add project
                </Button>
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEndProjects}>
                <SortableContext items={data.projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {data.projects.map((project, i) => (
                      <SortableItem key={project.id} id={project.id}>
                        {(handle) => (
                          <div className="rounded-xl border bg-card/60 p-4 backdrop-blur">
                            <div className="mb-3 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {handle}
                                <p className="text-sm font-semibold">#{i + 1} · {project.title || 'Untitled'}</p>
                              </div>
                              <Button size="sm" variant="ghost" onClick={() => removeProject(project.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                              <ImageDropzone aspect="video" value={project.image} onChange={(url) => patchProject(project.id, { image: url })} />
                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="md:col-span-2">
                                  <Label>Title</Label>
                                  <Input value={project.title} onChange={(e) => patchProject(project.id, { title: e.target.value })} />
                                </div>
                                <div className="md:col-span-2">
                                  <Label>Description</Label>
                                  <Textarea rows={2} value={project.description} onChange={(e) => patchProject(project.id, { description: e.target.value })} />
                                </div>
                                <div>
                                  <Label>Tech stack (comma-separated)</Label>
                                  <Input value={project.stack} onChange={(e) => patchProject(project.id, { stack: e.target.value })} />
                                </div>
                                <div>
                                  <Label>Year</Label>
                                  <Input value={project.year ?? ''} onChange={(e) => patchProject(project.id, { year: e.target.value })} />
                                </div>
                                <div>
                                  <Label>Live URL</Label>
                                  <Input value={project.link} onChange={(e) => patchProject(project.id, { link: e.target.value })} />
                                </div>
                                <div>
                                  <Label>GitHub URL</Label>
                                  <Input value={project.githubUrl ?? ''} onChange={(e) => patchProject(project.id, { githubUrl: e.target.value })} />
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

            {/* MEMBERS */}
            <TabsContent value="members" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">These photos drive the Home team card & About Me DPs in real-time.</p>
                <Button size="sm" onClick={addMember}>
                  <Plus className="mr-1 h-4 w-4" /> Add member
                </Button>
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEndMembers}>
                <SortableContext items={data.members.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {data.members.map((m, i) => (
                      <SortableItem key={m.id} id={m.id}>
                        {(handle) => (
                          <div className="rounded-xl border bg-card/60 p-4 backdrop-blur">
                            <div className="mb-3 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {handle}
                                <p className="text-sm font-semibold">#{i + 1} · {m.name || 'Unnamed'}</p>
                              </div>
                              <Button size="sm" variant="ghost" onClick={() => removeMember(m.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                            <div className="grid gap-4 md:grid-cols-[160px_1fr]">
                              <ImageDropzone aspect="square" value={m.image} onChange={(url) => patchMember(m.id, { image: url })} />
                              <div className="grid gap-3 md:grid-cols-2">
                                <div>
                                  <Label>Name</Label>
                                  <Input value={m.name} onChange={(e) => patchMember(m.id, { name: e.target.value })} />
                                </div>
                                <div>
                                  <Label>Role</Label>
                                  <Input value={m.role} onChange={(e) => patchMember(m.id, { role: e.target.value })} />
                                </div>
                                <div className="md:col-span-2">
                                  <Label>Short bio</Label>
                                  <Textarea rows={2} value={m.bio} onChange={(e) => patchMember(m.id, { bio: e.target.value })} />
                                </div>
                                <div className="md:col-span-2">
                                  <Label>Details (long bio)</Label>
                                  <Textarea rows={2} value={m.details ?? ''} onChange={(e) => patchMember(m.id, { details: e.target.value })} />
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

            {/* GALLERY */}
            <TabsContent value="gallery" className="space-y-4">
              <p className="text-sm text-muted-foreground">Drop images to add. Click Remove on any to delete.</p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {data.gallery.map((url, i) => (
                  <div key={`${url}-${i}`} className="relative">
                    <ImageDropzone
                      aspect="square"
                      value={url}
                      onChange={(next) => {
                        if (!next) update({ gallery: data.gallery.filter((_, j) => j !== i) });
                        else update({ gallery: data.gallery.map((g, j) => (j === i ? next : g)) });
                      }}
                    />
                  </div>
                ))}
                <ImageDropzone
                  aspect="square"
                  value=""
                  allowClear={false}
                  onChange={(url) => url && update({ gallery: [...data.gallery, url] })}
                  label="Add"
                />
              </div>
            </TabsContent>

            {/* EXTRAS */}
            <TabsContent value="extras" className="space-y-5">
              <div className="grid gap-5 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base"><Trophy className="h-4 w-4" /> Achievements</CardTitle>
                    <CardDescription>One line per item</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      rows={7}
                      value={data.achievements.join('\n')}
                      onChange={(e) => update({ achievements: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean) })}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Skills</CardTitle>
                    <CardDescription>One line per skill</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      rows={7}
                      value={data.skills.join('\n')}
                      onChange={(e) => update({ skills: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean) })}
                    />
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Socials</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>GitHub</Label>
                    <Input value={data.socials.github ?? ''} onChange={(e) => update({ socials: { ...data.socials, github: e.target.value } })} />
                  </div>
                  <div>
                    <Label>LinkedIn</Label>
                    <Input value={data.socials.linkedin ?? ''} onChange={(e) => update({ socials: { ...data.socials, linkedin: e.target.value } })} />
                  </div>
                  <div>
                    <Label>Twitter / X</Label>
                    <Input value={data.socials.twitter ?? ''} onChange={(e) => update({ socials: { ...data.socials, twitter: e.target.value } })} />
                  </div>
                  <div>
                    <Label>Instagram</Label>
                    <Input value={data.socials.instagram ?? ''} onChange={(e) => update({ socials: { ...data.socials, instagram: e.target.value } })} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Live public preview</CardTitle>
              <CardDescription>Exactly what visitors see.</CardDescription>
            </CardHeader>
            <CardContent>
              <PublicPortfolioView data={data} onUnlock={() => undefined} />
            </CardContent>
          </Card>
        </section>
      </PageLayout>
    </PageTransition>
  );
};

export default Portfolio;
