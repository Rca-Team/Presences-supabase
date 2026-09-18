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

export const AndroidWidgetDrawer: React.FC<AndroidWidgetDrawerProps> = ({
  isOpen,
  onClose,
  onAddWidget,
  onResetDefaults,
  existingWidgets,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'attendance' | 'classroom' | 'security' | 'tools'>('all');
  const [selectedEntry, setSelectedEntry] = useState<AndroidWidgetCatalogEntry | null>(ANDROID_WIDGET_CATALOG[0]);
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl rounded-3xl p-0 overflow-hidden border bg-card shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black tracking-tight text-white">
                  Android Widget Library
                </DialogTitle>
                <DialogDescription className="text-xs text-white/80 font-medium">
                  Material You interactive widgets for your classroom workspace
                </DialogDescription>
              </div>
            </div>

            <button
              type="button"
              onClick={onResetDefaults}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition-colors"
              title="Reset to default widget arrangement"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset Default
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
                    ? 'bg-white text-indigo-950 shadow-sm'
                    : 'bg-white/15 text-white/80 hover:bg-white/25'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {filteredCatalog.map((entry) => {
              const IconComp = ICON_MAP[entry.icon] || Sparkles;
              const isSelected = selectedEntry?.type === entry.type;
              const isAdded = existingWidgets.some((w) => w.type === entry.type);

              return (
                <div
                  key={entry.type}
                  onClick={() => handleSelectEntry(entry)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                    isSelected
                      ? 'bg-primary/5 border-primary shadow-md ring-2 ring-primary/20'
                      : 'bg-muted/30 hover:bg-muted/60 border-border/80'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                      <IconComp className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-extrabold text-foreground truncate">{entry.title}</h4>
                        {isAdded && (
                          <span className="h-2 w-2 rounded-full bg-emerald-500" title="Active on board" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{entry.description}</p>
                    </div>
                  </div>

                  {isSelected && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="pt-2 border-t border-border/60 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-muted-foreground">Select Grid Size:</span>
                        <div className="flex items-center gap-1">
                          {entry.supportedSizes.map((sz) => (
                            <button
                              key={sz}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setChosenSize(sz);
                              }}
                              className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                                chosenSize === sz
                                  ? 'bg-primary text-white border-primary'
                                  : 'bg-muted text-muted-foreground border-transparent hover:text-foreground'
                              }`}
                            >
                              {sz}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddCurrent();
                        }}
                        className="w-full py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold text-xs shadow-md shadow-primary/20 flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Plus className="h-4 w-4" /> Add Widget to Board ({chosenSize})
                      </button>
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
