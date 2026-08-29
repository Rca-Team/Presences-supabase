import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import gauravPhoto from '@/assets/gaurav-photo.png';
import swamiAnantVyasPhoto from '@/assets/swami-anant-vyas.png';
import jatinDhamaPhoto from '@/assets/jatin-dhama.jpg';
import teamRcaPhoto from '@/assets/team-rca.jpg';

export const PORTFOLIO_KEY = 'gaurav_portfolio';
export const PORTFOLIO_BUCKET = 'face-images';
export const PORTFOLIO_PREFIX = 'portfolio/';

export type PortfolioProject = {
  id: string;
  title: string;
  description: string;
  stack: string;
  image: string;
  link: string;
  githubUrl?: string;
  year?: string;
  tags?: string[];
  featured?: boolean;
};

export type PortfolioMember = {
  id: string;
  name: string;
  role: string;
  bio: string;
  details?: string;
  image: string;
};

export type PortfolioSocials = {
  github?: string;
  linkedin?: string;
  twitter?: string;
  instagram?: string;
  youtube?: string;
};

export type PortfolioGalleryItem = {
  id: string;
  url: string;
  title?: string;
  category?: string;
  caption?: string;
  featured?: boolean;
  date?: string;
};

export type PortfolioCustomSettings = {
  showOnHome?: boolean;
  showGalleryOnHome?: boolean;
  homeGalleryLayout?: 'bento' | 'grid' | 'carousel';
  customBadge?: string;
  statusMessage?: string;
  heroGradient?: string;
};

export type PortfolioData = {
  name: string;
  role: string;
  tagline: string;
  bio: string;
  location: string;
  email: string;
  phone: string;
  website: string;
  profileImage: string;
  coverImage: string;
  achievements: string[];
  skills: string[];
  gallery: PortfolioGalleryItem[];
  projects: PortfolioProject[];
  members: PortfolioMember[];
  socials: PortfolioSocials;
  settings?: PortfolioCustomSettings;
};

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;

export const DEFAULT_GALLERY_ITEMS: PortfolioGalleryItem[] = [
  {
    id: 'gal-team-rca',
    url: teamRcaPhoto,
    title: 'Team RCA — Core Platform Architects',
    category: 'Team',
    caption: 'The core engineering & design team behind Presences Smart School Automation.',
    featured: true,
  },
  {
    id: 'gal-gaurav-lead',
    url: gauravPhoto,
    title: 'Gaurav Raj — Lead Architect & Developer',
    category: 'Team',
    caption: 'Full-stack engineering & AI recognition engine development.',
    featured: false,
  },
  {
    id: 'gal-hardware-proto',
    url: swamiAnantVyasPhoto,
    title: 'Hardware & Smart Gate Prototyping',
    category: 'AI Tech',
    caption: 'Validating hardware gate sensors and live kiosk vision modes.',
    featured: false,
  },
  {
    id: 'gal-jatin-qa',
    url: jatinDhamaPhoto,
    title: 'Deployment & Quality Assurance',
    category: 'Team',
    caption: 'Coordinating live school testing and deployment operations.',
    featured: false,
  },
];

export const DEFAULT_PORTFOLIO: PortfolioData = {
  name: 'Gaurav Raj',
  role: 'Full Stack Developer & Team Leader',
  tagline: 'Building practical school automation systems for real-world scale.',
  bio: 'I design and ship full-stack products with a focus on reliability, realtime workflows, and meaningful user experience.',
  location: 'India',
  email: 'gaurav@example.com',
  phone: '+91 00000 00000',
  website: 'https://presences.dev',
  profileImage: gauravPhoto,
  coverImage: '',
  achievements: [
    'Led end-to-end delivery of smart attendance platform',
    'Built face-recognition gate mode with realtime alerts',
    'Shipped scalable admin workflows for school operations',
    'Architected instant timetable automatic teacher substitution engine',
  ],
  skills: ['React', 'TypeScript', 'Supabase', 'Face Recognition', 'Realtime Systems', 'Tailwind CSS', 'PWA & Edge AI'],
  gallery: DEFAULT_GALLERY_ITEMS,
  projects: [
    {
      id: uid(),
      title: 'Presences Smart School Platform',
      description: 'Unified attendance, gate mode, analytics, and communication platform built for PM Shri KV NFC Vigyan Vihar.',
      stack: 'React, TypeScript, Supabase, Face API',
      image: teamRcaPhoto,
      link: 'https://presences.dev',
      githubUrl: 'https://github.com/Rca-Team/Presences-supabase',
      year: '2025',
      tags: ['React', 'Supabase', 'AI Vision', 'PWA'],
      featured: true,
    },
  ],
  members: [
    {
      id: uid(),
      name: 'Gaurav',
      role: 'Developer & Team Leader',
      image: gauravPhoto,
      bio: 'Creator of Presence Smart School automation. I build scalable attendance, security, and school workflow systems.',
      details: 'Full-stack engineer focused on face-recognition workflows, database design, and production-ready education systems.',
    },
    {
      id: uid(),
      name: 'Swami Anant Vyas',
      role: 'Hardware Prototype & Software Feedback',
      image: swamiAnantVyasPhoto,
      bio: 'Helped build the hardware prototype and contributed ideas for the software experience.',
      details: 'Built and validated early hardware concepts for kiosk gate mode and camera triggers.',
    },
    {
      id: uid(),
      name: 'Jatin Dhama',
      role: 'Team Member',
      image: jatinDhamaPhoto,
      bio: 'Contributes to system testing, execution support, and project coordination.',
      details: 'Supports feature QA, user feedback loops, and collaborative delivery.',
    },
  ],
  socials: { github: '', linkedin: '', twitter: '', instagram: '', youtube: '' },
  settings: {
    showOnHome: true,
    showGalleryOnHome: true,
    homeGalleryLayout: 'bento',
    customBadge: 'Team RCA · Core Lead',
    statusMessage: 'Available for AI & Automation Systems',
    heroGradient: 'neon',
  },
};

/** Normalize gallery array so legacy string URLs and rich objects work seamlessly */
export function normalizeGallery(rawGallery: any): PortfolioGalleryItem[] {
  if (!Array.isArray(rawGallery) || rawGallery.length === 0) {
    return DEFAULT_GALLERY_ITEMS;
  }

  return rawGallery
    .map((item, idx) => {
      if (typeof item === 'string') {
        const cleanUrl = item.trim();
        if (!cleanUrl) return null;
        return {
          id: `gal-migrated-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          url: cleanUrl,
          title: `Campus Media #${idx + 1}`,
          category: 'Campus',
          caption: '',
          featured: idx === 0,
        };
      }
      if (item && typeof item === 'object' && item.url) {
        return {
          id: item.id || `gal-${idx}-${uid()}`,
          url: item.url,
          title: item.title || '',
          category: item.category || 'Campus',
          caption: item.caption || '',
          featured: Boolean(item.featured),
          date: item.date || '',
        };
      }
      return null;
    })
    .filter(Boolean) as PortfolioGalleryItem[];
}

function migrate(raw: any): PortfolioData {
  const base = { ...DEFAULT_PORTFOLIO, ...(raw ?? {}) };
  base.achievements = Array.isArray(raw?.achievements) ? raw.achievements : DEFAULT_PORTFOLIO.achievements;
  base.skills = Array.isArray(raw?.skills) ? raw.skills : DEFAULT_PORTFOLIO.skills;
  base.gallery = normalizeGallery(raw?.gallery);
  base.socials = { ...DEFAULT_PORTFOLIO.socials, ...(raw?.socials ?? {}) };
  base.settings = { ...DEFAULT_PORTFOLIO.settings, ...(raw?.settings ?? {}) };
  
  base.projects = (Array.isArray(raw?.projects) && raw.projects.length > 0 ? raw.projects : DEFAULT_PORTFOLIO.projects).map((p: any) => ({
    id: p.id ?? uid(),
    title: p.title ?? '',
    description: p.description ?? '',
    stack: p.stack ?? '',
    image: p.image ?? '',
    link: p.link ?? '',
    githubUrl: p.githubUrl ?? '',
    year: p.year ?? '',
    tags: Array.isArray(p.tags) ? p.tags : [],
    featured: Boolean(p.featured),
  }));

  base.members = (Array.isArray(raw?.members) && raw.members.length > 0 ? raw.members : DEFAULT_PORTFOLIO.members).map((m: any) => {
    let img = m.image ?? '';
    const norm = (m.name || '').toLowerCase();
    if (!img || img.includes('.asset.json') || img.startsWith('/__l5e/')) {
      if (norm.includes('gaurav')) img = gauravPhoto;
      else if (norm.includes('swami') || norm.includes('anant')) img = swamiAnantVyasPhoto;
      else if (norm.includes('jatin')) img = jatinDhamaPhoto;
    }
    return {
      id: m.id ?? uid(),
      name: m.name ?? '',
      role: m.role ?? '',
      bio: m.bio ?? '',
      details: m.details ?? '',
      image: img,
    };
  });

  return base as PortfolioData;
}

/** Read-only hook for public surfaces (Home, About Me, Portfolio). Subscribes to realtime updates & local sync. */
export function usePortfolioData() {
  const [data, setData] = useState<PortfolioData>(() => {
    try {
      const cached = localStorage.getItem('gaurav_portfolio_cache');
      if (cached) return migrate(JSON.parse(cached));
    } catch {
      /* ignore */
    }
    return DEFAULT_PORTFOLIO;
  });
  const [loading, setLoading] = useState(true);

  const fetchOnce = useCallback(async () => {
    try {
      const { data: row } = await supabase
        .from('attendance_settings')
        .select('value')
        .eq('key', PORTFOLIO_KEY)
        .maybeSingle();
      if (row?.value) {
        try {
          const parsed = migrate(JSON.parse(row.value));
          setData(parsed);
          localStorage.setItem('gaurav_portfolio_cache', JSON.stringify(parsed));
        } catch {
          /* keep defaults */
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOnce();

    // Local instant updates from studio
    const onLocalUpdate = (e: CustomEvent<PortfolioData>) => {
      if (e.detail) setData(e.detail);
    };
    window.addEventListener('portfolio-updated', onLocalUpdate as EventListener);

    // Supabase realtime channel
    const channel = supabase
      .channel('portfolio-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_settings', filter: `key=eq.${PORTFOLIO_KEY}` },
        (payload) => {
          const raw = (payload.new as any)?.value ?? (payload.old as any)?.value;
          if (!raw) return;
          try {
            const parsed = migrate(JSON.parse(raw));
            setData(parsed);
            localStorage.setItem('gaurav_portfolio_cache', JSON.stringify(parsed));
          } catch {
            /* ignore */
          }
        },
      )
      .subscribe();

    return () => {
      window.removeEventListener('portfolio-updated', onLocalUpdate as EventListener);
      void supabase.removeChannel(channel);
    };
  }, [fetchOnce]);

  return { data, loading, refetch: fetchOnce };
}

export { uid as portfolioUid, migrate as migratePortfolioData };
