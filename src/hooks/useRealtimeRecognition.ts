/**
 * useRealtimeRecognition
 *
 * React binding for RealtimeRecognitionEngine: full-fps preview, throttled
 * detection on downscaled frames, recognise-once tracking, indexed gallery
 * search and background DB writes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createRecognitionEngine,
  type EngineOptions,
  type EngineStats,
  type IdentifiedFace,
  type RecognitionEngine,
} from '@/services/face-recognition/RealtimeRecognitionEngine';
import type { FaceTrack } from '@/services/face-recognition/FaceTrackerService';

export interface UseRealtimeRecognitionOptions extends Omit<EngineOptions, 'onTracks' | 'onStats'> {
  /** start automatically once the video element is available */
  autoStart?: boolean;
}

export function useRealtimeRecognition(
  videoRef: { current: HTMLVideoElement | null } | (() => HTMLVideoElement | null),
  options: UseRealtimeRecognitionOptions = {},
) {
  const [tracks, setTracks] = useState<FaceTrack[]>([]);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [running, setRunning] = useState(false);
  const engineRef = useRef<RecognitionEngine | null>(null);
  const onIdentifiedRef = useRef(options.onIdentified);
  onIdentifiedRef.current = options.onIdentified;

  const getVideo = useCallback(() => {
    return typeof videoRef === 'function' ? videoRef() : videoRef.current;
  }, [videoRef]);

  useEffect(() => {
    const engine = createRecognitionEngine(getVideo, {
      detectFps: options.detectFps ?? 9,
      detectionWidth: options.detectionWidth ?? 640,
      matchThreshold: options.matchThreshold,
      shortlist: options.shortlist,
      maxConcurrentJobs: options.maxConcurrentJobs,
      onTracks: next => setTracks([...next]),
      onStats: setStats,
      onIdentified: (face: IdentifiedFace) => onIdentifiedRef.current?.(face),
    });
    engineRef.current = engine;

    if (options.autoStart) {
      engine.start();
      setRunning(true);
    }

    return () => {
      engine.stop();
      engineRef.current = null;
      setRunning(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getVideo, options.autoStart, options.detectFps, options.detectionWidth]);

  const start = useCallback(() => {
    engineRef.current?.start();
    setRunning(true);
  }, []);

  const stop = useCallback(() => {
    engineRef.current?.stop();
    setRunning(false);
    setTracks([]);
  }, []);

  const refreshGallery = useCallback(async () => {
    await engineRef.current?.refreshGallery();
  }, []);

  return { tracks, stats, running, start, stop, refreshGallery };
}

export default useRealtimeRecognition;
