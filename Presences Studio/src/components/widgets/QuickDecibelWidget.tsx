import React from 'react';
import { Mic, Volume2, AlertTriangle, ShieldCheck } from 'lucide-react';

export interface QuickDecibelWidgetProps {
  isMonitoring: boolean;
  noiseLevel: number; // 0..100
  noiseStatus: 'quiet' | 'moderate' | 'loud';
  onToggle: () => void;
}

export const QuickDecibelWidget: React.FC<QuickDecibelWidgetProps> = ({
  isMonitoring,
  noiseLevel,
  noiseStatus,
  onToggle,
}) => {
  const getStatusColor = () => {
    if (noiseStatus === 'quiet') return 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30';
    if (noiseStatus === 'moderate') return 'text-amber-400 bg-amber-500/15 border-amber-500/30';
    return 'text-rose-400 bg-rose-500/20 border-rose-500/40 animate-pulse';
  };

  const getBarColor = () => {
    if (noiseLevel < 35) return 'from-emerald-500 to-teal-400';
    if (noiseLevel < 70) return 'from-amber-500 to-yellow-400';
    return 'from-rose-500 to-red-600';
  };

  return (
    <div 
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl border backdrop-blur-xl shadow-lg cursor-pointer transition select-none ${
        isMonitoring ? getStatusColor() : 'bg-slate-900/90 border-slate-700/50 text-slate-400'
      }`}
      title={isMonitoring ? `Classroom Noise: ${noiseLevel} dB (${noiseStatus})` : 'Click to start Classroom Noise Monitor'}
    >
      <div className="flex items-center gap-1 font-bold text-xs">
        <Mic className={`w-3.5 h-3.5 ${isMonitoring ? 'animate-bounce' : ''}`} />
        <span>{isMonitoring ? `${noiseLevel} dB` : 'Noise Meter'}</span>
      </div>

      {isMonitoring && (
        <div className="w-12 h-2 bg-slate-800 rounded-full overflow-hidden">
          <div 
            className={`h-full bg-gradient-to-r ${getBarColor()} transition-all duration-300 rounded-full`}
            style={{ width: `${Math.min(100, Math.max(10, noiseLevel))}%` }}
          />
        </div>
      )}

      <span className="text-[10px] font-extrabold uppercase tracking-wider">
        {isMonitoring ? noiseStatus : 'OFF'}
      </span>
    </div>
  );
};
