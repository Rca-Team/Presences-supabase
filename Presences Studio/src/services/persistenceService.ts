import { Slide, Chapter, SubTopic, SubjectCurriculum } from '../types/smartboard';

const SESSION_STORAGE_KEY = 'presences_studios_active_lecture_v1';

export interface SavedLectureSession {
  timestamp: number;
  gradeLabel: string;
  subject: SubjectCurriculum;
  chapter: Chapter;
  subTopic: SubTopic;
  slides: Slide[];
  currentSlideIndex: number;
}

export class PersistenceService {
  /**
   * Save entire active smartboard lecture state
   */
  public static saveSession(session: SavedLectureSession) {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
      console.warn('Local lecture save warning (quota exceeded):', e);
    }
  }

  /**
   * Check if an active session exists to resume
   */
  public static getSavedSession(): SavedLectureSession | null {
    try {
      const data = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!data) return null;
      const parsed = JSON.parse(data);
      // Ensure session is not older than 7 days
      if (Date.now() - parsed.timestamp < 7 * 24 * 60 * 60 * 1000) {
        return parsed;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Clear saved lecture
   */
  public static clearSession() {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {
      // ignore
    }
  }
}
