
// Re-export all functions from our modular services
export { 
  loadModels, 
  getFaceDescriptor,
  descriptorToString,
  stringToDescriptor,
  areModelsLoaded,
  forceReloadModels
} from './face-recognition/ModelService';

export {
  registerFace,
  storeUnrecognizedFace,
  uploadFaceImage
} from './face-recognition/RegistrationService';

export {
  recognizeFace,
  recordAttendance
} from './face-recognition/RecognitionService';

export {
  getCutoffTime,
  updateCutoffTime,
  getAttendanceCutoffTime,
  updateAttendanceCutoffTime,
  formatCutoffTime,
  isPastCutoffTime
} from './attendance/AttendanceSettingsService';

// Progressive training exports
export {
  storeFaceSample,
  getUserFaceDescriptors,
  getAllTrainedDescriptors,
  getUserTrainingStats,
  calculateBestMatchDistance
} from './face-recognition/ProgressiveTrainingService';

// Turbo recognition exports (GPU + Workers + Cache)
export {
  initializeTurboPipeline,
  turboDetectAndRecognize,
  turboRecognizeSingle,
  turboClassroomScan,
  getTurboPerformanceStats,
  isTurboPipelineReady
} from './face-recognition/TurboRecognitionService';

// GPU acceleration exports
export {
  initializeGPU,
  warmupGPU,
  isGPUAvailable,
  getGPUStats
} from './face-recognition/GPUAccelerationService';

// Worker pool exports
export {
  initializeWorkerPool,
  matchDescriptorParallel,
  batchMatchDescriptors,
  getWorkerPoolStats
} from './face-recognition/WorkerPoolService';

// Descriptor cache exports
export {
  initializeDescriptorCache,
  syncFromSupabase,
  findNearestMatch,
  getCacheStats
} from './face-recognition/DescriptorCacheService';
