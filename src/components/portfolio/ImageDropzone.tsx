import React, { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PORTFOLIO_BUCKET, PORTFOLIO_PREFIX } from '@/hooks/usePortfolioData';
import { UploadCloud, X, Loader2, ImagePlus, Link as LinkIcon, Sparkles, Wand2, Crop } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PhotoStudioModal } from '@/components/portfolio/PhotoStudioModal';
import gauravPhoto from '@/assets/gaurav-photo.png';
import swamiAnantVyasPhoto from '@/assets/swami-anant-vyas.png';
import jatinDhamaPhoto from '@/assets/jatin-dhama.jpg';
import { uploadPortfolioImage } from '@/utils/portfolioUploadHelper';

type Props = {
  value?: string;
  onChange: (url: string) => void;
  label?: string;
  aspect?: 'square' | 'video' | 'cover';
  className?: string;
  allowClear?: boolean;
};

const aspectClass: Record<NonNullable<Props['aspect']>, string> = {
  square: 'aspect-square',
  video: 'aspect-video',
  cover: 'aspect-[3/1]',
};

export function ImageDropzone({ value, onChange, label, aspect = 'square', className, allowClear = true }: Props) {
  const [dragging, setDragging] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = useCallback(
    (rawFile: File) => {
      if (!rawFile.type.startsWith('image/')) {
        toast({ title: 'Not an image', description: 'Please select a valid image file.', variant: 'destructive' });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setPendingImageUrl(reader.result);
          setStudioOpen(true);
        }
      };
      reader.readAsDataURL(rawFile);
    },
    [toast],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
    if (file) handleFileSelect(file);
  };

  const applyUrl = () => {
    if (!urlDraft.trim()) return;
    setPendingImageUrl(urlDraft.trim());
    setUrlDraft('');
    setShowUrlInput(false);
    setStudioOpen(true);
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1.5">
        {label ? <p className="text-xs font-semibold text-foreground">{label}</p> : <div />}
        <button
          type="button"
          onClick={() => setShowUrlInput(!showUrlInput)}
          className="text-[10px] font-medium text-primary hover:underline flex items-center gap-1"
        >
          <LinkIcon className="h-3 w-3" /> {showUrlInput ? 'Hide URL' : 'Paste Link'}
        </button>
      </div>

      {showUrlInput && (
        <div className="mb-2 p-2 rounded-lg border bg-card flex gap-1.5 items-center animate-in fade-in">
          <Input
            placeholder="https://example.com/photo.jpg"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            className="h-7 text-xs"
          />
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={applyUrl}>
            Apply
          </Button>
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onPaste={onPaste}
        className={cn(
          'group relative w-full overflow-hidden rounded-2xl border-2 border-dashed transition-all select-none',
          aspectClass[aspect],
          dragging
            ? 'border-primary bg-primary/15 scale-[1.01]'
            : 'border-border/70 bg-muted/20 hover:border-primary/50 hover:bg-muted/40',
          'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm',
        )}
      >
        {value && !imgError ? (
          <>
            <img
              src={value}
              alt={label ?? 'Preview'}
              onError={() => setImgError(true)}
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/65 opacity-0 backdrop-blur-xs transition-opacity group-hover:opacity-100 p-2 flex-wrap">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setStudioOpen(true);
                }}
                className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground shadow-md hover:bg-primary/90 flex items-center gap-1"
                title="Open Photo Styling & Resize Studio"
              >
                <Wand2 className="h-3 w-3" />
                Style
              </button>
              <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-slate-900 shadow">
                <ImagePlus className="mr-0.5 inline h-3 w-3" />
                Replace
              </span>
              {allowClear && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange('');
                  }}
                  className="rounded-full bg-destructive/95 px-2.5 py-1 text-[11px] font-bold text-destructive-foreground shadow hover:bg-destructive"
                >
                  <X className="mr-0.5 inline h-3 w-3" />
                  Remove
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-center text-muted-foreground">
            <UploadCloud className="h-6 w-6 text-primary/70" />
            <p className="text-xs font-semibold text-foreground">Drop image or click to browse</p>
            <p className="text-[10px] opacity-70">Supports JPG, PNG, WEBP, GIF</p>
          </div>
        )}
      </div>

      {/* Quick Action & Preset Selectors */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 mt-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[9px] text-muted-foreground mr-0.5">Presets:</span>
          <button
            type="button"
            onClick={() => onChange(gauravPhoto)}
            className="text-[10px] px-1.5 py-0.5 rounded-md border bg-card/60 hover:bg-card text-muted-foreground hover:text-foreground transition"
          >
            Gaurav
          </button>
          <button
            type="button"
            onClick={() => onChange(swamiAnantVyasPhoto)}
            className="text-[10px] px-1.5 py-0.5 rounded-md border bg-card/60 hover:bg-card text-muted-foreground hover:text-foreground transition"
          >
            Swami
          </button>
          <button
            type="button"
            onClick={() => onChange(jatinDhamaPhoto)}
            className="text-[10px] px-1.5 py-0.5 rounded-md border bg-card/60 hover:bg-card text-muted-foreground hover:text-foreground transition"
          >
            Jatin
          </button>
        </div>

        {value && (
          <button
            type="button"
            onClick={() => setStudioOpen(true)}
            className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
          >
            <Wand2 className="h-3 w-3" /> Style & Resize
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
          e.target.value = '';
        }}
      />

      {/* Photo Studio & Resize Modal */}
      {(pendingImageUrl || value) && (
        <PhotoStudioModal
          open={studioOpen}
          onOpenChange={(open) => {
            setStudioOpen(open);
            if (!open) setPendingImageUrl(null);
          }}
          imageUrl={pendingImageUrl || value || ''}
          defaultAspect={aspect === 'video' ? '16:9' : aspect === 'cover' ? '21:9' : '1:1'}
          onApply={(newUrl) => {
            onChange(newUrl);
            setPendingImageUrl(null);
          }}
          title={pendingImageUrl ? `Style & Frame ${label || 'Photo'}` : `Edit & Style ${label || 'Photo'}`}
        />
      )}
    </div>
  );
}

