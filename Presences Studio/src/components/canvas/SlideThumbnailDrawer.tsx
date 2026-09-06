import React from 'react';
import { Slide } from '../../types/smartboard';
import { Plus, Copy, Trash2, X, ChevronUp, ChevronDown } from 'lucide-react';

interface SlideThumbnailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  slides: Slide[];
  currentSlideIndex: number;
  onSelectSlide: (index: number) => void;
  onAddSlide: () => void;
  onDuplicateSlide: (index: number) => void;
  onDeleteSlide: (index: number) => void;
}

export const SlideThumbnailDrawer: React.FC<SlideThumbnailDrawerProps> = ({
  isOpen,
  onClose,
  slides,
  currentSlideIndex,
  onSelectSlide,
  onAddSlide,
  onDuplicateSlide,
  onDeleteSlide,
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute bottom-20 left-4 right-4 md:left-12 md:right-12 z-30 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-4 shadow-2xl animate-in slide-in-from-bottom-6 duration-200 select-none">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Lecture Slides ({slides.length})
          </span>
          <span className="text-[11px] text-slate-400">
            • Tap to jump, duplicate or organize
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onAddSlide}
            className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition shadow"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Slide</span>
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Horizontal Thumbnails Carousel */}
      <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {slides.map((slide, idx) => (
          <div
            key={slide.id}
            onClick={() => onSelectSlide(idx)}
            className={`relative flex-shrink-0 w-40 h-28 rounded-xl border-2 transition cursor-pointer p-2 flex flex-col justify-between group overflow-hidden ${
              idx === currentSlideIndex
                ? 'border-emerald-500 bg-slate-800/90 shadow-lg shadow-emerald-500/10'
                : 'border-slate-700/60 bg-slate-950/70 hover:border-slate-500'
            }`}
          >
            {/* Card Header */}
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className={idx === currentSlideIndex ? 'text-emerald-400' : 'text-slate-400'}>
                Slide {idx + 1}
              </span>
              <span className="text-[10px] text-slate-500">
                {slide.strokes.length} strokes
              </span>
            </div>

            {/* Thumbnail Preview Wireframe */}
            <div className="flex-1 my-1 rounded bg-slate-900/60 border border-slate-800 flex items-center justify-center text-[10px] text-slate-400">
              {slide.strokes.length > 0 ? (
                <span>📝 Drawn Content</span>
              ) : (
                <span className="opacity-50">Empty Slide</span>
              )}
            </div>

            {/* Action Buttons (Duplicate / Delete) */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
              <button
                onClick={(e) => { e.stopPropagation(); onDuplicateSlide(idx); }}
                title="Duplicate Slide"
                className="p-1 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition"
              >
                <Copy className="w-3 h-3" />
              </button>

              {slides.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteSlide(idx); }}
                  title="Delete Slide"
                  className="p-1 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded transition"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
