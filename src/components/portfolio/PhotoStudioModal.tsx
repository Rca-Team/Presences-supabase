import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Sliders,
  Crop,
  Layers,
  Wand2,
  Check,
  X,
  Loader2,
  Maximize2,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { uploadPortfolioImage } from '@/utils/portfolioUploadHelper';
import { useToast } from '@/hooks/use-toast';

export type AspectRatioPreset = '16:9' | '4:3' | '1:1' | '21:9' | '3:2' | 'free';
export type FilterPreset = 'normal' | 'cyberpunk' | 'royal' | 'vivid' | 'noir' | 'matrix' | 'sunset' | 'vintage';

interface PhotoStudioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  onApply: (newUrl: string) => void;
  defaultAspect?: '16:9' | '4:3' | '1:1' | '21:9' | '3:2' | 'free';
  title?: string;
}

const FILTER_PRESETS: { id: FilterPreset; name: string; icon: string; css: string; description: string }[] = [
  { id: 'normal', name: 'Original', icon: '✨', css: 'none', description: 'Natural photo colors' },
  { id: 'cyberpunk', name: 'Cyberpunk', icon: '⚡', css: 'contrast(125%) saturate(145%) hue-rotate(10deg)', description: 'High-contrast neon glow' },
  { id: 'royal', name: 'Royal Gold', icon: '👑', css: 'sepia(25%) contrast(115%) saturate(130%) brightness(102%)', description: 'Warm amber gold sheen' },
  { id: 'vivid', name: 'Vivid HDR', icon: '💎', css: 'contrast(120%) saturate(155%) brightness(104%)', description: 'Ultra-saturated punchy dynamic colors' },
  { id: 'noir', name: 'Noir Drama', icon: '🎬', css: 'grayscale(100%) contrast(140%) brightness(95%)', description: 'High-fashion monochrome contrast' },
  { id: 'matrix', name: 'Matrix Green', icon: '🌌', css: 'hue-rotate(85deg) contrast(130%) saturate(160%)', description: 'Sci-fi futuristic matrix glow' },
  { id: 'sunset', name: 'Sunset Glow', icon: '🌅', css: 'hue-rotate(-20deg) saturate(140%) contrast(110%)', description: 'Romantic warm evening tint' },
  { id: 'vintage', name: 'Vintage Film', icon: '🎞️', css: 'sepia(35%) brightness(95%) contrast(110%)', description: 'Classic retro film grain mood' },
];

export function PhotoStudioModal({
  open,
  onOpenChange,
  imageUrl,
  onApply,
  defaultAspect = '16:9',
  title = 'Photo Studio & Image Styling',
}: PhotoStudioModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'presets' | 'adjust' | 'crop'>('presets');
  
  // Transform states
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [aspect, setAspect] = useState<AspectRatioPreset>(defaultAspect);
  
  // Pan states
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  // Filter states
  const [selectedFilter, setSelectedFilter] = useState<FilterPreset>('normal');
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [sepia, setSepia] = useState(0);
  const [vignette, setVignette] = useState(false);

  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageObjRef = useRef<HTMLImageElement | null>(null);

  // Load Image Object on Mount/Change
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageObjRef.current = img;
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Reset to defaults
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setPanX(0);
    setPanY(0);
    setSelectedFilter('normal');
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setSepia(0);
    setVignette(false);
    setAspect(defaultAspect);
    toast({ title: 'Adjustments reset to original' });
  };

  // Compute CSS filter string for live preview
  const activeCssFilter = useCallback(() => {
    const preset = FILTER_PRESETS.find((p) => p.id === selectedFilter);
    let filterString = preset && preset.id !== 'normal' ? preset.css : '';
    
    // Combine custom adjustments
    const customParts: string[] = [];
    if (brightness !== 100) customParts.push(`brightness(${brightness}%)`);
    if (contrast !== 100) customParts.push(`contrast(${contrast}%)`);
    if (saturation !== 100) customParts.push(`saturate(${saturation}%)`);
    if (sepia > 0) customParts.push(`sepia(${sepia}%)`);

    if (customParts.length > 0) {
      filterString = filterString === 'none' ? customParts.join(' ') : `${filterString} ${customParts.join(' ')}`;
    }

    return filterString || 'none';
  }, [selectedFilter, brightness, contrast, saturation, sepia]);

  // Aspect ratio calculation
  const getAspectDimensions = (targetAspect: AspectRatioPreset) => {
    switch (targetAspect) {
      case '16:9': return { width: 1280, height: 720, ratioClass: 'aspect-video' };
      case '4:3': return { width: 1024, height: 768, ratioClass: 'aspect-[4/3]' };
      case '1:1': return { width: 800, height: 800, ratioClass: 'aspect-square' };
      case '21:9': return { width: 1260, height: 540, ratioClass: 'aspect-[21/9]' };
      case '3:2': return { width: 1200, height: 800, ratioClass: 'aspect-[3/2]' };
      default: return { width: 1200, height: 800, ratioClass: 'aspect-video' };
    }
  };

  // Render transformed image to Canvas and upload
  const handleApplyAndSave = async () => {
    if (!imageUrl) return;
    setSaving(true);

    try {
      const img = imageObjRef.current || new Image();
      if (!imageObjRef.current) {
        img.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = imageUrl;
        });
      }

      const canvas = document.createElement('canvas');
      const { width: targetW, height: targetH } = getAspectDimensions(aspect);
      canvas.width = targetW;
      canvas.height = targetH;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not initialize canvas');

      // 1. Clear background
      ctx.fillStyle = '#0a0a0c';
      ctx.fillRect(0, 0, targetW, targetH);

      // 2. Apply Filters
      ctx.filter = activeCssFilter();

      // 3. Transformations (Translate to center, Rotate, Flip, Scale)
      ctx.save();
      ctx.translate(targetW / 2 + (panX * targetW) / 100, targetH / 2 + (panY * targetH) / 100);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipH ? -zoom : zoom, flipV ? -zoom : zoom);

      // 4. Calculate cover dimensions
      const imgAspect = img.width / img.height;
      const targetAspectNum = targetW / targetH;
      let drawW: number, drawH: number;

      if (imgAspect > targetAspectNum) {
        drawH = targetH;
        drawW = targetH * imgAspect;
      } else {
        drawW = targetW;
        drawH = targetW / imgAspect;
      }

      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      // 5. Apply Vignette if enabled
      if (vignette) {
        const gradient = ctx.createRadialGradient(
          targetW / 2,
          targetH / 2,
          targetW * 0.3,
          targetW / 2,
          targetH / 2,
          targetW * 0.75
        );
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.65)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, targetW, targetH);
      }

      // 6. Convert Canvas to Blob & Upload to Storage
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.88);
      });

      if (!blob) throw new Error('Failed to generate image blob');

      const file = new File([blob], `styled-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const newCloudUrl = await uploadPortfolioImage(file);

      onApply(newCloudUrl);
      toast({
        title: 'Image Styled & Saved',
        description: 'New styled photo has been applied to the project.',
      });
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error applying photo edits:', err);
      toast({
        title: 'Styling failed',
        description: err?.message || 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const { ratioClass } = getAspectDimensions(aspect);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl rounded-3xl border border-white/20 bg-background/95 p-0 backdrop-blur-2xl overflow-hidden shadow-2xl">
        <DialogHeader className="p-5 border-b border-border/40 bg-card/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary/15 text-primary">
                <Wand2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Crop, resize, rotate, and apply cyber color grading to your photo.
                </DialogDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="rounded-xl text-xs gap-1.5 border-border/60 hover:bg-muted"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Reset
            </Button>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
          {/* Main Interactive Preview Canvas Stage */}
          <div className="lg:col-span-7 p-6 flex flex-col items-center justify-center bg-black/60 min-h-[340px] relative overflow-hidden border-b lg:border-b-0 lg:border-r border-border/40">
            {/* Aspect Frame Wrapper */}
            <div
              className={cn(
                'relative w-full max-w-md overflow-hidden rounded-2xl border-2 border-primary/50 shadow-2xl bg-black/80 flex items-center justify-center transition-all duration-300',
                ratioClass
              )}
            >
              {imageUrl ? (
                <div
                  className="h-full w-full relative flex items-center justify-center overflow-hidden"
                  style={{
                    transform: `translate(${panX}%, ${panY}%) scale(${zoom}) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                    transition: 'transform 0.15s ease-out',
                  }}
                >
                  <img
                    src={imageUrl}
                    alt="Editor preview"
                    className="h-full w-full object-cover select-none pointer-events-none"
                    style={{ filter: activeCssFilter() }}
                  />
                  {vignette && (
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.7)_100%)]" />
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No image to preview</p>
              )}

              {/* Aspect Ratio Badge */}
              <span className="absolute top-3 left-3 rounded-full bg-black/75 border border-white/20 px-2.5 py-0.5 text-[10px] font-mono font-bold text-amber-300 backdrop-blur-md">
                {aspect}
              </span>
            </div>

            {/* Quick Canvas Transform Controls Bar */}
            <div className="mt-4 flex items-center gap-1.5 bg-card/80 border border-white/10 rounded-2xl p-1.5 backdrop-blur-md shadow-md">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 rounded-xl"
                onClick={() => setRotation((r) => (r - 90) % 360)}
                title="Rotate 90° CCW"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 rounded-xl"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                title="Rotate 90° CW"
              >
                <RotateCw className="h-4 w-4" />
              </Button>
              <div className="h-4 w-px bg-border/60 mx-1" />
              <Button
                size="sm"
                variant="ghost"
                className={cn('h-8 w-8 p-0 rounded-xl', flipH && 'bg-primary/20 text-primary')}
                onClick={() => setFlipH(!flipH)}
                title="Flip Horizontal"
              >
                <FlipHorizontal className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={cn('h-8 w-8 p-0 rounded-xl', flipV && 'bg-primary/20 text-primary')}
                onClick={() => setFlipV(!flipV)}
                title="Flip Vertical"
              >
                <FlipVertical className="h-4 w-4" />
              </Button>
              <div className="h-4 w-px bg-border/60 mx-1" />
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 rounded-xl"
                onClick={() => setZoom((z) => Math.max(z - 0.2, 0.6))}
                title="Zoom Out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 rounded-xl"
                onClick={() => setZoom((z) => Math.min(z + 0.2, 3.0))}
                title="Zoom In"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Right Styling & Adjustment Tabs */}
          <div className="lg:col-span-5 p-5 flex flex-col justify-between bg-card/40">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
              <TabsList className="grid grid-cols-3 rounded-2xl bg-muted/60 p-1 mb-4">
                <TabsTrigger value="presets" className="rounded-xl text-xs font-bold gap-1">
                  <Sparkles className="h-3.5 w-3.5" /> Styles
                </TabsTrigger>
                <TabsTrigger value="adjust" className="rounded-xl text-xs font-bold gap-1">
                  <Sliders className="h-3.5 w-3.5" /> Tone
                </TabsTrigger>
                <TabsTrigger value="crop" className="rounded-xl text-xs font-bold gap-1">
                  <Crop className="h-3.5 w-3.5" /> Framing
                </TabsTrigger>
              </TabsList>

              {/* 1. Filter Presets Tab */}
              <TabsContent value="presets" className="space-y-3 focus:outline-none">
                <div className="grid grid-cols-2 gap-2.5 max-h-[260px] overflow-y-auto pr-1">
                  {FILTER_PRESETS.map((preset) => {
                    const isSelected = selectedFilter === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setSelectedFilter(preset.id)}
                        className={cn(
                          'flex flex-col items-start p-2.5 rounded-2xl border text-left transition-all duration-200',
                          isSelected
                            ? 'border-primary bg-primary/15 shadow-md shadow-primary/10 ring-1 ring-primary'
                            : 'border-border/60 bg-card/60 hover:border-primary/40 hover:bg-card'
                        )}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-base">{preset.icon}</span>
                          {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                        </div>
                        <p className="mt-1 font-bold text-xs text-foreground">{preset.name}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight line-clamp-1">
                          {preset.description}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setVignette(!vignette)}
                    className={cn(
                      'w-full flex items-center justify-between px-3.5 py-2 rounded-xl border text-xs font-bold transition-all',
                      vignette
                        ? 'border-primary/60 bg-primary/10 text-primary'
                        : 'border-border/60 bg-card/40 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <span>Vignette Border Shadow</span>
                    <Badge variant={vignette ? 'default' : 'outline'} className="text-[10px]">
                      {vignette ? 'ON' : 'OFF'}
                    </Badge>
                  </button>
                </div>
              </TabsContent>

              {/* 2. Manual Color & Tone Adjustments Tab */}
              <TabsContent value="adjust" className="space-y-4 focus:outline-none max-h-[280px] overflow-y-auto pr-1">
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <Label className="text-xs font-semibold">Brightness</Label>
                    <span className="font-mono text-muted-foreground">{brightness}%</span>
                  </div>
                  <Slider
                    min={50}
                    max={150}
                    step={1}
                    value={[brightness]}
                    onValueChange={([v]) => setBrightness(v)}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <Label className="text-xs font-semibold">Contrast</Label>
                    <span className="font-mono text-muted-foreground">{contrast}%</span>
                  </div>
                  <Slider
                    min={50}
                    max={175}
                    step={1}
                    value={[contrast]}
                    onValueChange={([v]) => setContrast(v)}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <Label className="text-xs font-semibold">Saturation</Label>
                    <span className="font-mono text-muted-foreground">{saturation}%</span>
                  </div>
                  <Slider
                    min={0}
                    max={200}
                    step={1}
                    value={[saturation]}
                    onValueChange={([v]) => setSaturation(v)}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <Label className="text-xs font-semibold">Warmth / Sepia</Label>
                    <span className="font-mono text-muted-foreground">{sepia}%</span>
                  </div>
                  <Slider
                    min={0}
                    max={80}
                    step={1}
                    value={[sepia]}
                    onValueChange={([v]) => setSepia(v)}
                  />
                </div>
              </TabsContent>

              {/* 3. Crop & Framing Tab */}
              <TabsContent value="crop" className="space-y-4 focus:outline-none">
                <div>
                  <Label className="text-xs font-bold mb-2 block">Aspect Ratio Preset</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['16:9', '4:3', '1:1', '21:9', '3:2', 'free'] as AspectRatioPreset[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setAspect(r)}
                        className={cn(
                          'rounded-xl py-2 text-xs font-bold uppercase transition-all',
                          aspect === r
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'border border-border/70 bg-card/60 text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <Label className="text-xs font-semibold">Scale / Zoom Level</Label>
                    <span className="font-mono text-muted-foreground">{zoom.toFixed(1)}x</span>
                  </div>
                  <Slider
                    min={0.6}
                    max={2.8}
                    step={0.1}
                    value={[zoom]}
                    onValueChange={([v]) => setZoom(v)}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <Label className="text-xs font-semibold">Horizontal Pan Offset</Label>
                    <span className="font-mono text-muted-foreground">{panX}%</span>
                  </div>
                  <Slider
                    min={-40}
                    max={40}
                    step={1}
                    value={[panX]}
                    onValueChange={([v]) => setPanX(v)}
                  />
                </div>
              </TabsContent>
            </Tabs>

            {/* Bottom Action Footer */}
            <div className="pt-4 border-t border-border/40 flex items-center justify-end gap-2.5">
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={saving}
                className="rounded-xl text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                onClick={handleApplyAndSave}
                disabled={saving || !imageUrl}
                className="rounded-xl text-xs font-bold gap-1.5 shadow-md shadow-primary/20"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing & Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" /> Apply & Save Styled Photo
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
