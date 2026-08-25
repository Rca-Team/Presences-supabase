## Goal

Make Attendance → Loop Mode fully functional end-to-end, mirroring the reliability of the Face ID scanner. When the `batch-face-attendance` edge function fails or is unreachable, Loop Mode should transparently fall back to the same client-side pipeline the Face ID scanner already uses — so attendance still gets marked.

## Current problems

- `submit()` and `submitDetached()` only call `supabase.functions.invoke('batch-face-attendance', …)`. If the function 500s, times out, or is offline, nothing gets marked and the queue is cleared on detached send.
- No auto-submit: the user must manually press Process, so "just like Face ID" (continuous marking) is not achieved.
- No per-item result feedback on the tiles (marked / already / unmatched / low confidence).
- Detached send drops the queue optimistically without confirming server accepted the payload.

## Fix plan

### 1. Add a client-side fallback recognizer (same brains as Face ID)

In `src/components/attendance/LoopFaceScanMode.tsx`, import and use:
- `recognizeFace` and `recordAttendance` from `@/services/face-recognition/RecognitionService`
- `getAllTrainedDescriptors` is already loaded inside `recognizeFace`, so no extra prep needed.

New helper `processLocally(items)`:
- For each captured item, call `recognizeFace(new Float32Array(item.descriptor))`.
- If `recognized && confidence >= 0.65` (same gate the edge function uses), call `recordAttendance(employee.id, 'present', confidence, { source: 'loop-mode-local', metadata: { name } }, item.imageDataUrl, 'ai-scan')`.
- Aggregate a `summary { total, marked, alreadyMarked, unrecognized, lowConfidence }` matching the edge-function shape so the existing "Last batch" UI keeps working.
- `recordAttendance` already handles duplicates-per-day and cutoff → late logic, so we get parity with the server path.

### 2. Wire fallback into both submit paths

- `submit()`: try edge function first; on error OR when `data?.summary` is missing, run `processLocally(items)` and surface a toast noting "Processed locally (offline mode)".
- `submitDetached()`: same try/catch. If edge fails, run local processing synchronously in the background (do not clear queue until local pass finishes). Persist queue in `localStorage` until fully processed so a page reload can resume.

### 3. Auto-process for continuous "Face ID feel"

- Add an "Auto process" toggle (default ON). When ON and queue length ≥ `AUTO_BATCH_SIZE` (5) OR queue has been idle for `AUTO_FLUSH_MS` (4000 ms), automatically call `submit()`.
- Reset the idle timer whenever a new face is committed.
- Keep the manual Process / Send & Close-Safe buttons for explicit control.

### 4. Per-tile result overlay

- After processing, map results by `clientId` and briefly overlay each queue tile with a status pill (✓ marked, • already, ✗ no match, ⚠ low conf) before removing successfully-marked tiles from the queue. Unmatched tiles stay so the user can retry.

### 5. Robustness touches

- Resume queue on mount from `localStorage` (already done) and auto-flush pending items if online.
- Guard against duplicate descriptor dimensions when comparing (same guard `recognizeFace` uses).
- Show a small "Server unavailable — using on-device recognition" banner when the last edge call failed, cleared on next success.

## Files touched

- `src/components/attendance/LoopFaceScanMode.tsx` (only file changed)

No schema, edge-function, or Face ID scanner changes required — Loop Mode piggybacks on the already-proven client recognizer.

## Verification

- Start Loop Mode, capture several faces, press Process → toast shows marked count, tiles clear.
- Simulate edge failure (temporarily rename function name in a local test) → Loop Mode falls back and still marks attendance via `recordAttendance`.
- Reload page mid-queue → items persist and auto-flush kicks in.
