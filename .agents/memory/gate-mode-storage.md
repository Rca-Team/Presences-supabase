---
name: Gate Mode Data Storage
description: How gate mode persists session data, resumes sessions, and uses DB-backed stats.
---

## Source of truth for session stats
All current-session stats (unique entered, unknown count, auto-marked count, recent entries) are derived from `gate_entries` rows for the active `gate_session_id`, not from in-memory React state.

**Why:** In-memory state is lost on refresh. Using DB-backed rows means the session survives page reloads and the right-hand stats overlay is accurate.

**How to apply:**
- `sessionEntries` state in `GateMode.tsx` is populated by `loadSessionEntries(sessionId)` and kept live by a realtime INSERT subscription on `gate_entries`.
- `autoMarkedCount`, `uniqueStudents`, `unknownCount` are computed via `useMemo` over `sessionEntries`.
- `GateStatsOverlay` receives `recentEntries={sessionEntries.slice(0,30)}`.

## Session resume on refresh
On bootstrap, `resumeActiveSession()` finds the most recent `gate_sessions` row for today where `ended_at` is null, restores `sessionId`, `gateName`, `className/section/subject`, period key, and loads its `gate_entries`.

**Why:** Operators reload the page or switch tabs. Without auto-resume they lose the running session and start duplicate sessions.

## Persisting gate entries
`handleFaceDetected` first optimistically adds the entry to `sessionEntries`/`entries`, then awaits `persistGateEntry()` which inserts into `gate_entries` with:
- `gate_session_id`, `student_id`, `student_name`, `is_recognized`, `confidence_score`
- `gate_name`, `snapshot_url`, `entry_time`, `class`, `section`
- `metadata: { periodKey, subject, source: 'gate-mode' }`

Errors now surface as a toast instead of failing silently.

## Realtime deduplication
The subscription callback uses the atomic updater form:
```
setSessionEntries(prev => prev.some(e => e.id === row.id) ? prev : [entry, ...prev])
```

**Why:** Prevents duplicate rows if the optimistic local insert and the realtime INSERT arrive in different orders.

## Auto-marked count is DB-backed
Removed scanner-local `autoMarkedCount` state. The scanner receives `markedCount` as a prop from the parent, and the parent computes it as `sessionEntries.filter(e => e.isRecognized).length`.

**Why:** The scanner counter reset to 0 on every remount, so it was wrong after refresh. Deriving it from persisted rows makes it accurate.

## End session totals
`endSession` writes `total_entries` and `unknown_entries` to `gate_sessions` by counting `sessionEntries`, not the in-memory `entries` array.
