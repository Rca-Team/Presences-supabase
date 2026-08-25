/**
 * ScanTelemetry — tiny pub/sub bridge between the scanners and the UI shells
 * (NeuralConsole etc.) so the console panels show real-time state instead of
 * idle placeholders.
 */
import { useEffect, useState } from 'react';

export type ScanPhase = 'idle' | 'searching' | 'analyzing' | 'matched' | 'unknown';

export interface ScanTelemetryState {
  phase: ScanPhase;
  statusText: string;
  /** 0-100 live confidence of the current inference. */
  confidence: number;
  facesInFrame: number;
  subjectName?: string;
  subjectMeta?: string;
  subjectImage?: string;
  /** Attendance marked in this browser session. */
  sessionCount: number;
  updatedAt: number;
}

const initial: ScanTelemetryState = {
  phase: 'idle',
  statusText: 'Standby',
  confidence: 0,
  facesInFrame: 0,
  sessionCount: 0,
  updatedAt: Date.now(),
};

let state: ScanTelemetryState = { ...initial };
const listeners = new Set<(s: ScanTelemetryState) => void>();

const emit = () => {
  state = { ...state, updatedAt: Date.now() };
  listeners.forEach((l) => l(state));
};

export const scanTelemetry = {
  get: () => state,
  set(patch: Partial<ScanTelemetryState>) {
    state = { ...state, ...patch };
    emit();
  },
  faces(count: number) {
    if (state.facesInFrame === count) return;
    state = {
      ...state,
      facesInFrame: count,
      phase: count > 0 ? (state.phase === 'matched' ? 'matched' : 'analyzing') : 'searching',
      statusText: count > 0 ? `Analyzing ${count} face${count > 1 ? 's' : ''}…` : 'Searching for faces…',
    };
    emit();
  },
  matched(payload: { name: string; confidence: number; meta?: string; image?: string; counted?: boolean }) {
    state = {
      ...state,
      phase: 'matched',
      statusText: `Matched · ${payload.name}`,
      confidence: Math.round(Math.max(0, Math.min(100, payload.confidence > 1 ? payload.confidence : payload.confidence * 100))),
      subjectName: payload.name,
      subjectMeta: payload.meta,
      subjectImage: payload.image,
      sessionCount: state.sessionCount + (payload.counted === false ? 0 : 1),
    };
    emit();
  },
  unknown(confidence = 0) {
    state = {
      ...state,
      phase: 'unknown',
      statusText: 'No identity match',
      confidence: Math.round(Math.max(0, Math.min(100, confidence > 1 ? confidence : confidence * 100))),
    };
    emit();
  },
  reset() {
    state = { ...initial, sessionCount: state.sessionCount };
    emit();
  },
  subscribe(fn: (s: ScanTelemetryState) => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useScanTelemetry(): ScanTelemetryState {
  const [snap, setSnap] = useState(scanTelemetry.get());
  useEffect(() => scanTelemetry.subscribe(setSnap) as unknown as () => void, []);
  return snap;
}
