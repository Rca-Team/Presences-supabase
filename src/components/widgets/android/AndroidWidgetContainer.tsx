import React from 'react';
import { motion } from 'framer-motion';
import { MoreHorizontal, Pin, PinOff, Trash2, Maximize2, Sparkles } from 'lucide-react';
import { AndroidWidgetItem, PALETTE_CLASSES, AndroidWidgetSize, MaterialPalette } from './types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AndroidWidgetContainerProps {
  widget: AndroidWidgetItem;
  isEditMode?: boolean;
  onUpdateWidget?: (id: string, updates: Partial<AndroidWidgetItem>) => void;
  onRemoveWidget?: (id: string) => void;
  children: React.ReactNode;
}

const SIZE_GRID_CLASSES: Record<AndroidWidgetSize, string> = {
  '1x1': 'col-span-1 sm:col-span-1 min-h-[150px]',
  '2x1': 'col-span-1 sm:col-span-2 min-h-[150px]',
  '2x2': 'col-span-1 sm:col-span-2 min-h-[230px]',
  '4x2': 'col-span-1 sm:col-span-2 lg:col-span-4 min-h-[230px]',
  '4x4': 'col-span-1 sm:col-span-2 lg:col-span-4 min-h-[420px]',
};

export const AndroidWidgetContainer: React.FC<AndroidWidgetContainerProps> = ({
  widget,
  isEditMode = false,
  onUpdateWidget,
  onRemoveWidget,
  children,
}) => {
  const palette = PALETTE_CLASSES[widget.palette] || PALETTE_CLASSES['dynamic-blue'];
  const sizeClass = SIZE_GRID_CLASSES[widget.size] || SIZE_GRID_CLASSES['2x2'];

  const availableSizes: AndroidWidgetSize[] = ['2x1', '2x2', '4x2'];
  const availablePalettes: MaterialPalette[] = [
    'dynamic-blue',
    'dynamic-amber',
    'dynamic-emerald',
    'dynamic-purple',
    'dynamic-rose',
    'dynamic-slate',
  ];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      className={`group relative overflow-hidden rounded-[28px] sm:rounded-[32px] border ${palette.border} ${palette.bg} p-4 sm:p-5 shadow-lg ${palette.glow} backdrop-blur-xl flex flex-col justify-between transition-all select-none ${sizeClass}`}
    >
      {/* Soft Material You top gloss reflex */}
      <span className="pointer-events-none absolute inset-x-8 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent" />

      {/* Widget Header Strip */}
      <div className="flex items-center justify-between gap-2 mb-2 relative z-10">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border shadow-xs ${palette.badge}`}>
            {widget.title}
          </span>
          {widget.pinned && (
            <Pin className="h-3 w-3 text-primary shrink-0 rotate-45" />
          )}
        </div>

        {/* Options & Resizer dropdown */}
        <div className="flex items-center gap-1 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                title="Widget options"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-2xl p-1.5 shadow-xl border bg-card">
              <DropdownMenuLabel className="text-xs font-bold text-muted-foreground px-2 py-1">
                Widget Size
              </DropdownMenuLabel>
              <div className="grid grid-cols-3 gap-1 px-1 py-1">
                {availableSizes.map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => onUpdateWidget?.(widget.id, { size: sz })}
                    className={`py-1 rounded-lg text-xs font-mono font-bold border transition-all ${
                      widget.size === sz
                        ? 'bg-primary text-white border-primary shadow-xs'
                        : 'bg-muted/50 hover:bg-muted text-muted-foreground border-transparent'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>

              <DropdownMenuSeparator className="my-1" />

              <DropdownMenuLabel className="text-xs font-bold text-muted-foreground px-2 py-1">
                Theme Palette
              </DropdownMenuLabel>
              <div className="grid grid-cols-6 gap-1 px-1 py-1">
                {availablePalettes.map((p) => {
                  const pStyle = PALETTE_CLASSES[p];
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => onUpdateWidget?.(widget.id, { palette: p })}
                      className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${pStyle.accent} ${
                        widget.palette === p ? 'ring-2 ring-primary ring-offset-2' : 'opacity-80'
                      }`}
                      title={p}
                    />
                  );
                })}
              </div>

              <DropdownMenuSeparator className="my-1" />

              <DropdownMenuItem
                onClick={() => onUpdateWidget?.(widget.id, { pinned: !widget.pinned })}
                className="text-xs font-semibold cursor-pointer rounded-xl flex items-center gap-2"
              >
                {widget.pinned ? (
                  <>
                    <PinOff className="h-3.5 w-3.5" /> Unpin from Top
                  </>
                ) : (
                  <>
                    <Pin className="h-3.5 w-3.5" /> Pin to Top
                  </>
                )}
              </DropdownMenuItem>

              {onRemoveWidget && (
                <DropdownMenuItem
                  onClick={() => onRemoveWidget(widget.id)}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 cursor-pointer rounded-xl flex items-center gap-2"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove Widget
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {isEditMode && onRemoveWidget && (
            <button
              type="button"
              onClick={() => onRemoveWidget(widget.id)}
              className="h-7 w-7 rounded-full bg-rose-500/15 text-rose-600 hover:bg-rose-500/25 flex items-center justify-center transition-colors"
              title="Remove widget"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Widget Dynamic Body */}
      <div className="flex-1 flex flex-col justify-center relative z-10">
        {children}
      </div>
    </motion.div>
  );
};
