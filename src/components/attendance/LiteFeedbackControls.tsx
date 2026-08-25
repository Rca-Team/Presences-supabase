import React from 'react';
import { Volume2, VolumeX, Vibrate, VibrateOff, Sun, SunDim } from 'lucide-react';
import type { LiteFeedbackKey, LiteFeedbackPrefs, LiteSignalKind } from '@/hooks/useLiteFeedback';

/**
 * Minimal feedback controls for Lite mode: sound / vibrate / flash toggles plus
 * a one-line text status. Flat buttons, no animation, no gradients.
 */

export const LiteFeedbackControls: React.FC<{
  prefs: LiteFeedbackPrefs;
  onToggle: (key: LiteFeedbackKey) => void;
  status?: string;
  className?: string;
}> = ({ prefs, onToggle, status, className }) => {
  const items: { key: LiteFeedbackKey; on: React.ElementType; off: React.ElementType; label: string }[] = [
    { key: 'sound', on: Volume2, off: VolumeX, label: 'Sound' },
    { key: 'vibrate', on: Vibrate, off: VibrateOff, label: 'Vibrate' },
    { key: 'flash', on: Sun, off: SunDim, label: 'Flash' },
  ];

  return (
    <div className={`flex items-center justify-center gap-2 flex-wrap ${className || ''}`}>
      {items.map(item => {
        const enabled = prefs[item.key];
        const Icon = enabled ? item.on : item.off;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onToggle(item.key)}
            aria-pressed={enabled}
            aria-label={`${item.label} ${enabled ? 'on' : 'off'}`}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${
              enabled ? 'border-primary text-primary' : 'border-border text-muted-foreground'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {item.label}
            <span className="opacity-70">{enabled ? 'on' : 'off'}</span>
          </button>
        );
      })}
      {status ? (
        <span className="text-[11px] text-muted-foreground border-l border-border pl-2">{status}</span>
      ) : null}
    </div>
  );
};

/** Solid one-frame tint used as the "flash" cue. Renders nothing when idle. */
export const LiteFlashOverlay: React.FC<{ kind: LiteSignalKind | null }> = ({ kind }) => {
  if (!kind) return null;
  const tone = kind === 'fail' ? 'bg-destructive' : kind === 'warn' ? 'bg-accent' : 'bg-primary';
  return <div className={`pointer-events-none absolute inset-0 ${tone} opacity-60`} />;
};

export default LiteFeedbackControls;
