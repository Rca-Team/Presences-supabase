---
name: Gate Mode Professional Rebuild
description: Key decisions and pitfalls from the complete gate mode face-recognition rebuild (June 2025).
---

## Descriptor-based face tracking
Instead of grid-based `toDetectionKey(box)` (which resets stability on slight movement),
tracks are identified by descriptor Euclidean distance < 0.55 via `resolveTrack()`.
Each track gets a stable UUID used as key for cooldown/label/cache Maps.

**Why:** Grid keys cause jitter — same person moving 1 pixel got a new key, resetting stability counter.

**How to apply:** Always use track.id as the Map key, never box coordinates.

## Stability vs duplicate-cooldown ordering
Student duplicate-cooldown (25 s) must NOT be set before stability accumulates.
Correct order:
1. Check `attendanceMarkedRef` (terminal — already marked today) → skip
2. Accumulate stability hits unconditionally
3. Check borderline retry (60–72% conf: give one more chance)
4. If stable + high conf → auto-mark → then set studentCooldownRef
5. If not stable/below threshold → check UI cooldown → call onFaceDetected once per 25 s

**Why:** Setting the 25 s cooldown on first detection means detections 2 and 3 (needed for STABILITY_HITS=3) are suppressed within the 6 s stability window — stability can never reach 3.

## Adaptive cloud disable
After CLOUD_MAX_FAILS (3) consecutive Gemini Vision failures → set `cloudDisabledRef.current = true`,
show amber "Local only" badge, call `onCloudStatusChange(true)` prop.
Reset only on component remount.

**Why:** Without this, every detection cycle fires an edge function call that always fails, adding ~2 s latency per face.

## Unknown face cooldown (stranger alert spam fix)
Unknown faces are keyed by 100-px region grid (`regionKey(box)`).
`unknownCooldownRef` prevents firing stranger alert more than once per 60 s per region.

**Why:** Without cooldown, same unknown face triggers a new alert every REDETECTION_COOLDOWN_MS (3 s).

## Attendance write failure handling
On `recordAttendance` failure: undo `attendanceMarkedRef`/`periodMarkedRef` so it can retry next cycle.
Still call `onFaceDetected(entry)` with the RECOGNIZED identity (not unknown).

**Why:** Previous code emitted `isRecognized: false` on failure → triggered stranger alert for a known student.

## Stranger photo capture
Scanner now captures `captureFrame(0.80)` for unknown faces and passes it as `entry.photoUrl`.
`GateMode.tsx` stores this in `strangerEntry.photoUrl` → `StrangerAlert` shows the thumbnail.

**Why:** Previously `photoUrl` was always undefined for strangers (scanner never set it).

## TSX generic function pitfall
`const fn = <V>(...)` in a `.tsx` file is parsed as JSX → compile error.
Fix: use `function fn<V>(...)` declaration syntax inside useEffect callbacks.

## Auto zone manual adjustment
Pass `detectionBox ?? autoZone` (not just `detectionBox`) to `DetectionBoxEditor` initial prop.
When no custom box saved, editor starts from the computed auto zone so operator can fine-tune it.
Save → becomes custom detectionBox. Clear → reverts to computed autoZone.

## Spam prevention — only call onFaceDetected on auto-mark
The non-auto-mark recognized path (`confidence >= MIN_RECOGNITION_CONF but not stable`) must NOT call onFaceDetected.
The liveMatches HUD already shows real-time recognition. Calling onFaceDetected early causes double sounds, double gate_entries, double late forms.
Only call onFaceDetected inside the auto-mark block after recordAttendance succeeds.

## Stats accuracy
- Enrolled student count: query user_roles WHERE role='student'; fall back to face_descriptors if empty.
- "Session Marks" stat: use autoMarkedCount from scanner (via onAutoMarkCountChange prop), NOT entries.filter(isRecognized).length.
- Sync autoMarkedCount to parent via useEffect watching the state value.

## Mobile UI layering rules
- Never use `absolute top-2` overlays in GateMode on top of GateModeScanner — scanner has its own `absolute top-2` status pills.
- GateEntryFeedback: `bottom-20 sm:bottom-4` (above the 8px floating bar on mobile).
- StrangerAlert, LateEntryForm: `fixed bottom-20 right-4 sm:bottom-6` (safe area for iOS home indicator).
- Live HUD in scanner: `bottom-36 sm:bottom-16` on mobile.
- Mobile top scanner bar: show only Live/faces/marked/cloud badges; hide fps/latency/blocked/enhancing (use `hidden sm:flex`).

## Non-blocking overlays
StrangerAlert and LateEntryForm are now corner slide-in panels (bottom-right), not full-screen overlays.
Both auto-dismiss (StrangerAlert: 10 s, LateEntryForm: user-dismissed or skipped).
Both have animated progress bars so operator knows auto-dismiss is coming.
