import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  X,
  Sparkles,
  BarChart3,
  Clock,
  QrCode,
  MessageSquare,
  Shuffle,
  Mic,
  Timer,
  ShieldAlert,
  Check,
  RotateCcw,
  Palette,
  Smartphone,
  Tv,
  CheckCircle2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  ANDROID_WIDGET_CATALOG,
  AndroidWidgetCatalogEntry,
  AndroidWidgetItem,
  AndroidWidgetSize,
  MaterialPalette,
  PALETTE_CLASSES,
  DEFAULT_ANDROID_WIDGETS,
} from './types';

interface AndroidWidgetDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onAddWidget: (entry: AndroidWidgetCatalogEntry, size: AndroidWidgetSize, palette: MaterialPalette) => void;
  onResetDefaults: () => void;
  existingWidgets: AndroidWidgetItem[];
}

const ICON_MAP: Record<string, React.ElementType> = {
  BarChart3,
  Clock,
  QrCode,
  MessageSquare,
  Shuffle,
  Mic,
  Timer,
  ShieldAlert,
};

const ALL_PALETTES: MaterialPalette[] = [
  'dynamic-blue',
  'dynamic-amber',
  'dynamic-emerald',
  'dynamic-purple',
  'dynamic-rose',
  'dynamic-slate',
];

export const AndroidWidgetDrawer: React.FC<AndroidWidgetDrawerProps> = ({
  isOpen,
  onClose,
  onAddWidget,
  onResetDefaults,
  existingWidgets,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'attendance' | 'classroom' | 'security' | 'tools'>('all');
  const [selectedEntry, setSelectedEntry] = useState<AndroidWidgetCatalogEntry>(ANDROID_WIDGET_CATALOG[0]);
  const [chosenSize, setChosenSize] = useState<AndroidWidgetSize>(ANDROID_WIDGET_CATALOG[0].defaultSize);
  const [chosenPalette, setChosenPalette] = useState<MaterialPalette>(ANDROID_WIDGET_CATALOG[0].defaultPalette);

  const filteredCatalog = ANDROID_WIDGET_CATALOG.filter((item) => {
    if (selectedCategory === 'all') return true;
    return item.category === selectedCategory;
  });

  const handleSelectEntry = (entry: AndroidWidgetCatalogEntry) => {
    setSelectedEntry(entry);
    setChosenSize(entry.defaultSize);
    setChosenPalette(entry.defaultPalette);
  };

  const handleAddCurrent = () => {
    if (!selectedEntry) return;
    onAddWidget(selectedEntry, chosenSize, chosenPalette);
    onClose();
  };

  const SelectedIcon = selectedEntry ? ICON_MAP[selectedEntry.icon] || Sparkles : Sparkles;
  const currentPaletteStyle = PALETTE_CLASSES[chosenPalette] || PALETTE_CLASSES['dynamic-blue'];
  const isAlreadyAdded = existingWidgets.some((w) => w.type === selectedEntry?.type);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] rounded-3xl p-0 overflow-hidden border bg-card shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-5 text-white shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
                <Smartphone className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-xl font-black tracking-tight text-white">
                    Device Widget Selector & Adder Studio
                  </DialogTitle>
                  <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-extrabold uppercase">
                    M3 Material You
                  </span>
                </div>
                <DialogDescription className="text-xs text-white/80 font-medium">
                  Add glanceable touch widgets & quick tools to your Android tablet, smart board, or phone
                </DialogDescription>
              </div>
            </div>

            <button
              type="button"
              onClick={onResetDefaults}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition-colors"
              title="Reset to default widget arrangement"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset Board
            </button>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 mt-4 overflow-x-auto no-scrollbar">
            {(['all', 'attendance', 'classroom', 'security', 'tools'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-bold capitalize transition-all shrink-0 ${
                  selectedCategory === cat
                    ? 'bg-white text-indigo-950 shadow-sm font-black'
                    : 'bg-white/15 text-white/80 hover:bg-white/25'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Body Split View: Left List, Right Live Customizer Studio */}
        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-hidden">
          {/* Left: Widget Selector Catalog */}
          <div className="md:col-span-6 p-4 space-y-2.5 overflow-y-auto border-r border-border/60 max-h-[55vh] md:max-h-[62vh]">
            <span className="text-[11px] font-black uppercase text-muted-foreground tracking-wider block px-1 mb-1">
              Select Widget to Customize ({filteredCatalog.length})
            </span>
            {filteredCatalog.map((entry) => {
              const IconComp = ICON_MAP[entry.icon] || Sparkles;
              const isSelected = selectedEntry?.type === entry.type;
              const onBoard = existingWidgets.some((w) => w.type === entry.type);

              return (
                <div
                  key={entry.type}
                  onClick={() => handleSelectEntry(entry)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-primary/10 border-primary shadow-md ring-2 ring-primary/20'
                      : 'bg-muted/30 hover:bg-muted/60 border-border/70'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border ${
                      isSelected ? 'bg-primary text-white border-primary' : 'bg-primary/10 text-primary border-primary/20'
                    }`}>
                      <IconComp className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-bold text-foreground truncate">{entry.title}</h4>
                        {onBoard && (
                          <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[9px] font-black border border-emerald-500/30">
                            On Board
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">{entry.description}</p>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded-lg bg-muted text-[10px] font-mono font-bold text-muted-foreground shrink-0">
                    {entry.defaultSize}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Right: Live Widget Preview & Config Studio */}
          <div className="md:col-span-6 p-4 md:p-5 flex flex-col justify-between overflow-y-auto max-h-[55vh] md:max-h-[62vh] bg-muted/10 space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                    Live Device Preview
                  </span>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-muted border">
                  Grid Size: {chosenSize}
                </span>
              </div>

              {/* Simulated Device Widget Preview Box */}
              <div className={`rounded-3xl border p-4 sm:p-5 shadow-lg ${currentPaletteStyle.bg} ${currentPaletteStyle.border} ${currentPaletteStyle.glow} transition-all relative overflow-hidden`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-white/20 dark:bg-black/20 flex items-center justify-center">
                      <SelectedIcon className="h-4 w-4 text-foreground" />
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${currentPaletteStyle.badge}`}>
                      {selectedEntry.title}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground">Preview Mode</span>
                </div>

                <p className="text-xs text-foreground/80 leading-relaxed font-medium">
                  {selectedEntry.description}
                </p>

                <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                  <span>Interactive touch-ready</span>
                  <span className="font-mono">{selectedEntry.category}</span>
                </div>
              </div>

              {/* Size Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Choose Grid Dimension</label>
                <div className="grid grid-cols-3 gap-2">
                  {selectedEntry.supportedSizes.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setChosenSize(sz)}
                      className={`py-2 px-3 rounded-xl text-xs font-mono font-extrabold border transition-all flex flex-col items-center gap-0.5 ${
                        chosenSize === sz
                          ? 'bg-primary text-white border-primary shadow-sm'
                          : 'bg-card hover:bg-muted text-muted-foreground border-border/80'
                      }`}
                    >
                      <span>{sz}</span>
                      <span className="text-[9px] font-normal opacity-80">
                        {sz === '1x1' ? 'Mini' : sz === '2x1' ? 'Wide Bar' : sz === '2x2' ? 'Standard Box' : sz === '4x2' ? 'Full Width' : 'Billboard'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Material You Palette Switcher */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Palette className="h-3.5 w-3.5 text-primary" /> Material You Palette
                  </label>
                  <span className="text-[11px] font-mono text-muted-foreground capitalize">
                    {chosenPalette.replace('dynamic-', '')}
                  </span>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {ALL_PALETTES.map((p) => {
                    const pStyle = PALETTE_CLASSES[p];
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setChosenPalette(p)}
                        className={`h-9 rounded-xl border-2 transition-all flex items-center justify-center ${pStyle.accent} ${
                          chosenPalette === p ? 'ring-2 ring-primary ring-offset-2 scale-105 shadow-md' : 'opacity-70 hover:opacity-100'
                        }`}
                        title={p}
                      >
                        {chosenPalette === p && <Check className="h-4 w-4 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Add to Board Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleAddCurrent}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-black text-sm shadow-xl shadow-indigo-500/25 flex items-center justify-center gap-2 transition-all active:scale-98"
              >
                <Plus className="h-4 w-4" /> Add Widget to Board ({chosenSize})
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
