import React, { useRef, useState } from 'react';
import { Save, Trash2, X, Square, Minus } from 'lucide-react';

export interface DetectionBox {
  x: number; // 0..1
  y: number; // 0..1
  w: number; // 0..1
  h: number; // 0..1
  mode?: 'box' | 'line';
}

interface Props {
  initial: DetectionBox | null;
  onSave: (box: DetectionBox) => void;
  onClear: () => void;
  onCancel: () => void;
}

type Action =
  | { type: 'draw'; startX: number; startY: number }
  | { type: 'move'; offsetX: number; offsetY: number }
  | { type: 'resize'; corner: 'tl' | 'tr' | 'bl' | 'br'; anchorX: number; anchorY: number };

const DetectionBoxEditor: React.FC<Props> = ({ initial, onSave, onClear, onCancel }) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<DetectionBox | null>(initial);
  const [mode, setMode] = useState<'box' | 'line'>(initial?.mode ?? 'box');
  const [action, setAction] = useState<Action | null>(null);

  const toRel = (clientX: number, clientY: number): { x: number; y: number } => {
    const r = overlayRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (clientY - r.top) / r.height)),
    };
  };

  const startDraw = (e: React.PointerEvent) => {
    if (e.target !== overlayRef.current) return;
    const p = toRel(e.clientX, e.clientY);
    if (mode === 'line') {
      // Horizontal cross-line band
      setBox({ x: 0, y: Math.max(0, Math.min(0.92, p.y - 0.04)), w: 1, h: 0.08, mode: 'line' });
      setAction({ type: 'move', offsetX: 0, offsetY: 0.04 });
    } else {
      setBox({ x: p.x, y: p.y, w: 0, h: 0, mode: 'box' });
      setAction({ type: 'draw', startX: p.x, startY: p.y });
    }
    overlayRef.current!.setPointerCapture(e.pointerId);
  };

  const handleBoxPointerDown = (e: React.PointerEvent) => {
    if (!box) return;
    e.stopPropagation();
    const p = toRel(e.clientX, e.clientY);
    setAction({ type: 'move', offsetX: p.x - box.x, offsetY: p.y - box.y });
    overlayRef.current!.setPointerCapture(e.pointerId);
  };

  const handleResizeDown =
    (corner: 'tl' | 'tr' | 'bl' | 'br') => (e: React.PointerEvent) => {
      if (!box) return;
      e.stopPropagation();
      const anchorX = corner === 'tr' || corner === 'br' ? box.x : box.x + box.w;
      const anchorY = corner === 'bl' || corner === 'br' ? box.y : box.y + box.h;
      setAction({ type: 'resize', corner, anchorX, anchorY });
      overlayRef.current!.setPointerCapture(e.pointerId);
    };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!action || !box) return;
    const p = toRel(e.clientX, e.clientY);

    if (action.type === 'draw') {
      const x = Math.min(action.startX, p.x);
      const y = Math.min(action.startY, p.y);
      const w = Math.abs(p.x - action.startX);
      const h = Math.abs(p.y - action.startY);
      setBox({ x, y, w, h, mode: 'box' });
    } else if (action.type === 'move') {
      if (box.mode === 'line') {
        const newY = Math.max(0, Math.min(1 - box.h, p.y - action.offsetY));
        setBox({ ...box, y: newY });
      } else {
        const newX = Math.max(0, Math.min(1 - box.w, p.x - action.offsetX));
        const newY = Math.max(0, Math.min(1 - box.h, p.y - action.offsetY));
        setBox({ ...box, x: newX, y: newY });
      }
    } else if (action.type === 'resize') {
      const x = Math.min(action.anchorX, p.x);
      const y = Math.min(action.anchorY, p.y);
      const w = Math.abs(p.x - action.anchorX);
      const h = Math.abs(p.y - action.anchorY);
      setBox({ x, y, w, h, mode: 'box' });
    }
  };

  const handlePointerUp = () => setAction(null);

  const handleStyle =
    'absolute h-3 w-3 -m-1.5 bg-white border-2 border-cyan-500 rounded-sm shadow';

  return (
    <div className="absolute inset-0 z-30 select-none">
      <div
        ref={overlayRef}
        onPointerDown={startDraw}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="absolute inset-0 cursor-crosshair bg-black/40"
      >
        {box && box.w > 0 && box.h > 0 && (
          <div
            onPointerDown={handleBoxPointerDown}
            className="absolute border-2 border-cyan-400 shadow-[0_0_24px_rgba(6,182,212,0.6)] bg-cyan-400/10 cursor-move"
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.w * 100}%`,
              height: `${box.h * 100}%`,
            }}
          >
            <div className="absolute -top-7 left-0 px-2 py-1 rounded-md bg-cyan-500 text-white text-[10px] font-bold tracking-wide">
              {box.mode === 'line' ? 'CROSS LINE' : 'DETECTION ZONE'}
            </div>

            {box.mode !== 'line' && (
              <>
                <div className={`${handleStyle} top-0 left-0 cursor-nwse-resize`}
                  onPointerDown={handleResizeDown('tl')} />
                <div className={`${handleStyle} top-0 right-0 cursor-nesw-resize`}
                  onPointerDown={handleResizeDown('tr')} />
                <div className={`${handleStyle} bottom-0 left-0 cursor-nesw-resize`}
                  onPointerDown={handleResizeDown('bl')} />
                <div className={`${handleStyle} bottom-0 right-0 cursor-nwse-resize`}
                  onPointerDown={handleResizeDown('br')} />
              </>
            )}
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-wrap items-center justify-center gap-2 bg-card/95 backdrop-blur-xl rounded-2xl px-3 py-2 shadow-2xl border z-40 max-w-[95vw]">
        <div className="flex items-center rounded-xl border bg-muted/40 p-0.5">
          <button
            onClick={() => setMode('box')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors ${
              mode === 'box' ? 'bg-cyan-500 text-white shadow' : 'text-muted-foreground'
            }`}
            title="Rectangle zone"
          >
            <Square className="h-3 w-3" /> Box
          </button>
          <button
            onClick={() => setMode('line')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors ${
              mode === 'line' ? 'bg-cyan-500 text-white shadow' : 'text-muted-foreground'
            }`}
            title="Horizontal cross-line"
          >
            <Minus className="h-3 w-3" /> Line
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground hidden sm:block px-1 max-w-[220px] leading-tight">
          {mode === 'line'
            ? 'Tap on the camera to drop a horizontal cross-line. Drag to reposition.'
            : 'Drag to draw. Move or resize from corners.'}
        </p>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-xl text-xs font-medium hover:bg-muted flex items-center gap-1"
        >
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
        <button
          onClick={onClear}
          className="px-3 py-1.5 rounded-xl text-xs font-medium text-destructive hover:bg-destructive/10 flex items-center gap-1"
        >
          <Trash2 className="h-3.5 w-3.5" /> Clear
        </button>
        <button
          disabled={!box || box.w < 0.05 || box.h < 0.02}
          onClick={() => box && onSave({ ...box, mode })}
          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-40 flex items-center gap-1"
        >
          <Save className="h-3.5 w-3.5" /> Save Zone
        </button>
      </div>
    </div>
  );
};

export default DetectionBoxEditor;
