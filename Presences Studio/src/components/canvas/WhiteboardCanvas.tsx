import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  ToolType, 
  BackgroundTheme, 
  DrawingStroke, 
  Point, 
  StickyNote as StickyNoteType,
  CanvasImage,
  CanvasTextBox
} from '../../types/smartboard';
import { 
  Undo, 
  Redo, 
  Trash2, 
  Download, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  StickyNote as StickyIcon,
  Image as ImageIcon,
  Type as TypeIcon,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileDown,
  Layers
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
  images?: CanvasImage[];
  onImagesChange?: (images: CanvasImage[]) => void;
  textBoxes?: CanvasTextBox[];
  onTextBoxesChange?: (boxes: CanvasTextBox[]) => void;
  onClearCanvas: () => void;
  // Slide management
  currentPage: number;
  totalPages: number;
  onNextPage: () => void;
  onPrevPage: () => void;
  onAddPage: () => void;
  onToggleSlideDrawer: () => void;
  onExportPNG: () => void;
  onExportPDF: () => void;
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
  images = [],
  onImagesChange,
  textBoxes = [],
  onTextBoxesChange,
  onClearCanvas,
  currentPage,
  totalPages,
  onNextPage,
  onPrevPage,
  onAddPage,
  onToggleSlideDrawer,
  onExportPNG,
  onExportPDF,
  onOpenQRShare,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Active inking state
  const isDrawingRef = useRef(false);
  const activeStrokeRef = useRef<DrawingStroke | null>(null);
  const activePointersRef = useRef<Map<number, Point>>(new Map());

  // History for undo/redo
  const [undoStack, setUndoStack] = useState<DrawingStroke[][]>([]);
  const [redoStack, setRedoStack] = useState<DrawingStroke[][]>([]);

  // Pan & Zoom state (up to 400%)
  const [scale, setScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef<Point>({ x: 0, y: 0 });

  // Laser pointer temporary points
  const [laserPoints, setLaserPoints] = useState<Array<{ x: number; y: number; time: number }>>([]);

  // Active selected image for moving/resizing
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const isDraggingImageRef = useRef(false);
  const dragImageOffsetRef = useRef({ x: 0, y: 0 });

  // Inline text creator modal or input
  const [newTextPos, setNewTextPos] = useState<Point | null>(null);
  const [newTextValue, setNewTextValue] = useState('');

  // Redraw canvas whenever strokes, scale, pan change
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset transform & clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const dpr = window.devicePixelRatio || 1;
    // Apply pan, zoom, and DPR
    ctx.setTransform(
      scale * dpr, 
      0, 
      0, 
      scale * dpr, 
      panOffset.x * dpr, 
      panOffset.y * dpr
    );

    // Draw all stored strokes
    strokes.forEach(stroke => {
      drawSingleStroke(ctx, stroke);
    });

    // Draw active stroke
    if (activeStrokeRef.current) {
      drawSingleStroke(ctx, activeStrokeRef.current);
    }
  }, [strokes, scale, panOffset]);

  // Stroke drawing logic
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
        ctx.beginPath();
        ctx.moveTo(start.x, start.y + (end.y - start.y) / 2);
        ctx.lineTo(end.x, start.y + (end.y - start.y) / 2);
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

  // Resize handling
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      renderCanvas();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderCanvas]);

  useEffect(() => {
    renderCanvas();
  }, [strokes, renderCanvas]);

  // Laser animation loop
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

  // Transform screen to canvas world coordinate space
  const getCanvasCoordinates = (clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    return {
      x: (screenX - panOffset.x) / scale,
      y: (screenY - panOffset.y) / scale,
    };
  };

  // Pointer Handlers with Multi-Touch & Palm Rejection
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const pt = getCanvasCoordinates(e.clientX, e.clientY);
    pt.pressure = e.pressure || 0.5;
    activePointersRef.current.set(e.pointerId, pt);

    // Pan Tool or 2-finger pan
    if (currentTool === 'pan' || activePointersRef.current.size >= 2) {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
      return;
    }

    // Text Tool: Click to type text directly on canvas
    if (currentTool === 'text') {
      setNewTextPos(pt);
      return;
    }

    // Palm / Fist Erase Gesture on Samsung Displays
    const isPalm = e.pointerType === 'touch' && (e.width > 28 || e.height > 28);
    const activeTool = isPalm ? 'eraser' : currentTool;

    if (activeTool === 'laser') {
      setLaserPoints(prev => [...prev, { x: e.clientX, y: e.clientY, time: Date.now() }]);
      return;
    }

    if (activeTool === 'eraser' || activeTool === 'stroke-eraser') {
      isDrawingRef.current = true;
      eraseAtPoint(pt);
      return;
    }

    // Begin drawing stroke
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

    if (isPanningRef.current) {
      setPanOffset({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y
      });
      return;
    }

    const pt = getCanvasCoordinates(e.clientX, e.clientY);
    pt.pressure = e.pressure || 0.5;
    activePointersRef.current.set(e.pointerId, pt);

    const isPalm = e.pointerType === 'touch' && (e.width > 28 || e.height > 28);
    const activeTool = isPalm ? 'eraser' : currentTool;

    if (activeTool === 'laser') {
      setLaserPoints(prev => [...prev, { x: e.clientX, y: e.clientY, time: Date.now() }]);
      return;
    }

    if (!isDrawingRef.current) return;

    if (activeTool === 'eraser' || activeTool === 'stroke-eraser') {
      eraseAtPoint(pt);
      return;
    }

    if (activeStrokeRef.current) {
      const isShape = ['line', 'arrow', 'double-arrow', 'dashed', 'rectangle', 'circle', 'triangle', 'axes'].includes(activeStrokeRef.current.tool);
      if (isShape) {
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

    if (isPanningRef.current && activePointersRef.current.size === 0) {
      isPanningRef.current = false;
      return;
    }

    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (activeStrokeRef.current && activeStrokeRef.current.points.length > 0) {
      onStrokesChange([...strokes, activeStrokeRef.current]);
      activeStrokeRef.current = null;
    }

    renderCanvas();
  };

  // Erase strokes at point
  const eraseAtPoint = (pt: Point) => {
    const eraserRadius = Math.max(24, strokeWidth * 2.5);
    const remaining = strokes.filter(s => {
      return !s.points.some(p => Math.hypot(p.x - pt.x, p.y - pt.y) < eraserRadius);
    });
    if (remaining.length !== strokes.length) {
      onStrokesChange(remaining);
    }
  };

  // Zoom helpers
  const handleZoomIn = () => setScale(s => Math.min(4, s + 0.25));
  const handleZoomOut = () => setScale(s => Math.max(0.5, s - 0.25));
  const handleResetZoom = () => {
    setScale(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Image Upload / Diagram Insertion
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      const src = loadEvt.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const aspect = img.width / img.height;
        const width = 340;
        const height = width / aspect;
        const newImg: CanvasImage = {
          id: `img-${Date.now()}`,
          src,
          x: 140,
          y: 120,
          width,
          height,
          aspectRatio: aspect,
          caption: file.name.replace(/\.[^/.]+$/, '')
        };
        if (onImagesChange) {
          onImagesChange([...images, newImg]);
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Delete image
  const handleDeleteImage = (id: string) => {
    if (onImagesChange) {
      onImagesChange(images.filter(img => img.id !== id));
    }
  };

  // Text insertion finish
  const handleSaveInlineText = () => {
    if (!newTextPos || !newTextValue.trim() || !onTextBoxesChange) {
      setNewTextPos(null);
      setNewTextValue('');
      return;
    }

    const newBox: CanvasTextBox = {
      id: `text-${Date.now()}`,
      text: newTextValue.trim(),
      x: newTextPos.x,
      y: newTextPos.y,
      fontSize: 22,
      color: currentColor,
    };
    onTextBoxesChange([...textBoxes, newBox]);
    setNewTextPos(null);
    setNewTextValue('');
  };

  const handleDeleteTextBox = (id: string) => {
    if (onTextBoxesChange) {
      onTextBoxesChange(textBoxes.filter(t => t.id !== id));
    }
  };

  // Sticky Notes
  const addStickyNote = () => {
    const colors = ['#fef08a', '#bbf7d0', '#bae6fd', '#fbcfe8'];
    const newNote: StickyNoteType = {
      id: `sticky-${Date.now()}`,
      x: 160,
      y: 160,
      width: 240,
      height: 180,
      color: colors[stickyNotes.length % colors.length],
      text: '📌 Lesson Note: Highlight this formula for upcoming midterm test!'
    };
    onStickyNotesChange([...stickyNotes, newNote]);
  };

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden select-none canvas-bg-${backgroundTheme}`}
    >
      {/* Hidden file upload for diagrams / images */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageFileChange}
        className="hidden"
      />

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
              r={12}
              fill="#ef4444"
              opacity={(1 - (Date.now() - p.time) / 1200)}
              filter="drop-shadow(0 0 10px #ef4444)"
            />
          ))}
        </svg>
      )}

      {/* Canvas Text Boxes */}
      {textBoxes.map(box => (
        <div
          key={box.id}
          style={{
            left: `${box.x * scale + panOffset.x}px`,
            top: `${box.y * scale + panOffset.y}px`,
            color: box.color,
            fontSize: `${box.fontSize * scale}px`,
          }}
          className="absolute z-10 px-2 py-1 rounded bg-black/20 border border-white/10 group cursor-move flex items-center gap-2"
        >
          <span className="font-bold font-mono select-text">{box.text}</span>
          <button
            onClick={() => handleDeleteTextBox(box.id)}
            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 text-xs px-1 rounded bg-slate-900/80"
          >
            ×
          </button>
        </div>
      ))}

      {/* Inserted Diagram / Textbook Images */}
      {images.map(img => (
        <div
          key={img.id}
          style={{
            left: `${img.x * scale + panOffset.x}px`,
            top: `${img.y * scale + panOffset.y}px`,
            width: `${img.width * scale}px`,
            height: `${img.height * scale}px`,
          }}
          className="absolute z-10 rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 group cursor-move bg-slate-900"
        >
          <img src={img.src} alt="Classroom Diagram" className="w-full h-full object-contain pointer-events-none" />
          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
            <button
              onClick={() => handleDeleteImage(img.id)}
              className="p-1 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-500 shadow"
            >
              ×
            </button>
          </div>
          {img.caption && (
            <div className="absolute bottom-0 inset-x-0 bg-black/70 px-2 py-0.5 text-[11px] text-slate-200 truncate">
              {img.caption}
            </div>
          )}
        </div>
      ))}

      {/* Sticky Notes */}
      {stickyNotes.map(note => (
        <div
          key={note.id}
          style={{
            left: `${note.x * scale + panOffset.x}px`,
            top: `${note.y * scale + panOffset.y}px`,
            width: `${note.width * scale}px`,
            height: `${note.height * scale}px`,
            backgroundColor: note.color,
          }}
          className="absolute z-10 p-3 rounded-xl shadow-xl flex flex-col text-slate-900 border border-black/10 cursor-move"
        >
          <div className="flex items-center justify-between pb-1 mb-1 border-b border-black/10 text-xs font-semibold text-slate-700">
            <span>Sticky Note</span>
            <button 
              onClick={() => onStickyNotesChange(stickyNotes.filter(n => n.id !== note.id))}
              className="text-slate-500 hover:text-red-600 font-bold px-1"
            >
              ×
            </button>
          </div>
          <textarea
            value={note.text}
            onChange={(e) => onStickyNotesChange(stickyNotes.map(n => n.id === note.id ? { ...n, text: e.target.value } : n))}
            className="w-full flex-1 bg-transparent resize-none outline-none font-medium text-sm leading-snug"
          />
        </div>
      ))}

      {/* Inline Text Prompt Modal when Text tool is active and clicked */}
      {newTextPos && (
        <div 
          style={{ left: `${newTextPos.x * scale + panOffset.x}px`, top: `${newTextPos.y * scale + panOffset.y}px` }}
          className="absolute z-30 bg-slate-900 border border-cyan-500 p-2 rounded-xl shadow-2xl flex items-center gap-2"
        >
          <input
            type="text"
            autoFocus
            value={newTextValue}
            onChange={(e) => setNewTextValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineText(); if (e.key === 'Escape') setNewTextPos(null); }}
            placeholder="Type text / formula..."
            className="bg-slate-950 border border-slate-700 text-white text-xs px-2.5 py-1.5 rounded-lg outline-none font-mono"
          />
          <button
            onClick={handleSaveInlineText}
            className="px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold"
          >
            Add
          </button>
        </div>
      )}

      {/* Top Floating Board Quick Controls */}
      <div className="absolute top-3 left-4 z-20 flex items-center gap-1.5 md:gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-slate-700/60 shadow-lg text-xs font-medium text-slate-200">
        <button
          onClick={() => {
            if (strokes.length > 0 && undoStack.length > 0) {
              const prev = undoStack[undoStack.length - 1];
              setRedoStack(r => [...r, strokes]);
              setUndoStack(u => u.slice(0, -1));
              onStrokesChange(prev);
            }
          }}
          title="Undo"
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white"
        >
          <Undo className="w-4 h-4" />
        </button>

        <button
          onClick={() => {
            if (redoStack.length > 0) {
              const next = redoStack[redoStack.length - 1];
              setUndoStack(u => [...u, strokes]);
              setRedoStack(r => r.slice(0, -1));
              onStrokesChange(next);
            }
          }}
          title="Redo"
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white"
        >
          <Redo className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-slate-700 mx-1" />

        {/* Insert Diagram / Image */}
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Upload Diagram / Screenshot"
          className="flex items-center gap-1 px-2.5 py-1 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 rounded-lg border border-cyan-500/30 transition"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Insert Diagram</span>
        </button>

        {/* Sticky Note */}
        <button
          onClick={addStickyNote}
          className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg border border-amber-500/30 transition"
        >
          <StickyIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Sticky</span>
        </button>

        {/* Clear */}
        <button
          onClick={onClearCanvas}
          title="Clear Slide"
          className="p-1.5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-slate-700 mx-1" />

        {/* Slide Pagination & Thumbnails Toggle */}
        <div className="flex items-center gap-1">
          <button
            onClick={onPrevPage}
            disabled={currentPage <= 1}
            className="p-1 hover:bg-slate-800 disabled:opacity-30 rounded text-slate-300"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <button
            onClick={onToggleSlideDrawer}
            title="View All Slide Thumbnails"
            className="font-bold text-emerald-400 px-2 py-0.5 rounded hover:bg-slate-800 transition flex items-center gap-1"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{currentPage} / {totalPages}</span>
          </button>

          <button
            onClick={onNextPage}
            disabled={currentPage >= totalPages}
            className="p-1 hover:bg-slate-800 disabled:opacity-30 rounded text-slate-300"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            onClick={onAddPage}
            title="New Slide"
            className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold ml-0.5"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Top Right Quick Export & QR Bar */}
      <div className="absolute top-3 right-4 z-20 flex items-center gap-2">
        <button
          onClick={onExportPDF}
          title="Download Multi-Page Lecture PDF"
          className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg transition"
        >
          <FileDown className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Export PDF</span>
        </button>

        <button
          onClick={onOpenQRShare}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg transition"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Student QR</span>
        </button>

        <button
          onClick={onExportPNG}
          className="p-1.5 bg-slate-900/90 text-slate-300 hover:text-white border border-slate-700 rounded-full shadow-lg transition"
          title="Save Slide Image"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Floating Zoom & Pan Controls (Bottom Left) */}
      <div className="absolute bottom-20 left-4 z-20 flex items-center gap-1 bg-slate-900/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-slate-700/70 shadow-lg text-xs font-semibold text-slate-300">
        <button onClick={handleZoomOut} className="p-1 hover:bg-slate-800 rounded">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleResetZoom} className="px-1.5 py-0.5 hover:bg-slate-800 rounded font-mono text-[11px] text-cyan-400">
          {Math.round(scale * 100)}%
        </button>
        <button onClick={handleZoomIn} className="p-1 hover:bg-slate-800 rounded">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
      </div>

    </div>
  );
};
