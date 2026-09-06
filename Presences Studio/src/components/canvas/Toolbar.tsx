import React, { useState } from 'react';
import { ToolType, BackgroundTheme } from '../../types/smartboard';
import { 
  Pen, 
  Paintbrush, 
  Highlighter, 
  Sparkles, 
  Eraser, 
  Square, 
  Circle as CircleIcon, 
  Triangle, 
  ArrowRight, 
  MoveRight, 
  Grid, 
  Sliders, 
  Palette, 
  Layers, 
  Users, 
  LogOut, 
  Compass, 
  Maximize, 
  Minimize,
  Minus
} from 'lucide-react';

interface ToolbarProps {
  currentTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  currentColor: string;
  onSelectColor: (color: string) => void;
  strokeWidth: number;
  onSelectStrokeWidth: (width: number) => void;
  backgroundTheme: BackgroundTheme;
  onSelectBackground: (bg: BackgroundTheme) => void;
  onOpenStudentPicker: () => void;
  onOpenEndClass: () => void;
}

const COLOR_SWATCHES = [
  '#ffffff', // White
  '#ef4444', // Crimson Red
  '#38bdf8', // Cyan Blue
  '#facc15', // Golden Yellow
  '#4ade80', // Emerald Green
  '#c084fc', // Violet
  '#000000', // Black
];

const STROKE_WIDTHS = [2, 4, 8, 16];

export const Toolbar: React.FC<ToolbarProps> = ({
  currentTool,
  onSelectTool,
  currentColor,
  onSelectColor,
  strokeWidth,
  onSelectStrokeWidth,
  backgroundTheme,
  onSelectBackground,
  onOpenStudentPicker,
  onOpenEndClass,
}) => {
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showBgMenu, setShowBgMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-slate-900/95 backdrop-blur-xl px-4 py-2.5 rounded-2xl border border-slate-700/80 shadow-2xl select-none">
      
      {/* 1. Core Inking Tools */}
      <div className="flex items-center gap-1.5 pr-2 border-r border-slate-700/80">
        <button
          onClick={() => onSelectTool('pen')}
          title="Fine Stylus Pen"
          className={`p-2.5 rounded-xl transition ${
            currentTool === 'pen'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Pen className="w-5 h-5" />
        </button>

        <button
          onClick={() => onSelectTool('brush')}
          title="Calligraphy Brush"
          className={`p-2.5 rounded-xl transition ${
            currentTool === 'brush'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Paintbrush className="w-5 h-5" />
        </button>

        <button
          onClick={() => onSelectTool('highlighter')}
          title="Semi-Transparent Highlighter"
          className={`p-2.5 rounded-xl transition ${
            currentTool === 'highlighter'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Highlighter className="w-5 h-5" />
        </button>

        <button
          onClick={() => onSelectTool('laser')}
          title="Laser Lecture Pointer (Auto-fades in 2s)"
          className={`p-2.5 rounded-xl transition ${
            currentTool === 'laser'
              ? 'bg-red-600 text-white shadow-lg animate-pulse'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Sparkles className="w-5 h-5" />
        </button>

        <button
          onClick={() => onSelectTool('eraser')}
          title="Eraser (Palm / Stylus Erase)"
          className={`p-2.5 rounded-xl transition ${
            currentTool === 'eraser'
              ? 'bg-amber-600 text-white shadow-lg'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Eraser className="w-5 h-5" />
        </button>

        <button
          onClick={() => onSelectTool('text')}
          title="Text Tool (Click canvas to type)"
          className={`p-2.5 rounded-xl transition ${
            currentTool === 'text'
              ? 'bg-cyan-600 text-white shadow-lg'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <span className="font-extrabold text-sm leading-none px-1">T</span>
        </button>

        <button
          onClick={() => onSelectTool('pan')}
          title="Pan / Hand Tool"
          className={`p-2.5 rounded-xl transition ${
            currentTool === 'pan'
              ? 'bg-indigo-600 text-white shadow-lg'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <span className="text-sm">✋</span>
        </button>
      </div>

      {/* 2. Geometric Shapes Selector */}
      <div className="relative pr-2 border-r border-slate-700/80">
        <button
          onClick={() => setShowShapeMenu(!showShapeMenu)}
          title="Geometric Shapes & Axes"
          className={`p-2.5 rounded-xl transition flex items-center gap-1 ${
            ['line', 'arrow', 'double-arrow', 'dashed', 'rectangle', 'circle', 'triangle', 'axes'].includes(currentTool)
              ? 'bg-purple-600 text-white shadow-lg'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Square className="w-5 h-5" />
        </button>

        {showShapeMenu && (
          <div className="absolute bottom-16 left-0 bg-slate-900 border border-slate-700 p-2 rounded-2xl shadow-2xl flex flex-col gap-1.5 w-44 animate-in zoom-in-95">
            <button
              onClick={() => { onSelectTool('line'); setShowShapeMenu(false); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-xs font-medium text-slate-200"
            >
              <Minus className="w-4 h-4" /> Straight Line
            </button>
            <button
              onClick={() => { onSelectTool('arrow'); setShowShapeMenu(false); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-xs font-medium text-slate-200"
            >
              <ArrowRight className="w-4 h-4" /> Arrow Vector
            </button>
            <button
              onClick={() => { onSelectTool('double-arrow'); setShowShapeMenu(false); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-xs font-medium text-slate-200"
            >
              <MoveRight className="w-4 h-4" /> Double Arrow
            </button>
            <button
              onClick={() => { onSelectTool('rectangle'); setShowShapeMenu(false); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-xs font-medium text-slate-200"
            >
              <Square className="w-4 h-4" /> Rectangle
            </button>
            <button
              onClick={() => { onSelectTool('circle'); setShowShapeMenu(false); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-xs font-medium text-slate-200"
            >
              <CircleIcon className="w-4 h-4" /> Circle / Ellipse
            </button>
            <button
              onClick={() => { onSelectTool('triangle'); setShowShapeMenu(false); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-xs font-medium text-slate-200"
            >
              <Triangle className="w-4 h-4" /> Triangle
            </button>
            <button
              onClick={() => { onSelectTool('axes'); setShowShapeMenu(false); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-xs font-medium text-slate-200"
            >
              <Grid className="w-4 h-4" /> Cartesian X-Y Axes
            </button>
          </div>
        )}
      </div>

      {/* 3. Color Swatches & Thickness */}
      <div className="flex items-center gap-2 pr-2 border-r border-slate-700/80">
        <div className="flex items-center gap-1.5">
          {COLOR_SWATCHES.map(color => (
            <button
              key={color}
              onClick={() => onSelectColor(color)}
              style={{ backgroundColor: color }}
              className={`w-6 h-6 rounded-full border-2 transition ${
                currentColor.toLowerCase() === color.toLowerCase()
                  ? 'border-blue-400 scale-110 shadow'
                  : 'border-slate-700 hover:scale-105'
              }`}
            />
          ))}
        </div>

        {/* Thickness Selector */}
        <div className="flex items-center gap-1 ml-1 bg-slate-800/80 px-2 py-1 rounded-lg">
          {STROKE_WIDTHS.map(w => (
            <button
              key={w}
              onClick={() => onSelectStrokeWidth(w)}
              className={`w-5 h-5 rounded flex items-center justify-center transition ${
                strokeWidth === w ? 'bg-blue-600 text-white' : 'hover:bg-slate-700'
              }`}
            >
              <div
                style={{ width: `${Math.min(14, w * 1.2)}px`, height: `${Math.min(14, w * 1.2)}px` }}
                className="bg-current rounded-full"
              />
            </button>
          ))}
        </div>
      </div>

      {/* 4. Canvas Backgrounds */}
      <div className="relative pr-2 border-r border-slate-700/80">
        <button
          onClick={() => setShowBgMenu(!showBgMenu)}
          title="Board Background Style"
          className="p-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition"
        >
          <Layers className="w-5 h-5" />
        </button>

        {showBgMenu && (
          <div className="absolute bottom-16 left-0 bg-slate-900 border border-slate-700 p-2 rounded-2xl shadow-2xl flex flex-col gap-1.5 w-44 animate-in zoom-in-95">
            <button
              onClick={() => { onSelectBackground('chalkboard'); setShowBgMenu(false); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-xs font-medium text-emerald-400"
            >
              <div className="w-3.5 h-3.5 rounded bg-[#1a3c2c] border border-emerald-500/40" />
              Chalkboard Green
            </button>
            <button
              onClick={() => { onSelectBackground('slate'); setShowBgMenu(false); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-xs font-medium text-slate-300"
            >
              <div className="w-3.5 h-3.5 rounded bg-[#0d1117] border border-slate-700" />
              Dark Slate
            </button>
            <button
              onClick={() => { onSelectBackground('whiteboard'); setShowBgMenu(false); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-xs font-medium text-slate-200"
            >
              <div className="w-3.5 h-3.5 rounded bg-white border border-slate-400" />
              Whiteboard
            </button>
            <button
              onClick={() => { onSelectBackground('grid'); setShowBgMenu(false); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-xs font-medium text-cyan-300"
            >
              <Grid className="w-3.5 h-3.5" />
              Math Grid
            </button>
            <button
              onClick={() => { onSelectBackground('lined'); setShowBgMenu(false); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-xs font-medium text-blue-300"
            >
              <Minus className="w-3.5 h-3.5" />
              Lined Paper
            </button>
            <button
              onClick={() => { onSelectBackground('dots'); setShowBgMenu(false); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-xs font-medium text-slate-400"
            >
              <CircleIcon className="w-3.5 h-3.5" />
              Isometric Dots
            </button>
          </div>
        )}
      </div>

      {/* 5. Classroom Engagement & Management */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenStudentPicker}
          className="flex items-center gap-1.5 px-3 py-2 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-bold transition shadow"
        >
          <Users className="w-4 h-4" />
          <span>Pick Student</span>
        </button>

        <button
          onClick={onOpenEndClass}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-lg"
        >
          <LogOut className="w-4 h-4" />
          <span>Wrap Up Period</span>
        </button>

        <button
          onClick={toggleFullscreen}
          title="Fullscreen Mode"
          className="p-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition"
        >
          {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </button>
      </div>

    </div>
  );
};
