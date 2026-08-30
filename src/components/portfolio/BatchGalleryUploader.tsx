import React, { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  PORTFOLIO_BUCKET,
  PORTFOLIO_PREFIX,
  portfolioUid,
  type PortfolioGalleryItem,
} from '@/hooks/usePortfolioData';
import {
  UploadCloud,
  X,
  Loader2,
  ImagePlus,
  Link as LinkIcon,
  Trash2,
  Sparkles,
  GripVertical,
  CheckSquare,
  Square,
  Star,
  StarOff,
  Filter,
  Plus,
  FileSpreadsheet,
  Layers,
  Wand2,
} from 'lucide-react';
import { PhotoStudioModal } from '@/components/portfolio/PhotoStudioModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import teamRcaPhoto from '@/assets/team-rca.jpg';
import gauravPhoto from '@/assets/gaurav-photo.png';
import swamiAnantVyasPhoto from '@/assets/swami-anant-vyas.png';
import jatinDhamaPhoto from '@/assets/jatin-dhama.jpg';
import { uploadPortfolioImage } from '@/utils/portfolioUploadHelper';

export const GALLERY_CATEGORIES = [
  'All',
  'Campus',
  'AI Tech',
  'Events',
  'Team',
  'Workshops',
  'Awards',
] as const;

interface Props {
  items: PortfolioGalleryItem[];
  onChange: (items: PortfolioGalleryItem[]) => void;
}

const readFileAsDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

function SortableGalleryCard({
  item,
  isSelected,
  onToggleSelect,
  onUpdate,
  onDelete,
}: {
  item: PortfolioGalleryItem;
  isSelected: boolean;
  onToggleSelect: () => void;
  onUpdate: (patch: Partial<PortfolioGalleryItem>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 20 : 1,
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          'group relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-card/70 backdrop-blur-md transition-all shadow-sm',
          isSelected ? 'border-primary ring-2 ring-primary/40 bg-primary/5' : 'border-border/60 hover:border-primary/40',
          item.featured && 'border-amber-400/50 ring-1 ring-amber-400/30',
        )}
      >
        {/* Top Control Overlay */}
        <div className="relative aspect-square w-full overflow-hidden bg-muted/40">
          <img
            src={item.url}
            alt={item.title || 'Gallery item'}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 opacity-70 group-hover:opacity-100 transition-opacity" />

          {/* Drag Handle & Checkbox */}
          <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
            <button
              type="button"
              onClick={onToggleSelect}
              className="rounded-lg bg-black/60 p-1 text-white hover:text-primary transition backdrop-blur-sm"
              title={isSelected ? 'Deselect' : 'Select'}
            >
              {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
            </button>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setStudioOpen(true)}
                className="rounded-lg bg-black/60 p-1 text-white hover:text-primary transition backdrop-blur-sm"
                title="Style & Resize Photo"
              >
                <Wand2 className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => onUpdate({ featured: !item.featured })}
                className={cn(
                  'rounded-lg p-1 transition backdrop-blur-sm',
                  item.featured ? 'bg-amber-400 text-black' : 'bg-black/60 text-white hover:text-amber-400',
                )}
                title={item.featured ? 'Featured in Bento' : 'Mark as Featured'}
              >
                <Star className="h-3.5 w-3.5 fill-current" />
              </button>

              <button
                type="button"
                {...attributes}
                {...listeners}
                className="rounded-lg bg-black/60 p-1 text-white/70 hover:text-white cursor-grab active:cursor-grabbing backdrop-blur-sm"
                title="Drag to reorder"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Category Tag pill */}
          {item.category && (
            <span className="absolute bottom-2 left-2 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-bold text-primary backdrop-blur-sm border border-primary/20">
              {item.category}
            </span>
          )}
        </div>

        {/* Info & Edit Footer */}
        <div className="p-3">
          <p className="truncate text-xs font-bold text-foreground">
            {item.title || 'Untitled Photo'}
          </p>
          {item.caption && (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
              {item.caption}
            </p>
          )}

          <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-border/40">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="text-[11px] font-bold text-primary hover:underline"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setStudioOpen(true)}
                className="text-[11px] font-bold text-muted-foreground hover:text-primary transition flex items-center gap-0.5"
                title="Photo Studio: Crop, Resize, Filters"
              >
                <Wand2 className="h-3 w-3" /> Style
              </button>
            </div>

            <button
              type="button"
              onClick={onDelete}
              className="text-muted-foreground hover:text-destructive transition p-1"
              title="Delete Photo"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Edit Details Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Edit Gallery Photo</DialogTitle>
            <DialogDescription>Add a title, category, and caption for the showcase.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl border bg-muted/40 group">
              <img src={item.url} alt="Preview" className="h-full w-full object-cover" />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setStudioOpen(true)}
                className="absolute bottom-2 right-2 rounded-xl text-xs font-bold gap-1 shadow-md bg-black/70 text-white hover:bg-black/90 backdrop-blur-md"
              >
                <Wand2 className="h-3.5 w-3.5 text-primary" /> Style & Resize
              </Button>
            </div>

            <div>
              <label className="text-xs font-bold">Title / Headline</label>
              <Input
                value={item.title || ''}
                onChange={(e) => onUpdate({ title: e.target.value })}
                placeholder="e.g. KV Vigyan Vihar Robotics Lab"
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-bold">Category</label>
              <Select
                value={item.category || 'Campus'}
                onValueChange={(val) => onUpdate({ category: val })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  {GALLERY_CATEGORIES.filter((c) => c !== 'All').map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-bold">Caption / Context</label>
              <Textarea
                rows={2}
                value={item.caption || ''}
                onChange={(e) => onUpdate({ caption: e.target.value })}
                placeholder="Short description shown in lightbox..."
                className="mt-1"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onUpdate({ featured: !item.featured })}
                className={cn('rounded-xl gap-1.5', item.featured && 'border-amber-400 text-amber-400')}
              >
                <Star className={cn('h-3.5 w-3.5', item.featured && 'fill-amber-400')} />
                {item.featured ? 'Featured on Top' : 'Mark as Featured'}
              </Button>

              <Button size="sm" onClick={() => setEditOpen(false)} className="rounded-xl">
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Photo Studio Modal */}
      {item.url && (
        <PhotoStudioModal
          open={studioOpen}
          onOpenChange={setStudioOpen}
          imageUrl={item.url}
          defaultAspect="16:9"
          onApply={(newUrl) => onUpdate({ url: newUrl })}
          title={`Style Photo: ${item.title || 'Campus Media'}`}
        />
      )}
    </>
  );
}

export function BatchGalleryUploader({ items, onChange }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [defaultCategory, setDefaultCategory] = useState<string>('Campus');

  // Multi-URL batch paste modal state
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [rawUrlsText, setRawUrlsText] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /* ------------------------------------------------------------------ */
  /* Upload logic (Multiple files concurrently / in batches)           */
  /* ------------------------------------------------------------------ */
  const handleUploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const validFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (validFiles.length === 0) {
        toast({
          title: 'No valid images',
          description: 'Please select valid image files (JPG, PNG, WEBP, GIF).',
          variant: 'destructive',
        });
        return;
      }

      setUploading(true);
      const total = validFiles.length;
      setUploadProgress({ current: 0, total, percent: 5 });

      const newItems: PortfolioGalleryItem[] = [];
      let completed = 0;

      for (const rawFile of validFiles) {
        try {
          const cleanName = rawFile.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
          const finalUrl = await uploadPortfolioImage(rawFile);

          newItems.push({
            id: portfolioUid(),
            url: finalUrl,
            title: cleanName.length > 2 ? cleanName : `Campus Photo #${items.length + completed + 1}`,
            category: defaultCategory || 'Campus',
            caption: '',
            featured: false,
            date: new Date().toLocaleDateString(),
          });
        } catch (err: any) {
          console.error('Error processing image:', rawFile.name, err);
        }

        completed++;
        setUploadProgress({
          current: completed,
          total,
          percent: Math.round((completed / total) * 100),
        });
      }

      setUploading(false);
      if (newItems.length > 0) {
        onChange([...items, ...newItems]);
        toast({
          title: `Added ${newItems.length} photos`,
          description: `All ${newItems.length} photos successfully added to the gallery.`,
        });
      }
    },
    [items, onChange, defaultCategory, toast],
  );

  /* ------------------------------------------------------------------ */
  /* Multi-URL batch paste handler                                      */
  /* ------------------------------------------------------------------ */
  const handleBatchUrlsSubmit = () => {
    const lines = rawUrlsText
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u) || u.startsWith('data:image/'));

    if (lines.length === 0) {
      toast({
        title: 'No valid URLs found',
        description: 'Please paste image links starting with http:// or https://',
        variant: 'destructive',
      });
      return;
    }

    const created: PortfolioGalleryItem[] = lines.map((url, i) => ({
      id: portfolioUid(),
      url,
      title: `Campus Media #${items.length + i + 1}`,
      category: defaultCategory || 'Campus',
      caption: '',
      featured: false,
      date: new Date().toLocaleDateString(),
    }));

    onChange([...items, ...created]);
    setRawUrlsText('');
    setUrlModalOpen(false);
    toast({
      title: `Added ${created.length} image URLs`,
      description: 'Photos added to gallery successfully.',
    });
  };

  /* ------------------------------------------------------------------ */
  /* Preset Demo Photos Adder                                           */
  /* ------------------------------------------------------------------ */
  const handleAddPresetPhotos = () => {
    const presets: PortfolioGalleryItem[] = [
      {
        id: portfolioUid(),
        url: teamRcaPhoto,
        title: 'Team RCA — Core Platform Architects',
        category: 'Team',
        caption: 'The core engineering & design team behind Presences AI.',
        featured: true,
      },
      {
        id: portfolioUid(),
        url: gauravPhoto,
        title: 'Gaurav Raj — Developer & Architect',
        category: 'Team',
        caption: 'Full-stack engineering & AI recognition workflows.',
        featured: false,
      },
      {
        id: portfolioUid(),
        url: swamiAnantVyasPhoto,
        title: 'Hardware & Smart Gate Prototyping',
        category: 'AI Tech',
        caption: 'Validating hardware gate sensors and live kiosk vision modes.',
        featured: false,
      },
      {
        id: portfolioUid(),
        url: jatinDhamaPhoto,
        title: 'Deployment & Quality Assurance',
        category: 'Team',
        caption: 'Testing attendance and gate flows in school environments.',
        featured: false,
      },
    ];

    onChange([...items, ...presets]);
    toast({ title: 'Preset media added', description: 'Sample campus and team photos populated.' });
  };

  /* ------------------------------------------------------------------ */
  /* Drag & Drop Re-ordering                                            */
  /* ------------------------------------------------------------------ */
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((it) => it.id === active.id);
    const newIndex = items.findIndex((it) => it.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(items, oldIndex, newIndex));
  };

  /* ------------------------------------------------------------------ */
  /* Bulk Select & Actions                                              */
  /* ------------------------------------------------------------------ */
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectAll = () => {
    if (selectedIds.length === filteredItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredItems.map((i) => i.id));
    }
  };

  const deleteSelected = () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} selected photos from gallery?`)) return;
    onChange(items.filter((it) => !selectedIds.includes(it.id)));
    setSelectedIds([]);
    toast({ title: 'Photos deleted', description: 'Selected photos removed.' });
  };

  const patchItem = (id: string, patch: Partial<PortfolioGalleryItem>) => {
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const deleteSingle = (id: string) => {
    onChange(items.filter((it) => it.id !== id));
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  };

  const filteredItems = items.filter((it) => {
    if (filterCategory === 'All') return true;
    return (it.category || 'Campus').toLowerCase() === filterCategory.toLowerCase();
  });

  return (
    <div className="space-y-6">
      {/* 1. Main Multi-Photo Upload Dropzone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) {
            void handleUploadFiles(e.dataTransfer.files);
          }
        }}
        className={cn(
          'group relative flex flex-col items-center justify-center rounded-3xl border-2 border-dashed p-8 text-center transition-all cursor-pointer select-none backdrop-blur-xl',
          dragging
            ? 'border-primary bg-primary/15 scale-[1.01]'
            : 'border-border/70 bg-card/50 hover:border-primary/60 hover:bg-card/80',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-md',
        )}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/15 text-primary border border-primary/20 mb-3 shadow-inner group-hover:scale-110 transition-transform">
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          ) : (
            <UploadCloud className="h-8 w-8" />
          )}
        </div>

        <h3 className="text-base sm:text-lg font-extrabold text-foreground">
          {uploading
            ? `Uploading ${uploadProgress.current} of ${uploadProgress.total} photos…`
            : 'Drop Multiple Photos Here or Click to Browse'}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground max-w-md leading-relaxed">
          Select or drag multiple images at once. Supports JPG, PNG, WEBP, and GIF formats.
        </p>

        {/* Realtime Upload Progress Bar */}
        {uploading && (
          <div className="mt-4 w-full max-w-md">
            <div className="flex items-center justify-between text-xs font-bold text-primary mb-1">
              <span>Uploading Media Queue…</span>
              <span>{uploadProgress.percent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-gradient-to-r from-primary via-accent to-primary transition-all duration-200"
                style={{ width: `${uploadProgress.percent}%` }}
              />
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              void handleUploadFiles(e.target.files);
            }
            e.target.value = '';
          }}
        />
      </div>

      {/* 2. Secondary Action Strip (Batch URL paste, Default Category, Preset Photos) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/60 p-3.5 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground">Default category for new uploads:</span>
          <Select value={defaultCategory} onValueChange={setDefaultCategory}>
            <SelectTrigger className="h-8 text-xs font-bold w-32 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GALLERY_CATEGORIES.filter((c) => c !== 'All').map((cat) => (
                <SelectItem key={cat} value={cat} className="text-xs">
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setUrlModalOpen(true)}
            className="h-8 rounded-xl text-xs font-bold gap-1.5"
          >
            <LinkIcon className="h-3.5 w-3.5" /> Paste Multiple Links
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleAddPresetPhotos}
            className="h-8 rounded-xl text-xs text-muted-foreground hover:text-primary gap-1"
          >
            <Sparkles className="h-3.5 w-3.5" /> Add Preset Samples
          </Button>
        </div>
      </div>

      {/* 3. Filter and Bulk Selection Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Category Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-muted/40 p-1 border">
          {GALLERY_CATEGORIES.map((cat) => {
            const count =
              cat === 'All'
                ? items.length
                : items.filter((it) => (it.category || 'Campus').toLowerCase() === cat.toLowerCase()).length;
            const active = filterCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setFilterCategory(cat)}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition',
                  active
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span>{cat}</span>
                <span className={cn('rounded-full px-1.5 py-0.2 text-[10px]', active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground')}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Bulk Action Controls */}
        {filteredItems.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={selectAll}
              className="h-8 rounded-xl text-xs font-semibold gap-1.5"
            >
              {selectedIds.length === filteredItems.length && filteredItems.length > 0 ? (
                <>
                  <CheckSquare className="h-3.5 w-3.5 text-primary" /> Deselect All
                </>
              ) : (
                <>
                  <Square className="h-3.5 w-3.5" /> Select All ({filteredItems.length})
                </>
              )}
            </Button>

            {selectedIds.length > 0 && (
              <Button
                size="sm"
                variant="destructive"
                onClick={deleteSelected}
                className="h-8 rounded-xl text-xs font-bold gap-1.5 shadow-sm"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete Selected ({selectedIds.length})
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 4. Sortable Grid of Photos */}
      {filteredItems.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={filteredItems.map((it) => it.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filteredItems.map((item) => (
                <SortableGalleryCard
                  key={item.id}
                  item={item}
                  isSelected={selectedIds.includes(item.id)}
                  onToggleSelect={() => toggleSelect(item.id)}
                  onUpdate={(patch) => patchItem(item.id, patch)}
                  onDelete={() => deleteSingle(item.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="rounded-3xl border border-dashed border-border/70 p-12 text-center bg-card/30">
          <Layers className="mx-auto h-10 w-10 text-muted-foreground/50 mb-2" />
          <h4 className="text-sm font-bold text-foreground">No photos found in "{filterCategory}"</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Drop photos or upload to start building your campus gallery showcase.
          </p>
        </div>
      )}

      {/* Batch URLs Paste Dialog */}
      <Dialog open={urlModalOpen} onOpenChange={setUrlModalOpen}>
        <DialogContent className="max-w-lg rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold flex items-center gap-2">
              <LinkIcon className="h-5 w-5 text-primary" /> Paste Multiple Image URLs
            </DialogTitle>
            <DialogDescription>
              Paste one URL per line (or separated by commas). All links will be imported into the gallery instantly.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <Textarea
              rows={6}
              value={rawUrlsText}
              onChange={(e) => setRawUrlsText(e.target.value)}
              placeholder="https://images.unsplash.com/photo-1...&#10;https://images.unsplash.com/photo-2...&#10;https://example.com/campus-gate.jpg"
              className="font-mono text-xs leading-relaxed"
            />

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground font-semibold">
                {rawUrlsText.split(/[\n,]+/).filter((u) => /^https?:\/\//i.test(u.trim())).length} valid links detected
              </span>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setUrlModalOpen(false)} className="rounded-xl">
                  Cancel
                </Button>
                <Button size="sm" onClick={handleBatchUrlsSubmit} className="rounded-xl font-bold">
                  Import Photos
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
