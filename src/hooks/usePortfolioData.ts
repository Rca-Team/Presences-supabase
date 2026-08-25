import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import gauravPhoto from '@/assets/gaurav-photo.png';
import swamiAnantVyasPhoto from '@/assets/swami-anant-vyas.png.asset.json';

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
  gallery: string[];
  projects: PortfolioProject[];
  members: PortfolioMember[];
  socials: PortfolioSocials;
};

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;

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
  ],
  skills: ['React', 'TypeScript', 'Supabase', 'Face Recognition', 'Realtime Systems'],
  gallery: [],
  projects: [
    {
      id: uid(),
      title: 'Presences Smart School Platform',
      description: 'Unified attendance, gate mode, analytics, and communication platform.',
      stack: 'React, TypeScript, Supabase, Face API',
      image: gauravPhoto,
      link: 'https://presences.dev',
      year: '2025',
      tags: ['React', 'Supabase', 'AI'],
    },
  ],
  members: [
    {
      id: uid(),
      name: 'Gaurav',
      role: 'Developer & Team Leader',
      image: gauravPhoto,
      bio: 'Creator of Presence Smart School automation. I build scalable attendance, security, and school workflow systems.',
      details: 'Full-stack engineer focused on face-recognition workflows and production-ready education systems.',
    },
    {
      id: uid(),
      name: 'Swami Anant Vyas',
      role: 'Hardware Prototype & Software Feedback',
      image: swamiAnantVyasPhoto.url,
      bio: 'Helped build the hardware prototype and contributed ideas for the software experience.',
      details: 'Built and validated early hardware concepts for gate mode.',
    },
    {
      id: uid(),
      name: 'Jatin Dhama',
      role: 'Team Member',
      image: '',
      bio: 'Contributes to system testing, execution support, and project coordination.',
      details: 'Supports feature QA and collaborative delivery.',
    },
  ],
  socials: { github: '', linkedin: '', twitter: '', instagram: '' },
};

function migrate(raw: any): PortfolioData {
  const base = { ...DEFAULT_PORTFOLIO, ...(raw ?? {}) };
  base.achievements = Array.isArray(raw?.achievements) ? raw.achievements : DEFAULT_PORTFOLIO.achievements;
  base.skills = Array.isArray(raw?.skills) ? raw.skills : DEFAULT_PORTFOLIO.skills;
  base.gallery = Array.isArray(raw?.gallery) ? raw.gallery : [];
  base.socials = { ...DEFAULT_PORTFOLIO.socials, ...(raw?.socials ?? {}) };
  base.projects = (Array.isArray(raw?.projects) ? raw.projects : DEFAULT_PORTFOLIO.projects).map((p: any) => ({
    id: p.id ?? uid(),
    title: p.title ?? '',
    description: p.description ?? '',
    stack: p.stack ?? '',
    image: p.image ?? '',
    link: p.link ?? '',
    githubUrl: p.githubUrl ?? '',
    year: p.year ?? '',
    tags: Array.isArray(p.tags) ? p.tags : [],
  }));
  base.members = (Array.isArray(raw?.members) ? raw.members : DEFAULT_PORTFOLIO.members).map((m: any) => ({
    id: m.id ?? uid(),
    name: m.name ?? '',
    role: m.role ?? '',
    bio: m.bio ?? '',
    details: m.details ?? '',
    image: m.image ?? '',
  }));
  return base as PortfolioData;
}

/** Read-only hook for public surfaces (Home, About Me). Subscribes to realtime updates. */
export function usePortfolioData() {
  const [data, setData] = useState<PortfolioData>(DEFAULT_PORTFOLIO);
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
          setData(migrate(JSON.parse(row.value)));
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
    const channel = supabase
      .channel('portfolio-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_settings', filter: `key=eq.${PORTFOLIO_KEY}` },
        (payload) => {
          const raw = (payload.new as any)?.value ?? (payload.old as any)?.value;
          if (!raw) return;
          try {
            setData(migrate(JSON.parse(raw)));
          } catch {
            /* ignore */
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchOnce]);

  return { data, loading, refetch: fetchOnce };
}

export { uid as portfolioUid, migrate as migratePortfolioData };
