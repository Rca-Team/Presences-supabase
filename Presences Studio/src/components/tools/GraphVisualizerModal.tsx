import React, { useState, useEffect, useRef } from 'react';
import { Sliders, X, Plus, Sparkles } from 'lucide-react';
import { CanvasImage } from '../../types/smartboard';

interface GraphVisualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStampGraphToBoard: (image: CanvasImage) => void;
}

export const GraphVisualizerModal: React.FC<GraphVisualizerModalProps> = ({
  isOpen,
  onClose,
  onStampGraphToBoard,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [equationType, setEquationType] = useState<'parabola' | 'sine' | 'linear'>('parabola');
  // Parabola: y = a*x^2 + b*x + c
  const [paramA, setParamA] = useState(1);
  const [paramB, setParamB] = useState(0);
  const [paramC, setParamC] = useState(-4);

  // Sine: y = A*sin(w*x)
  const [amplitude, setAmplitude] = useState(2);
  const [frequency, setFrequency] = useState(1);

  // Draw graph on canvas
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const originX = width / 2;
    const originY = height / 2;
    const scale = 25; // 25 pixels per unit

    // Background
    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.1)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += scale) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += scale) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, originY);
    ctx.lineTo(width, originY);
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, height);
    ctx.stroke();

    // Plot equation curve
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();

    let first = true;
    for (let px = 0; px < width; px += 2) {
      const xVal = (px - originX) / scale;
      let yVal = 0;

      if (equationType === 'parabola') {
        yVal = paramA * xVal * xVal + paramB * xVal + paramC;
      } else if (equationType === 'sine') {
        yVal = amplitude * Math.sin(frequency * xVal);
      } else if (equationType === 'linear') {
        yVal = paramA * xVal + paramC;
      }

      const py = originY - yVal * scale;

      if (first) {
        ctx.moveTo(px, py);
        first = false;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
  }, [isOpen, equationType, paramA, paramB, paramC, amplitude, frequency]);

  if (!isOpen) return null;

  const handleStampGraph = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const src = canvas.toDataURL('image/png');
    const newImage: CanvasImage = {
      id: `graph-${Date.now()}`,
      src,
      x: 180,
      y: 120,
      width: 380,
      height: 240,
      aspectRatio: 380 / 240,
      caption: equationType === 'parabola'
        ? `y = ${paramA}x² + ${paramB}x + ${paramC}`
        : equationType === 'sine'
        ? `y = ${amplitude}·sin(${frequency}x)`
        : `y = ${paramA}x + ${paramC}`
    };
    onStampGraphToBoard(newImage);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 select-none animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-2xl p-6 flex flex-col shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Interactive Graph & Formula Sliders</h3>
            <span className="text-xs text-slate-400">
              Drag parameters to demonstrate real-time mathematical curves
            </span>
          </div>
        </div>

        {/* Equation Type Selector */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setEquationType('parabola')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              equationType === 'parabola' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            Parabola (ax² + bx + c)
          </button>
          <button
            onClick={() => setEquationType('sine')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              equationType === 'sine' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            Sine Wave (A·sin(ωx))
          </button>
          <button
            onClick={() => setEquationType('linear')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              equationType === 'linear' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            Linear (mx + c)
          </button>
        </div>

        {/* Interactive Graph Canvas */}
        <div className="w-full h-64 rounded-2xl overflow-hidden border border-slate-700 bg-slate-950 mb-4 flex items-center justify-center">
          <canvas ref={canvasRef} width={600} height={256} className="w-full h-full" />
        </div>

        {/* Sliders Area */}
        <div className="space-y-3 bg-slate-950/80 p-4 rounded-2xl border border-slate-800 text-xs mb-4">
          {equationType === 'parabola' && (
            <>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-300 font-mono w-24">a (Curvature): {paramA}</span>
                <input
                  type="range"
                  min="-3"
                  max="3"
                  step="0.2"
                  value={paramA}
                  onChange={(e) => setParamA(parseFloat(e.target.value))}
                  className="flex-1 accent-cyan-500 cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-300 font-mono w-24">b (Linear): {paramB}</span>
                <input
                  type="range"
                  min="-5"
                  max="5"
                  step="0.5"
                  value={paramB}
                  onChange={(e) => setParamB(parseFloat(e.target.value))}
                  className="flex-1 accent-cyan-500 cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-300 font-mono w-24">c (Y-Intercept): {paramC}</span>
                <input
                  type="range"
                  min="-8"
                  max="8"
                  step="0.5"
                  value={paramC}
                  onChange={(e) => setParamC(parseFloat(e.target.value))}
                  className="flex-1 accent-cyan-500 cursor-pointer"
                />
              </div>
            </>
          )}

          {equationType === 'sine' && (
            <>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-300 font-mono w-24">A (Amplitude): {amplitude}</span>
                <input
                  type="range"
                  min="0.5"
                  max="4"
                  step="0.25"
                  value={amplitude}
                  onChange={(e) => setAmplitude(parseFloat(e.target.value))}
                  className="flex-1 accent-cyan-500 cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-300 font-mono w-24">ω (Frequency): {frequency}</span>
                <input
                  type="range"
                  min="0.5"
                  max="4"
                  step="0.25"
                  value={frequency}
                  onChange={(e) => setFrequency(parseFloat(e.target.value))}
                  className="flex-1 accent-cyan-500 cursor-pointer"
                />
              </div>
            </>
          )}

          {equationType === 'linear' && (
            <>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-300 font-mono w-24">m (Slope): {paramA}</span>
                <input
                  type="range"
                  min="-4"
                  max="4"
                  step="0.5"
                  value={paramA}
                  onChange={(e) => setParamA(parseFloat(e.target.value))}
                  className="flex-1 accent-cyan-500 cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-300 font-mono w-24">c (Y-Intercept): {paramC}</span>
                <input
                  type="range"
                  min="-6"
                  max="6"
                  step="0.5"
                  value={paramC}
                  onChange={(e) => setParamC(parseFloat(e.target.value))}
                  className="flex-1 accent-cyan-500 cursor-pointer"
                />
              </div>
            </>
          )}
        </div>

        <button
          onClick={handleStampGraph}
          className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg"
        >
          <Plus className="w-4 h-4" />
          <span>Stamp Curve Directly onto Slide</span>
        </button>
      </div>
    </div>
  );
};
