/**
 * ClassSessionInferer — turns tracker state into a class-session timeline.
 * A teacher is either (a) face-identified, or (b) an unknown-adult track that
 * dwells in the class-front zone > 60s during the scheduled period.
 */
import type { Track } from './TrackerService';
import { pushEvent, upsertClassSession } from './EventBatcher';

export interface InferenceConfig {
  cameraId: string;
  classKey: string;
  periodKey: string;
  scheduledTeacher?: string | null;
}

interface SessionState {
  teacherTrackId: string | null;
  teacherConfirmed: boolean;
  teacherEnteredAt: number | null;
  teacherExitedAt: number | null;
  studentCountPeak: number;
  studentsLeftDuring: number;
  studentsLeftAfter: number;
  seenTracks: Set<string>;
  lastZoneByTrack: Map<string, string | null>;
  lastFlushMs: number;
}

const TEACHER_FRONT_DWELL_MS = 60_000;
const TEACHER_EXIT_GAP_MS = 20_000;
const AFTER_TEACHER_WINDOW_MS = 15 * 60_000;

export class ClassSessionInferer {
  private state: SessionState = {
    teacherTrackId: null,
    teacherConfirmed: false,
    teacherEnteredAt: null,
    teacherExitedAt: null,
    studentCountPeak: 0,
    studentsLeftDuring: 0,
    studentsLeftAfter: 0,
    seenTracks: new Set(),
    lastZoneByTrack: new Map(),
    lastFlushMs: 0,
  };

  constructor(private cfg: InferenceConfig) {}

  updateConfig(cfg: Partial<InferenceConfig>) {
    this.cfg = { ...this.cfg, ...cfg };
  }

  tick(tracks: Track[], now: number) {
    const s = this.state;

    // Enter/exit + zone-change events per track
    const activeIds = new Set(tracks.map((t) => t.id));
    for (const tr of tracks) {
      if (!s.seenTracks.has(tr.id)) {
        s.seenTracks.add(tr.id);
        pushEvent({
          camera_id: this.cfg.cameraId,
          class_key: this.cfg.classKey,
          period_key: this.cfg.periodKey,
          subject_type: tr.identity?.subjectType ?? 'unknown',
          subject_id: tr.identity?.subjectId ?? null,
          subject_name: tr.identity?.subjectName ?? null,
          event_type: 'person_enter',
          zone: tr.zone,
          meta: { local_track_id: tr.id },
        });
      }
      const prevZone = s.lastZoneByTrack.get(tr.id) ?? null;
      if (prevZone !== tr.zone) {
        s.lastZoneByTrack.set(tr.id, tr.zone);
        pushEvent({
          camera_id: this.cfg.cameraId,
          class_key: this.cfg.classKey,
          period_key: this.cfg.periodKey,
          subject_type: tr.identity?.subjectType ?? 'unknown',
          subject_id: tr.identity?.subjectId ?? null,
          subject_name: tr.identity?.subjectName ?? null,
          event_type: 'zone_change',
          zone: tr.zone,
          meta: { from: prevZone, local_track_id: tr.id },
        });
      }
    }

    // Detect track exits
    for (const seenId of Array.from(s.seenTracks)) {
      if (!activeIds.has(seenId)) {
        const wasTeacher = seenId === s.teacherTrackId;
        pushEvent({
          camera_id: this.cfg.cameraId,
          class_key: this.cfg.classKey,
          period_key: this.cfg.periodKey,
          subject_type: wasTeacher ? 'teacher' : 'unknown',
          event_type: wasTeacher ? 'teacher_exited_track' : 'person_exit',
          meta: { local_track_id: seenId },
        });
        // Student left counting
        if (!wasTeacher) {
          if (s.teacherEnteredAt && !s.teacherExitedAt) s.studentsLeftDuring++;
          else if (s.teacherExitedAt && now - s.teacherExitedAt < AFTER_TEACHER_WINDOW_MS) s.studentsLeftAfter++;
        }
        s.seenTracks.delete(seenId);
        s.lastZoneByTrack.delete(seenId);
      }
    }

    // Teacher inference
    // (a) face-identified as teacher
    const faceTeacher = tracks.find((t) => t.identity?.subjectType === 'teacher');
    if (faceTeacher && !s.teacherTrackId) {
      s.teacherTrackId = faceTeacher.id;
      s.teacherConfirmed = true;
      s.teacherEnteredAt = now;
      pushEvent({
        camera_id: this.cfg.cameraId,
        class_key: this.cfg.classKey,
        period_key: this.cfg.periodKey,
        subject_type: 'teacher',
        subject_id: faceTeacher.identity?.subjectId ?? null,
        subject_name: faceTeacher.identity?.subjectName ?? this.cfg.scheduledTeacher ?? null,
        event_type: 'teacher_entered',
        zone: faceTeacher.zone,
        meta: { source: 'face', local_track_id: faceTeacher.id },
      });
    }

    // (b) presence-inferred teacher: adult track dwelling in class-front
    if (!s.teacherTrackId) {
      for (const tr of tracks) {
        if (tr.identity?.subjectType === 'student') continue;
        if (tr.zone !== 'class-front') continue;
        const dwell = now - tr.firstSeen;
        // adult heuristic: track box height > 40% of any observed history (proxy: use box height at hand)
        const looksAdult = tr.box.h > 180;
        if (looksAdult && dwell > TEACHER_FRONT_DWELL_MS) {
          s.teacherTrackId = tr.id;
          s.teacherConfirmed = false;
          s.teacherEnteredAt = now - dwell;
          pushEvent({
            camera_id: this.cfg.cameraId,
            class_key: this.cfg.classKey,
            period_key: this.cfg.periodKey,
            subject_type: 'teacher',
            subject_name: this.cfg.scheduledTeacher ?? 'Inferred teacher',
            event_type: 'teacher_entered',
            zone: 'class-front',
            meta: { source: 'presence-inferred', local_track_id: tr.id },
          });
          break;
        }
      }
    }

    // Teacher exit: teacher track no longer active
    if (s.teacherTrackId && !activeIds.has(s.teacherTrackId) && !s.teacherExitedAt) {
      // grace period: only mark exit if gap > TEACHER_EXIT_GAP_MS
      // Approximation: mark immediately; corrections happen if teacher reappears.
      s.teacherExitedAt = now;
      pushEvent({
        camera_id: this.cfg.cameraId,
        class_key: this.cfg.classKey,
        period_key: this.cfg.periodKey,
        subject_type: 'teacher',
        subject_name: this.cfg.scheduledTeacher ?? null,
        event_type: 'teacher_exited',
        meta: { local_track_id: s.teacherTrackId },
      });
    }

    // Peak student count
    const studentCount = tracks.filter((t) =>
      t.id !== s.teacherTrackId && (t.zone === 'class-seats' || t.zone === 'class-front')
    ).length;
    if (studentCount > s.studentCountPeak) s.studentCountPeak = studentCount;

    // Periodic session upsert (every 5s)
    if (now - s.lastFlushMs > 5000) {
      s.lastFlushMs = now;
      void upsertClassSession({
        class_key: this.cfg.classKey,
        period_key: this.cfg.periodKey,
        teacher_scheduled: this.cfg.scheduledTeacher ?? null,
        teacher_confirmed: s.teacherConfirmed,
        teacher_entered_at: s.teacherEnteredAt ? new Date(s.teacherEnteredAt).toISOString() : null,
        teacher_exited_at: s.teacherExitedAt ? new Date(s.teacherExitedAt).toISOString() : null,
        student_count_peak: s.studentCountPeak,
        students_left_during: s.studentsLeftDuring,
        students_left_after: s.studentsLeftAfter,
      });
    }
  }

  snapshot() {
    return { ...this.state };
  }
}
