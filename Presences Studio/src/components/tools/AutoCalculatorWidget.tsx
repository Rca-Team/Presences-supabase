import React, { useState, useEffect } from 'react';
import { GeminiTeachingService } from '../../services/geminiTeachingService';
import { MathCalculationResult } from '../../types/smartboard';
import { 
  Calculator, 
  Sparkles, 
  Plus, 
  X, 
  Minimize2, 
  Maximize2, 
  Loader2, 
  Check, 
  RotateCcw,
  Zap
} from 'lucide-react';

interface AutoCalculatorWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  onStampToBoard: (text: string) => void;
}

export const AutoCalculatorWidget: React.FC<AutoCalculatorWidgetProps> = ({
  isOpen,
  onClose,
  onStampToBoard,
}) => {
  const [expression, setExpression] = useState('3x^2 - 15x + 18 = 0');
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<MathCalculationResult | null>(null);
  const [position, setPosition] = useState({ x: 30, y: 120 });
  const [isMinimized, setIsMinimized] = useState(false);

  // Auto-calculate with debouncing whenever expression changes
  useEffect(() => {
    if (!isOpen || !expression.trim()) return;

    const timer = setTimeout(async () => {
      setIsCalculating(true);
      try {
        const res = await GeminiTeachingService.calculateStepByStep(expression.trim());
        setResult(res);
      } catch (err) {
        console.warn('Auto-calculation error:', err);
      } finally {
        setIsCalculating(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [expression, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      className={`absolute z-30 bg-slate-900/95 border-2 border-cyan-500/70 rounded-2xl shadow-2xl backdrop-blur-xl select-none animate-in zoom-in-95 ${
        isMinimized ? 'w-60' : 'w-80 md:w-96'
      }`}
    >
      {/* Titlebar */}
      <div className="px-3 py-2 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between cursor-move text-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
            <Calculator className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold text-white">
            AI Calculation Performer
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
          >
            {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-red-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="p-3.5 space-y-3">
          {/* Real-time Math Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-300">
                Formula or Expression:
              </label>
              <div className="flex items-center gap-1 text-[10px] text-cyan-400">
                <Zap className="w-3 h-3" />
                <span>Auto-calculates</span>
              </div>
            </div>

            <div className="relative">
              <input
                type="text"
                value={expression}
                onChange={(e) => setExpression(e.target.value)}
                placeholder="Type equation (e.g. 2x^2 + 5x - 3 = 0, sin(60)*cos(30))..."
                className="w-full bg-slate-950 border border-slate-700 text-white font-mono text-xs px-3 py-2 rounded-xl outline-none focus:border-cyan-500"
              />
              {isCalculating && (
                <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
              )}
            </div>
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-1 text-[10px]">
            <button
              onClick={() => setExpression('2x^2 - 8x + 6 = 0')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono"
            >
              Quadratic
            </button>
            <button
              onClick={() => setExpression('1/60 - 1/20')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono"
            >
              Lens (1/f)
            </button>
            <button
              onClick={() => setExpression('1200 * 9.8 * 15')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono"
            >
              Energy (mgh)
            </button>
            <button
              onClick={() => setExpression('1/2 + 1/3 + 1/6')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono"
            >
              Parallel R
            </button>
          </div>

          {/* Real-time Result Card */}
          {result && (
            <div className="bg-slate-950/80 border border-cyan-500/30 rounded-xl p-3 space-y-2.5 shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                  {result.category} Working
                </span>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {result.finalAnswer}
                </span>
              </div>

              {/* Step by step */}
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 text-xs font-mono">
                {result.steps.map((step, idx) => (
                  <div key={idx} className="p-1.5 rounded bg-slate-900/90 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block mb-0.5">{step.description}</span>
                    <span className="text-cyan-200 font-semibold">{step.formulaOrMath}</span>
                  </div>
                ))}
              </div>

              {/* Stamp to board button */}
              <button
                onClick={() => onStampToBoard(`Math Problem: ${result.problem}\nAnswer: ${result.finalAnswer}\nStep 1: ${result.steps[0]?.formulaOrMath || ''}`)}
                className="w-full py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Stamp Steps to Slide</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
