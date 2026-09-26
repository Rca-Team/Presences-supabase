import React, { useRef, useState, useEffect, useCallback } from 'react';
import { 
  Pen, 
  Highlighter, 
  Eraser, 
  Trash2, 
  Download, 
  Undo2, 
  Check, 
  Maximize2,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface SmartBoardScratchpadProps {
  onClose?: () => void;
  className?: string;
}

const COLORS = [
  '#ffffff', // White
  '#facc15', // Yellow
  '#38bdf8', // Sky Blue
  '#4ade80', // Mint Green
  '#f87171', // Coral Red
  '#c084fc', // Purple
  '#fb923c', // Orange
];

export const SmartBoardScratchpad: React.FC<SmartBoardScratchpadProps> = ({ onClose, className }) => {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [color, setColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);

  // Setup Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      // Save current content
      const ctx = canvas.getContext('2d');
      let backup: ImageData | null = null;
      if (ctx && canvas.width > 0 && canvas.height > 0) {
        try {
          backup = ctx.getImageData(0, 0, canvas.width, canvas.height);
        } catch {}
      }

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Draw dark chalkboard background
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, rect.width, rect.height);

        if (backup) {
          try {
            ctx.putImageData(backup, 0, 0);
          } catch {}
        }
      }
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      const state = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setHistory((prev) => [...prev.slice(-15), state]);
    } catch {}
  }, []);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    saveHistory();
    const { x, y } = getCoordinates(e);

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = brushSize * 4;
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else if (tool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = brushSize * 3;
      ctx.strokeStyle = color;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
      ctx.lineWidth = brushSize;
      ctx.strokeStyle = color;
    }

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.closePath();
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const newHistory = [...history];
    const lastState = newHistory.pop();
    setHistory(newHistory);

    if (lastState) {
      ctx.putImageData(lastState, 0, 0);
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    saveHistory();
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, rect.width, rect.height);
    toast({ title: 'Scratchpad cleared' });
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = `smartboard-scratchpad-${Date.now()}.png`;
    link.click();
    toast({ title: 'Saved snapshot to device' });
  };

  return (
    <div className={cn("flex flex-col h-full w-full rounded-3xl overflow-hidden border border-white/10 bg-slate-900 shadow-2xl backdrop-blur-2xl", className)}>
      {/* Top Toolbar */}
      <div className="flex items-center justify-between gap-2 p-3 border-b border-white/10 bg-slate-950/80 shrink-0 flex-wrap">
        <div className="flex items-center gap-1 sm:gap-2">
          <Button
            size="sm"
            variant={tool === 'pen' ? 'default' : 'ghost'}
            className={cn("h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl gap-1 text-xs font-bold", tool === 'pen' && "bg-blue-600 text-white")}
            onClick={() => setTool('pen')}
          >
            <Pen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Pen</span>
          </Button>

          <Button
            size="sm"
            variant={tool === 'highlighter' ? 'default' : 'ghost'}
            className={cn("h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl gap-1 text-xs font-bold", tool === 'highlighter' && "bg-amber-500 text-slate-950")}
            onClick={() => setTool('highlighter')}
          >
            <Highlighter className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Highlight</span>
          </Button>

          <Button
            size="sm"
            variant={tool === 'eraser' ? 'default' : 'ghost'}
            className={cn("h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl gap-1 text-xs font-bold", tool === 'eraser' && "bg-rose-600 text-white")}
            onClick={() => setTool('eraser')}
          >
            <Eraser className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Eraser</span>
          </Button>
        </div>

        {/* Color Palette */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-2xl bg-white/5 border border-white/10">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => {
                setColor(c);
                if (tool === 'eraser') setTool('pen');
              }}
              style={{ backgroundColor: c }}
              className={cn(
                "h-5 w-5 sm:h-6 sm:w-6 rounded-full transition-transform flex items-center justify-center shadow-xs",
                color === c && tool !== 'eraser' ? "scale-115 ring-2 ring-white ring-offset-2 ring-offset-slate-950" : "opacity-75 hover:opacity-100"
              )}
            >
              {color === c && tool !== 'eraser' && <Check className="h-3 w-3 text-slate-950" />}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-xl text-slate-400 hover:text-white"
            onClick={handleUndo}
            disabled={history.length === 0}
            title="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-xl text-slate-400 hover:text-white"
            onClick={handleClear}
            title="Clear Scratchpad"
          >
            <Trash2 className="h-4 w-4 text-rose-400" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-xl text-slate-400 hover:text-white"
            onClick={handleDownload}
            title="Save PNG"
          >
            <Download className="h-4 w-4 text-emerald-400" />
          </Button>

          {onClose && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-xl text-slate-400 hover:text-white"
              onClick={onClose}
              title="Close Scratchpad"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Drawing Canvas Area */}
      <div className="flex-1 relative w-full h-full min-h-[300px] touch-none cursor-crosshair">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="absolute inset-0 w-full h-full block"
        />
      </div>
    </div>
  );
};
