import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  ToolType, 
  BackgroundTheme, 
  DrawingStroke, 
  Point, 
  StickyNote as StickyNoteType 
} from '../../types/smartboard';
import { 
  Undo, 
  Redo, 
  Trash2, 
  Ruler, 
  Maximize2, 
  Download, 
  Plus, 
  ChevronLeft, 
  ChevronRight,
  Sparkles,
  Grid,
  FileText,
  StickyNote as StickyIcon
} from 'lucide-react';

interface WhiteboardCanvasProps {
  currentTool: ToolType;
  currentColor: string;
  strokeWidth: number;
  backgroundTheme: BackgroundTheme;
  strokes: DrawingStroke[];
  onStrokesChange: (strokes: DrawingStroke[]) => void;
  stickyNotes: StickyNoteType[];
  onStickyNotesChange: (notes: StickyNoteType[]) => void;
  onClearCanvas: () => void;
  // Slide management
  currentPage: number;
  totalPages: number;
  onNextPage: () => void;
  onPrevPage: () => void;
  onAddPage: () => void;
  onExportPNG: () => void;
  onOpenQRShare: () => void;
}

export const WhiteboardCanvas: React.FC<WhiteboardCanvasProps> = ({
  currentTool,
  currentColor,
  strokeWidth,
  backgroundTheme,
  strokes,
  onStrokesChange,
  stickyNotes,
  onStickyNotesChange,
  onClearCanvas,
  currentPage,
  totalPages,
  onNextPage,
  onPrevPage,
  onAddPage,
  onExportPNG,
  onOpenQRShare,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Active inking state
  const isDrawingRef = useRef(false);
  const activeStrokeRef = useRef<DrawingStroke | null>(null);
  const activePointersRef = useRef<Map<number, Point>>(new Map());

  // History for undo/redo
  const [undoStack, setUndoStack] = useState<DrawingStroke[][]>([]);
  const [redoStack, setRedoStack] = useState<DrawingStroke[][]>([]);

  // Laser pointer temporary lines
  const [laserPoints, setLaserPoints] = useState<Array<{ x: number; y: number; time: number }>>([]);

  // Onscreen Geometry Instrument positions (Ruler & Protractor)
  const [showRuler, setShowRuler] = useState(false);
  const [rulerPos, setRulerPos] = useState({ x: 120, y: 300, rotation: 0, length: 380 });
  const [showProtractor, setShowProtractor] = useState(false);
  const [protractorPos, setProtractorPos] = useState({ x: 250, y: 250 });

  // Redraw canvas whenever strokes or background change
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw coordinate axes if current tool is 'axes'
    // Draw all stored strokes
    strokes.forEach(stroke => {
      drawSingleStroke(ctx, stroke);
    });

    // Draw currently active stroke if drawing
    if (activeStrokeRef.current) {
      drawSingleStroke(ctx, activeStrokeRef.current);
    }
  }, [strokes]);

  // Helper to draw a single stroke
  const drawSingleStroke = (ctx: CanvasRenderingContext2D, stroke: DrawingStroke) => {
    if (stroke.points.length === 0) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.width;

    if (stroke.tool === 'highlighter') {
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = stroke.width * 2.5;
    } else {
      ctx.globalAlpha = stroke.opacity;
    }

    const pts = stroke.points;
    const start = pts[0];
    const end = pts[pts.length - 1];

    switch (stroke.tool) {
      case 'line':
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        break;

      case 'arrow':
      case 'double-arrow': {
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();

        // Draw arrowheads
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const headLen = Math.max(12, stroke.width * 3);

        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - headLen * Math.cos(angle - Math.PI / 6), end.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6), end.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();

        if (stroke.tool === 'double-arrow') {
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(start.x + headLen * Math.cos(angle - Math.PI / 6), start.y + headLen * Math.sin(angle - Math.PI / 6));
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(start.x + headLen * Math.cos(angle + Math.PI / 6), start.y + headLen * Math.sin(angle + Math.PI / 6));
          ctx.stroke();
        }
        break;
      }

      case 'dashed':
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.setLineDash([]);
        break;

      case 'rectangle': {
        const w = end.x - start.x;
        const h = end.y - start.y;
        ctx.beginPath();
        ctx.strokeRect(start.x, start.y, w, h);
        break;
      }

      case 'circle': {
        const radius = Math.hypot(end.x - start.x, end.y - start.y);
        ctx.beginPath();
        ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      case 'triangle': {
        ctx.beginPath();
        ctx.moveTo(start.x + (end.x - start.x) / 2, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.lineTo(start.x, end.y);
        ctx.closePath();
        ctx.stroke();
        break;
      }

      case 'axes': {
        // Cartesian X-Y plane
        ctx.beginPath();
        // Horizontal X-axis
        ctx.moveTo(start.x, start.y + (end.y - start.y) / 2);
        ctx.lineTo(end.x, start.y + (end.y - start.y) / 2);
        // Vertical Y-axis
        ctx.moveTo(start.x + (end.x - start.x) / 2, start.y);
        ctx.lineTo(start.x + (end.x - start.x) / 2, end.y);
        ctx.stroke();
        break;
      }

      case 'brush':
      case 'pen':
      case 'highlighter':
      default:
        if (pts.length === 1) {
          ctx.beginPath();
          ctx.arc(start.x, start.y, stroke.width / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            // Smooth bezier curve through points
            const xc = (pts[i].x + pts[i - 1].x) / 2;
            const yc = (pts[i].y + pts[i - 1].y) / 2;
            ctx.quadraticCurveTo(pts[i - 1].x, pts[i - 1].y, xc, yc);
          }
          ctx.stroke();
        }
        break;
    }

    ctx.restore();
  };

  // High-DPI canvas resize handling
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
      renderCanvas();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderCanvas]);

  // Redraw when strokes change
  useEffect(() => {
    renderCanvas();
  }, [strokes, renderCanvas]);

  // Laser pointer fade animation loop
  useEffect(() => {
    let animId: number;
    const updateLaser = () => {
      const now = Date.now();
      setLaserPoints(prev => prev.filter(p => now - p.time < 1200));
      animId = requestAnimationFrame(updateLaser);
    };
    animId = requestAnimationFrame(updateLaser);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Pointer event handlers with Samsung dual-stylus and palm recognition
  const getCanvasCoordinates = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const pt = getCanvasCoordinates(e);
    activePointersRef.current.set(e.pointerId, pt);

    // Samsung Palm / Fist Eraser Detection:
    // If contact area width/height exceeds 28px, user is resting their palm or erasing with fist!
    const isPalm = e.pointerType === 'touch' && (e.width > 28 || e.height > 28);
    const activeTool = isPalm ? 'eraser' : currentTool;

    if (activeTool === 'laser') {
      setLaserPoints(prev => [...prev, { x: pt.x, y: pt.y, time: Date.now() }]);
      return;
    }

    if (activeTool === 'eraser' || activeTool === 'stroke-eraser') {
      isDrawingRef.current = true;
      eraseAtPoint(pt);
      return;
    }

    // Save current strokes to undo stack before creating new stroke
    setUndoStack(prev => [...prev, strokes]);
    setRedoStack([]);

    isDrawingRef.current = true;
    activeStrokeRef.current = {
      id: `stroke-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      tool: activeTool,
      points: [pt],
      color: currentColor,
      width: activeTool === 'brush' ? strokeWidth * (pt.pressure || 1) * 1.5 : strokeWidth,
      opacity: activeTool === 'highlighter' ? 0.4 : 1,
      createdAt: Date.now()
    };

    renderCanvas();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
    const pt = getCanvasCoordinates(e);
    activePointersRef.current.set(e.pointerId, pt);

    const isPalm = e.pointerType === 'touch' && (e.width > 28 || e.height > 28);
    const activeTool = isPalm ? 'eraser' : currentTool;

    if (activeTool === 'laser') {
      setLaserPoints(prev => [...prev, { x: pt.x, y: pt.y, time: Date.now() }]);
      return;
    }

    if (!isDrawingRef.current) return;

    if (activeTool === 'eraser' || activeTool === 'stroke-eraser') {
      eraseAtPoint(pt);
      return;
    }

    if (activeStrokeRef.current) {
      // Shape tools only need start and end points
      const isShapeTool = ['line', 'arrow', 'double-arrow', 'dashed', 'rectangle', 'circle', 'triangle', 'axes'].includes(activeStrokeRef.current.tool);

      if (isShapeTool) {
        activeStrokeRef.current.points = [activeStrokeRef.current.points[0], pt];
      } else {
        activeStrokeRef.current.points.push(pt);
      }
      renderCanvas();
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.delete(e.pointerId);
    }

    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (activeStrokeRef.current && activeStrokeRef.current.points.length > 0) {
      onStrokesChange([...strokes, activeStrokeRef.current]);
      activeStrokeRef.current = null;
    }

    renderCanvas();
  };

  // Erasing logic (Stroke or area eraser)
  const eraseAtPoint = (pt: Point) => {
    const eraserRadius = Math.max(24, strokeWidth * 2.5);

    // Filter out strokes that intersect eraser radius
    const remaining = strokes.filter(s => {
      return !s.points.some(p => Math.hypot(p.x - pt.x, p.y - pt.y) < eraserRadius);
    });

    if (remaining.length !== strokes.length) {
      onStrokesChange(remaining);
    }
  };

  // Undo / Redo Actions
  const handleUndo = () => {
    if (strokes.length === 0 && undoStack.length === 0) return;
    if (undoStack.length > 0) {
      const prev = undoStack[undoStack.length - 1];
      setRedoStack(r => [...r, strokes]);
      setUndoStack(u => u.slice(0, -1));
      onStrokesChange(prev);
    } else {
      setRedoStack(r => [...r, strokes]);
      onStrokesChange([]);
    }
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(u => [...u, strokes]);
    setRedoStack(r => r.slice(0, -1));
    onStrokesChange(next);
  };

  // Sticky Note creation
  const addStickyNote = () => {
    const colors = ['#fef08a', '#bbf7d0', '#bae6fd', '#fbcfe8'];
    const newNote: StickyNoteType = {
      id: `sticky-${Date.now()}`,
      x: 140 + Math.random() * 80,
      y: 140 + Math.random() * 80,
      width: 220,
      height: 180,
      color: colors[stickyNotes.length % colors.length],
      text: '📌 Lesson Note: Remember to emphasize the units in the final step!'
    };
    onStickyNotesChange([...stickyNotes, newNote]);
  };

  const updateStickyNote = (id: string, text: string) => {
    onStickyNotesChange(stickyNotes.map(n => n.id === id ? { ...n, text } : n));
  };

  const deleteStickyNote = (id: string) => {
    onStickyNotesChange(stickyNotes.filter(n => n.id !== id));
  };

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden select-none canvas-bg-${backgroundTheme}`}
    >
      {/* 4K Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* Temporary glowing laser pointer overlay */}
      {laserPoints.length > 0 && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-20">
          {laserPoints.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={10}
              fill="#ef4444"
              opacity={(1 - (Date.now() - p.time) / 1200)}
              filter="drop-shadow(0 0 8px #ef4444)"
            />
          ))}
        </svg>
      )}

      {/* Interactive Sticky Notes */}
      {stickyNotes.map(note => (
        <div
          key={note.id}
          style={{
            left: `${note.x}px`,
            top: `${note.y}px`,
            width: `${note.width}px`,
            height: `${note.height}px`,
            backgroundColor: note.color,
          }}
          className="absolute z-10 p-3 rounded-lg shadow-xl flex flex-col text-slate-900 border border-black/10 cursor-move"
        >
          <div className="flex items-center justify-between pb-1 mb-1 border-b border-black/10 text-xs font-semibold text-slate-700">
            <span>Sticky Note</span>
            <button 
              onClick={() => deleteStickyNote(note.id)}
              className="text-slate-500 hover:text-red-600 font-bold px-1"
            >
              ×
            </button>
          </div>
          <textarea
            value={note.text}
            onChange={(e) => updateStickyNote(note.id, e.target.value)}
            className="w-full flex-1 bg-transparent resize-none outline-none font-medium text-sm leading-snug"
          />
        </div>
      ))}

      {/* Top Floating Board Quick Controls */}
      <div className="absolute top-3 left-4 z-20 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/60 shadow-lg text-xs font-medium text-slate-200">
        <button
          onClick={handleUndo}
          title="Undo (Ctrl+Z)"
          className="p-1.5 hover:bg-slate-800 rounded-full transition text-slate-300 hover:text-white"
        >
          <Undo className="w-4 h-4" />
        </button>
        <button
          onClick={handleRedo}
          title="Redo (Ctrl+Y)"
          className="p-1.5 hover:bg-slate-800 rounded-full transition text-slate-300 hover:text-white"
        >
          <Redo className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-slate-700 mx-1" />

        <button
          onClick={addStickyNote}
          title="Add Sticky Note"
          className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-full border border-amber-500/30 transition"
        >
          <StickyIcon className="w-3.5 h-3.5" />
          <span>Sticky</span>
        </button>

        <button
          onClick={onClearCanvas}
          title="Clear Current Slide"
          className="p-1.5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-full transition"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-slate-700 mx-1" />

        {/* Page / Slide Management HUD */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onPrevPage}
            disabled={currentPage <= 1}
            className="p-1 hover:bg-slate-800 disabled:opacity-30 rounded-full text-slate-300"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-semibold text-emerald-400 px-1">
            Slide {currentPage} / {totalPages}
          </span>
          <button
            onClick={onNextPage}
            disabled={currentPage >= totalPages}
            className="p-1 hover:bg-slate-800 disabled:opacity-30 rounded-full text-slate-300"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={onAddPage}
            title="Add New Blank Slide"
            className="flex items-center gap-1 px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full font-semibold transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Slide</span>
          </button>
        </div>
      </div>

      {/* Top Right Quick Share & Export Bar */}
      <div className="absolute top-3 right-4 z-20 flex items-center gap-2">
        <button
          onClick={onOpenQRShare}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg transition"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>QR Student Notes</span>
        </button>
        <button
          onClick={onExportPNG}
          className="p-1.5 bg-slate-900/90 text-slate-300 hover:text-white border border-slate-700 rounded-full shadow-lg transition"
          title="Save Slide Screenshot"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
