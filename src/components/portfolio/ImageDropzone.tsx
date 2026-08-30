import React, { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PORTFOLIO_BUCKET, PORTFOLIO_PREFIX } from '@/hooks/usePortfolioData';
import { UploadCloud, X, Loader2, ImagePlus, Link as LinkIcon, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const upload = useCallback(
    async (rawFile: File) => {
      if (!rawFile.type.startsWith('image/')) {
        toast({ title: 'Not an image', description: 'Please select a valid image file.', variant: 'destructive' });
        return;
      }
      setUploading(true);
      setProgress(25);
      setImgError(false);

      try {
        setProgress(60);
        const uploadedUrl = await uploadPortfolioImage(rawFile);
        onChange(uploadedUrl);
        setProgress(100);
        toast({ title: 'Photo updated' });
      } catch (e: any) {
        toast({ title: 'Upload failed', description: e?.message ?? 'Please try another image', variant: 'destructive' });
      } finally {
        setUploading(false);
        setTimeout(() => setProgress(0), 400);
      }
    },
    [onChange, toast],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
    if (file) void upload(file);
  };

  const applyUrl = () => {
    if (!urlDraft.trim()) return;
    setImgError(false);
    onChange(urlDraft.trim());
    setUrlDraft('');
    setShowUrlInput(false);
    toast({ title: 'Image URL applied' });
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
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 backdrop-blur-xs transition-opacity group-hover:opacity-100">
              <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-900 shadow">
                <ImagePlus className="mr-1 inline h-3.5 w-3.5" />
                Replace
              </span>
              {allowClear && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange('');
                  }}
                  className="rounded-full bg-destructive/95 px-3 py-1.5 text-xs font-bold text-destructive-foreground shadow hover:bg-destructive"
                >
                  <X className="mr-1 inline h-3.5 w-3.5" />
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

        {uploading && (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-background/95 px-3 py-2 border-t">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Preset Quick Selectors */}
      <div className="flex flex-wrap items-center gap-1 mt-1.5">
        <span className="text-[9px] text-muted-foreground mr-1">Presets:</span>
        <button
          type="button"
          onClick={() => onChange(gauravPhoto)}
          className="text-[10px] px-2 py-0.5 rounded-md border bg-card/60 hover:bg-card text-muted-foreground hover:text-foreground transition"
        >
          Gaurav
        </button>
        <button
          type="button"
          onClick={() => onChange(swamiAnantVyasPhoto)}
          className="text-[10px] px-2 py-0.5 rounded-md border bg-card/60 hover:bg-card text-muted-foreground hover:text-foreground transition"
        >
          Swami Anant
        </button>
        <button
          type="button"
          onClick={() => onChange(jatinDhamaPhoto)}
          className="text-[10px] px-2 py-0.5 rounded-md border bg-card/60 hover:bg-card text-muted-foreground hover:text-foreground transition"
        >
          Jatin Dhama
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

