import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  LayoutGrid,
  Layers,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Download,
  Copy,
  Check,
  X,
  ExternalLink,
  Plus,
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Image as ImageIcon,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import type { PortfolioGalleryItem } from '@/hooks/usePortfolioData';

export type GalleryVisualTheme = 'cyber' | 'royal' | 'crystal' | 'vintage';
export type LightboxFilter = 'normal' | 'cyberpunk' | 'golden' | 'vivid' | 'noir' | 'matrix';

const themeStyles: Record<GalleryVisualTheme, { card: string; overlay: string; badge: string; ring: string }> = {
  cyber: {
    card: 'border-cyan-500/30 hover:border-cyan-400/80 hover:shadow-cyan-500/20',
    overlay: 'from-black/90 via-cyan-950/30 to-transparent',
    badge: 'border-cyan-400/40 bg-cyan-950/85 text-cyan-300 shadow-cyan-500/20',
    ring: 'ring-cyan-500/30',
  },
  royal: {
    card: 'border-amber-500/35 hover:border-amber-400/90 hover:shadow-amber-500/25',
    overlay: 'from-black/90 via-amber-950/30 to-transparent',
    badge: 'border-amber-400/40 bg-amber-950/85 text-amber-300 shadow-amber-500/20',
    ring: 'ring-amber-500/30',
  },
  crystal: {
    card: 'border-white/30 hover:border-white/70 hover:shadow-white/15',
    overlay: 'from-black/90 via-slate-900/30 to-transparent',
    badge: 'border-white/30 bg-black/75 text-white shadow-white/10',
    ring: 'ring-white/30',
  },
  vintage: {
    card: 'border-orange-500/30 hover:border-orange-400/80 hover:shadow-orange-500/20',
    overlay: 'from-black/90 via-amber-950/40 to-transparent',
    badge: 'border-orange-400/40 bg-orange-950/85 text-orange-200 shadow-orange-500/20',
    ring: 'ring-orange-500/30',
  },
};

const filterCss: Record<LightboxFilter, string> = {
  normal: 'none',
  cyberpunk: 'contrast(120%) saturate(145%) hue-rotate(8deg)',
  golden: 'sepia(28%) contrast(110%) saturate(135%) brightness(102%)',
  vivid: 'contrast(125%) saturate(155%) brightness(104%)',
  noir: 'grayscale(100%) contrast(135%) brightness(95%)',
  matrix: 'hue-rotate(85deg) contrast(125%) saturate(160%)',
};

interface HomeGalleryProps {
  items: PortfolioGalleryItem[];
  defaultLayout?: 'bento' | 'grid' | 'carousel';
  title?: string;
  subtitle?: string;
  allowManage?: boolean;
  className?: string;
}

export function HomeGallery({
  items,
  defaultLayout = 'bento',
  title = 'Media & Campus Gallery',
  subtitle = 'Capturing the journey, AI deployments, team milestones, and campus life at KV NFC Vigyan Vihar.',
  allowManage = true,
  className,
}: HomeGalleryProps) {
  const [layout, setLayout] = useState<'bento' | 'grid' | 'carousel'>(defaultLayout);
  const [theme, setTheme] = useState<GalleryVisualTheme>('cyber');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxFilter, setLightboxFilter] = useState<LightboxFilter>('normal');
  const [copied, setCopied] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Extract unique categories from items
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      if (it.category?.trim()) set.add(it.category.trim());
    });
    return ['All', ...Array.from(set)];
  }, [items]);

  // Filter items by category
  const filteredItems = useMemo(() => {
    if (activeCategory === 'All') return items;
    return items.filter((it) => (it.category || 'Campus').toLowerCase() === activeCategory.toLowerCase());
  }, [items, activeCategory]);

  // Lightbox active item
  const activeLightboxItem = lightboxIndex !== null ? filteredItems[lightboxIndex] : null;

  const nextLightbox = useCallback(() => {
    if (lightboxIndex === null || filteredItems.length === 0) return;
    setZoomLevel(1);
    setLightboxIndex((prev) => (prev! + 1) % filteredItems.length);
  }, [lightboxIndex, filteredItems.length]);

  const prevLightbox = useCallback(() => {
    if (lightboxIndex === null || filteredItems.length === 0) return;
    setZoomLevel(1);
    setLightboxIndex((prev) => (prev! - 1 + filteredItems.length) % filteredItems.length);
  }, [lightboxIndex, filteredItems.length]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === 'ArrowRight') nextLightbox();
      if (e.key === 'ArrowLeft') prevLightbox();
      if (e.key === 'Escape') setLightboxIndex(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, nextLightbox, prevLightbox]);

  // Autoplay for carousel mode
  useEffect(() => {
    if (layout !== 'carousel' || !isPlaying || filteredItems.length <= 1) return;
    const interval = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % filteredItems.length);
    }, 3800);
    return () => clearInterval(interval);
  }, [layout, isPlaying, filteredItems.length]);

  const handleCopyUrl = (url: string) => {
    void navigator.clipboard.writeText(url);
    setCopied(true);
    toast({ title: 'Link copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (item: PortfolioGalleryItem) => {
    const link = document.createElement('a');
    link.href = item.url;
    link.download = `${item.title || 'campus-photo'}.png`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Downloading photo...' });
  };

  if (!items || items.length === 0) {
    return (
      <section className={cn('space-y-6', className)}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Media & Campus Gallery
            </div>
            <h2 className="mt-2 text-2xl sm:text-3xl md:text-4xl font-extrabold text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>
              {title}
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground max-w-xl">{subtitle}</p>
          </div>
          {allowManage && (
            <Button onClick={() => navigate('/portfolio')} className="rounded-2xl font-bold gap-2">
              <Plus className="h-4 w-4" /> Add Photos in Studio
            </Button>
          )}
        </div>

        <div className="rounded-3xl border border-dashed border-border/70 p-12 text-center bg-card/40 backdrop-blur-xl">
          <ImageIcon className="mx-auto h-12 w-12 text-primary/40 mb-3" />
          <h3 className="text-base font-bold text-foreground">Gallery is ready for photos</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
            Upload multiple photos in Portfolio Studio to create a showcase of campus life, AI gate tests, and awards.
          </p>
          {allowManage && (
            <Button size="sm" onClick={() => navigate('/portfolio')} className="mt-4 rounded-xl font-bold gap-1.5">
              Open Portfolio Studio <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className={cn('space-y-6', className)}>
      {/* 1. Header Bar: Title, Subtitle, Layout Switcher & Categories */}
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/15 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary shadow-xs">
            <Sparkles className="h-3.5 w-3.5" /> Media & Visual Showcase
          </div>
          <h2
            className="mt-2 text-2xl sm:text-3xl md:text-4xl font-extrabold text-foreground tracking-tight"
            style={{ fontFamily: 'Sora, sans-serif' }}
          >
            {title}
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        </div>

        {/* View Controls (Bento / Grid / Carousel), Theme Selector + Manage Studio Button */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Theme Preset Selector */}
          <div className="flex items-center rounded-2xl border border-border/70 bg-card/60 p-1 backdrop-blur-md shadow-xs">
            {(['cyber', 'royal', 'crystal', 'vintage'] as GalleryVisualTheme[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={cn(
                  'rounded-xl px-2.5 py-1 text-[11px] font-bold capitalize transition-all',
                  theme === t
                    ? 'bg-primary/20 text-primary border border-primary/30 shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                title={`${t} visual style theme`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex items-center rounded-2xl border border-border/70 bg-card/60 p-1 backdrop-blur-md shadow-xs">
            <button
              type="button"
              onClick={() => setLayout('bento')}
              className={cn(
                'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition',
                layout === 'bento'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              title="Bento Masonry View"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Bento</span>
            </button>

            <button
              type="button"
              onClick={() => setLayout('grid')}
              className={cn(
                'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition',
                layout === 'grid'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              title="Uniform Grid View"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Grid</span>
            </button>

            <button
              type="button"
              onClick={() => setLayout('carousel')}
              className={cn(
                'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition',
                layout === 'carousel'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              title="Cinematic Carousel View"
            >
              <Play className="h-3.5 w-3.5" />
              <span>Cinematic</span>
            </button>
          </div>

          {allowManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/portfolio')}
              className="rounded-2xl border-primary/30 bg-card/50 text-xs font-bold gap-1.5 hover:border-primary/60 hover:bg-card"
            >
              <ImageIcon className="h-3.5 w-3.5 text-primary" /> Manage Gallery
            </Button>
          )}
        </div>
      </div>

      {/* 2. Interactive Category Filter Chips */}
      {categories.length > 2 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {categories.map((cat) => {
            const count =
              cat === 'All'
                ? items.length
                : items.filter((it) => (it.category || 'Campus').toLowerCase() === cat.toLowerCase()).length;
            const isSelected = activeCategory === cat;

            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setActiveCategory(cat);
                  setCarouselIndex(0);
                }}
                className={cn(
                  'flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold transition-all',
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-[1.02]'
                    : 'border border-border/70 bg-card/50 text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-card/80',
                )}
              >
                <span>{cat}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.2 text-[10px]',
                    isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* 3. Main Gallery Layout Display */}
      {filteredItems.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border/60 p-10 text-center bg-card/40">
          <p className="text-sm font-semibold text-muted-foreground">No photos found in category "{activeCategory}"</p>
        </div>
      ) : layout === 'bento' ? (
        /* ------------------------------------------------------------------ */
        /* BENTO MASONRY VIEW                                                 */
        /* ------------------------------------------------------------------ */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 auto-rows-[220px]">
          {filteredItems.map((item, idx) => {
            // Determine bento sizing: First item or items with featured=true span 2 columns & rows
            const isBig = item.featured || idx === 0 || (idx === 4 && filteredItems.length > 5);

            return (
              <motion.div
                key={item.id}
                layout
                whileHover={{ y: -5, scale: 1.015 }}
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                onClick={() => {
                  setZoomLevel(1);
                  setLightboxIndex(idx);
                }}
                className={cn(
                  'group relative overflow-hidden rounded-3xl border bg-card/70 shadow-xl backdrop-blur-xl cursor-pointer transition-all duration-300',
                  themeStyles[theme].card,
                  isBig ? 'sm:col-span-2 sm:row-span-2 min-h-[300px]' : 'col-span-1 row-span-1',
                )}
              >
                <img
                  src={item.url}
                  alt={item.title || 'Campus photo'}
                  className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                  loading="lazy"
                />

                {/* Dynamic Theme Gradient Overlay */}
                <div className={cn('pointer-events-none absolute inset-0 bg-gradient-to-t opacity-85 group-hover:opacity-95 transition-opacity', themeStyles[theme].overlay)} />

                {/* Sweeping Light Sheen Reflection on Hover */}
                <div className="pointer-events-none absolute -inset-full bg-gradient-to-r from-transparent via-white/20 to-transparent -rotate-45 translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out" />

                {/* Top Badges */}
                <div className="absolute left-3.5 top-3.5 right-3.5 flex items-center justify-between">
                  {item.category && (
                    <span className={cn('rounded-full border px-3 py-0.5 text-[10px] font-black uppercase tracking-wider backdrop-blur-md shadow-xs', themeStyles[theme].badge)}>
                      {item.category}
                    </span>
                  )}
                  <span className="rounded-full bg-black/60 p-2 text-white/90 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md shadow-md">
                    <Maximize2 className="h-3.5 w-3.5" />
                  </span>
                </div>

                {/* Bottom Content Bar */}
                <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                  <h3 className={cn('font-bold text-white transition-colors group-hover:text-primary', isBig ? 'text-lg sm:text-xl' : 'text-sm')}>
                    {item.title || 'Presences Campus Moment'}
                  </h3>
                  {item.caption && (
                    <p className={cn('mt-1 line-clamp-2 text-white/80 font-medium leading-relaxed', isBig ? 'text-xs sm:text-sm' : 'text-[11px]')}>
                      {item.caption}
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : layout === 'grid' ? (
        /* ------------------------------------------------------------------ */
        /* UNIFORM GRID VIEW                                                  */
        /* ------------------------------------------------------------------ */
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filteredItems.map((item, idx) => (
            <motion.div
              key={item.id}
              whileHover={{ y: -4, scale: 1.03 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              onClick={() => {
                setZoomLevel(1);
                setLightboxIndex(idx);
              }}
              className={cn(
                'group relative aspect-square overflow-hidden rounded-2xl border bg-card/70 shadow-lg backdrop-blur-md cursor-pointer flex flex-col justify-between transition-all duration-300',
                themeStyles[theme].card,
              )}
            >
              <img
                src={item.url}
                alt={item.title || 'Gallery item'}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
              />

              <div className={cn('pointer-events-none absolute inset-0 bg-gradient-to-t opacity-70 group-hover:opacity-100 transition-opacity', themeStyles[theme].overlay)} />

              {/* Sweeping Light Sheen */}
              <div className="pointer-events-none absolute -inset-full bg-gradient-to-r from-transparent via-white/20 to-transparent -rotate-45 translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out" />

              <div className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white/90 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md shadow-md">
                <Maximize2 className="h-3 w-3" />
              </div>

              <div className="absolute inset-x-0 bottom-0 p-3">
                {item.category && (
                  <span className={cn('inline-block text-[9px] font-extrabold uppercase tracking-wider rounded-md px-1.5 py-0.5 mb-1', themeStyles[theme].badge)}>
                    {item.category}
                  </span>
                )}
                <p className="truncate text-xs font-bold text-white group-hover:text-primary transition-colors">
                  {item.title || 'Campus Moment'}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        /* ------------------------------------------------------------------ */
        /* CINEMATIC CAROUSEL VIEW                                            */
        /* ------------------------------------------------------------------ */
        <div className="space-y-4">
          {filteredItems[carouselIndex] && (
            <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-card/70 shadow-2xl backdrop-blur-2xl">
              <div
                className="relative aspect-video sm:aspect-[21/9] w-full overflow-hidden cursor-pointer bg-black/40"
                onClick={() => {
                  setZoomLevel(1);
                  setLightboxIndex(carouselIndex);
                }}
              >
                <img
                  src={filteredItems[carouselIndex].url}
                  alt={filteredItems[carouselIndex].title || 'Slide'}
                  className="h-full w-full object-cover transition-all duration-700"
                />

                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

                {/* Slide Caption Overlay */}
                <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 flex items-end justify-between gap-4">
                  <div className="max-w-2xl">
                    {filteredItems[carouselIndex].category && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-black/60 px-3 py-1 text-xs font-black uppercase tracking-wider text-amber-300 backdrop-blur-md">
                        {filteredItems[carouselIndex].category}
                      </span>
                    )}
                    <h3
                      className="mt-2 text-xl sm:text-2xl md:text-3xl font-extrabold text-white"
                      style={{ fontFamily: 'Sora, sans-serif' }}
                    >
                      {filteredItems[carouselIndex].title || 'Presences Campus Life'}
                    </h3>
                    {filteredItems[carouselIndex].caption && (
                      <p className="mt-1.5 text-xs sm:text-sm text-white/80 leading-relaxed line-clamp-2">
                        {filteredItems[carouselIndex].caption}
                      </p>
                    )}
                  </div>

                  <span className="rounded-full bg-black/60 px-3.5 py-1 text-xs font-mono font-bold text-white backdrop-blur-md">
                    {carouselIndex + 1} / {filteredItems.length}
                  </span>
                </div>
              </div>

              {/* Slide Navigation Buttons */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCarouselIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-2xl bg-black/60 p-3 text-white hover:bg-black/80 hover:text-primary transition backdrop-blur-md shadow-lg"
                aria-label="Previous Slide"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCarouselIndex((prev) => (prev + 1) % filteredItems.length);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-2xl bg-black/60 p-3 text-white hover:bg-black/80 hover:text-primary transition backdrop-blur-md shadow-lg"
                aria-label="Next Slide"
              >
                <ChevronRight className="h-5 w-5" />
              </button>

              {/* Autoplay play/pause toggle */}
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                className="absolute top-4 right-4 rounded-xl bg-black/60 p-2 text-white/90 hover:text-white transition backdrop-blur-md"
                title={isPlaying ? 'Pause slideshow' : 'Play slideshow'}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
            </div>
          )}

          {/* Thumbnail Carousel Strip */}
          <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none">
            {filteredItems.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCarouselIndex(idx)}
                className={cn(
                  'relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border-2 transition-all',
                  carouselIndex === idx
                    ? 'border-primary ring-2 ring-primary/40 scale-105 opacity-100'
                    : 'border-transparent opacity-60 hover:opacity-100',
                )}
              >
                <img src={item.url} alt="thumbnail" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4. Rich Fullscreen Lightbox Modal */}
      <Dialog
        open={lightboxIndex !== null}
        onOpenChange={(open) => {
          if (!open) {
            setLightboxIndex(null);
            setZoomLevel(1);
          }
        }}
      >
        <DialogContent className="max-w-5xl rounded-3xl border border-white/20 bg-background/95 p-0 backdrop-blur-2xl overflow-hidden shadow-2xl">
          <DialogTitle className="sr-only">
            {activeLightboxItem?.title || 'Campus Image Lightbox'}
          </DialogTitle>
          {activeLightboxItem && (
            <div className="relative flex flex-col max-h-[90vh]">
              {/* Header Top Controls */}
              <div className="flex items-center justify-between p-4 border-b border-border/40 bg-card/60 backdrop-blur-md">
                <div className="flex items-center gap-2 min-w-0">
                  {activeLightboxItem.category && (
                    <span className="rounded-full bg-primary/15 border border-primary/30 px-3 py-0.5 text-xs font-bold text-primary">
                      {activeLightboxItem.category}
                    </span>
                  )}
                  <p className="truncate text-sm sm:text-base font-bold text-foreground">
                    {activeLightboxItem.title || 'Campus Media'}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Zoom Controls */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 rounded-xl"
                    onClick={() => setZoomLevel((z) => Math.min(z + 0.3, 2.5))}
                    title="Zoom in"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 rounded-xl"
                    onClick={() => setZoomLevel((z) => Math.max(z - 0.3, 0.7))}
                    title="Zoom out"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 rounded-xl"
                    onClick={() => setZoomLevel(1)}
                    title="Reset zoom"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>

                  {/* Copy Link */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 rounded-xl"
                    onClick={() => handleCopyUrl(activeLightboxItem.url)}
                    title="Copy image link"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </Button>

                  {/* Download */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 rounded-xl"
                    onClick={() => handleDownload(activeLightboxItem)}
                    title="Download high-res photo"
                  >
                    <Download className="h-4 w-4" />
                  </Button>

                  {/* Close button */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 rounded-xl hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setLightboxIndex(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Lightbox Filter Bar */}
              <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-white/10 backdrop-blur-md overflow-x-auto gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground shrink-0">
                  Image Filter:
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {(['normal', 'cyberpunk', 'golden', 'vivid', 'noir', 'matrix'] as LightboxFilter[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setLightboxFilter(f)}
                      className={cn(
                        'rounded-lg px-2.5 py-0.5 text-[10px] font-bold capitalize transition-all',
                        lightboxFilter === f
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white',
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Image Stage */}
              <div className="relative flex-1 min-h-[350px] max-h-[65vh] flex items-center justify-center p-4 bg-black/80 overflow-hidden">
                <motion.img
                  key={activeLightboxItem.id}
                  src={activeLightboxItem.url}
                  alt={activeLightboxItem.title || 'Lightbox photo'}
                  className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-2xl transition-all duration-300 select-none"
                  style={{
                    transform: `scale(${zoomLevel})`,
                    filter: filterCss[lightboxFilter],
                  }}
                  drag={zoomLevel > 1}
                  dragConstraints={{ left: -300, right: 300, top: -300, bottom: 300 }}
                />

                {/* Left & Right Nav arrows */}
                {filteredItems.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={prevLightbox}
                      className="absolute left-4 top-1/2 -translate-y-1/2 rounded-2xl bg-black/70 p-3 text-white hover:bg-black/90 hover:text-primary transition backdrop-blur-md shadow-xl"
                      aria-label="Previous photo"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </button>

                    <button
                      type="button"
                      onClick={nextLightbox}
                      className="absolute right-4 top-1/2 -translate-y-1/2 rounded-2xl bg-black/70 p-3 text-white hover:bg-black/90 hover:text-primary transition backdrop-blur-md shadow-xl"
                      aria-label="Next photo"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </button>
                  </>
                )}
              </div>

              {/* Footer Details */}
              <div className="p-4 sm:p-5 border-t border-border/40 bg-card/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-bold text-foreground">
                    {activeLightboxItem.title || 'Presences Media Item'}
                  </p>
                  {activeLightboxItem.caption && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {activeLightboxItem.caption}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {activeLightboxItem.date && (
                    <span className="text-xs font-mono text-muted-foreground">
                      {activeLightboxItem.date}
                    </span>
                  )}
                  <span className="rounded-full bg-muted/60 px-3 py-1 text-xs font-mono font-bold text-primary">
                    {lightboxIndex! + 1} of {filteredItems.length}
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
