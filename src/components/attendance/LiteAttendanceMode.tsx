import React, { useState } from 'react';
import LiteQRScanner from './LiteQRScanner';
import LiteLoopFaceScanner from './LiteLoopFaceScanner';
import { Zap, WifiOff, QrCode, ScanFace } from 'lucide-react';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';

/**
 * LiteAttendanceMode
 * ------------------
 * Minimal, low-graphics attendance surface for smart boards, slow networks and
 * weak devices. No blur, no animations, no live sidebar.
 * - QR: native BarcodeDetector, decodes moving cards instantly.
 * - Face: loop capture (best angle/quality per student) then one accuracy-first
 *   processing pass with no time limit; captures survive app close.
 */
const LiteAttendanceMode: React.FC = () => {
  const { signals, preference, setPreference } = usePerformanceMode();
  const [mode, setMode] = useState<'qr' | 'face'>('qr');

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-card p-3 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Zap className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0 text-sm">
          <div className="font-semibold text-foreground">Lite Mode active</div>
          <div className="text-muted-foreground text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
            {signals.slowNetwork && (
              <span className="inline-flex items-center gap-1"><WifiOff className="w-3 h-3" />Slow network ({signals.effectiveType})</span>
            )}
            {signals.saveData && <span>· Data-saver on</span>}
            {signals.lowMemory && <span>· Low memory</span>}
            {signals.lowCPU && <span>· Limited CPU</span>}
            {!signals.slowNetwork && !signals.saveData && !signals.lowMemory && !signals.lowCPU && (
              <span>Optimized for smooth, non-stop attendance.</span>
            )}
          </div>
        </div>
        <button
          onClick={() => setPreference(preference === 'on' ? 'auto' : 'off')}
          className="text-xs font-medium text-primary underline underline-offset-2"
        >
          Turn off
        </button>
      </div>

      {/* Method switch — plain buttons, no animation */}
      <div className="grid grid-cols-2 gap-2">
        {([
          { key: 'qr' as const, label: 'QR Scanner', icon: QrCode, desc: 'Fastest · moving cards' },
          { key: 'face' as const, label: 'Face Loop', icon: ScanFace, desc: 'Capture all · then process' },
        ]).map(opt => {
          const active = mode === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => setMode(opt.key)}
              className={`rounded-xl border px-3 py-2 text-left ${
                active ? 'border-primary bg-primary/10' : 'border-border bg-card'
              }`}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <opt.icon className="w-4 h-4" /> {opt.label}
              </span>
              <span className="block text-[11px] text-muted-foreground">{opt.desc}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-3 border-b border-border">
          <div className="text-sm font-semibold text-foreground">
            {mode === 'qr' ? 'QR Attendance' : 'Loop Face Attendance'}
          </div>
          <div className="text-xs text-muted-foreground">
            {mode === 'qr'
              ? 'Point camera at ID card — marks instantly, keeps scanning'
              : 'Capture every student first, then tap Process all — no time limit, highest accuracy'}
          </div>
        </div>
        <div className="p-2 sm:p-4">
          {mode === 'qr' ? <LiteQRScanner autoStart /> : <LiteLoopFaceScanner />}
        </div>
      </div>
    </div>
  );
};

export default LiteAttendanceMode;
