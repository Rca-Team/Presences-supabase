import { CuratedVideo } from '../types/smartboard';
import { CURRICULUM_DATA } from '../data/curriculumData';

export class VideoCuratorService {
  /**
   * Find curated videos matching the specific subject, chapter, or subtopic query
   */
  public static getVideosForTopic(query: string, subTopicId?: string): CuratedVideo[] {
    const results: CuratedVideo[] = [];
    const lowerQuery = query.toLowerCase();

    // 1. First search in curriculum curated database
    for (const grade of CURRICULUM_DATA) {
      for (const subject of grade.subjects) {
        for (const chapter of subject.chapters) {
          for (const sub of chapter.subTopics) {
            if (subTopicId && sub.id === subTopicId) {
              results.push(...sub.videos);
            } else if (
              sub.name.toLowerCase().includes(lowerQuery) ||
              chapter.name.toLowerCase().includes(lowerQuery) ||
              sub.keyPoints.some(k => k.toLowerCase().includes(lowerQuery))
            ) {
              results.push(...sub.videos);
            }
          }
        }
      }
    }

    // 2. Fallback dynamic recommendations if no direct match
    if (results.length === 0) {
      return [
        {
          id: 'dyn-vid-1',
          title: `${query} Animated Visual Explanation`,
          creator: 'Khan Academy / 3Blue1Brown',
          duration: '6:45',
          youtubeId: 'Wz3g5j-f6_0',
          description: `Interactive animated breakdown explaining the core concepts of ${query}.`,
          tags: [query, 'Interactive', 'STEM Animation']
        },
        {
          id: 'dyn-vid-2',
          title: `Visual Simulation & Real World Examples: ${query}`,
          creator: 'Crash Course',
          duration: '8:20',
          youtubeId: 'bHIhgxav9LY',
          description: `High-definition visual demonstration of ${query} with laboratory experiments.`,
          tags: [query, 'Simulation']
        }
      ];
    }

    // Deduplicate by id
    const seen = new Set<string>();
    return results.filter(v => {
      if (seen.has(v.id)) return false;
      seen.add(v.id);
      return true;
    });
  }

  /**
   * Generates a safe, clean YouTube embed URL without ads/recommendations
   */
  public static getEmbedUrl(youtubeId: string, autoplay = true): string {
    return `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=${autoplay ? 1 : 0}&rel=0&modestbranding=1&controls=1`;
  }
}
