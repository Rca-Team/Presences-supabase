
import { loadModels, areModelsLoaded, forceReloadModels } from '@/services/FaceRecognitionService';

/**
 * Utility function to test model loading
 */
export async function testModelLoading(forceReload = false): Promise<{success: boolean; message: string}> {
  console.log('Starting model loading test...');
  
  try {
    // Check if models are already loaded
    if (areModelsLoaded() && !forceReload) {
      console.log('Models are already loaded. Skipping load test.');
      return { 
        success: true, 
        message: 'Models already loaded successfully' 
      };
    }
    
    if (forceReload) {
      console.log('Force reloading models...');
      await forceReloadModels();
    } else {
      // Try to load models
      console.log('Attempting to load face recognition models...');
      await loadModels();
    }
    
    console.log('Model loading test completed successfully.');
    return {
      success: true,
      message: 'Models loaded successfully'
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Model loading test failed:', errorMessage);
    
    return {
      success: false,
      message: `Model loading failed: ${errorMessage}`
    };
  }
}

/**
 * Call this function from a component's useEffect or a button handler
 * to manually test model loading
 */
export async function runModelTest(forceReload = false): Promise<{success: boolean; message: string}> {
  console.log(`Running model test (force reload: ${forceReload})`);
  
  try {
    // Check network connectivity first
    try {
      const networkTest = await fetch('/models/tiny_face_detector_model-weights_manifest.json', {
        method: 'HEAD',
        cache: 'no-cache'
      });
      
      if (!networkTest.ok) {
        return {
          success: false,
          message: `Network error: Unable to access models directory (status: ${networkTest.status})`
        };
      }
      
      console.log('Network connectivity test passed');
    } catch (networkError) {
      return {
        success: false,
        message: `Network error: ${networkError instanceof Error ? networkError.message : String(networkError)}`
      };
    }
    
    // Now test the actual model loading
    const result = await testModelLoading(forceReload);
    console.log('Model test finished with result:', result);
    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Model test failed with error:', errorMessage);
    return {
      success: false,
      message: `Unexpected error: ${errorMessage}`
    };
  }
}

/**
 * Diagnostic function to check if models are accessible
 */
export async function checkModelsAccessibility(): Promise<{accessible: boolean; errors: string[]}> {
  const errors: string[] = [];
  const modelFiles = [
    'tiny_face_detector_model-weights_manifest.json',
    'face_landmark_68_model-weights_manifest.json',
    'face_recognition_model-weights_manifest.json'
  ];
  
  let allAccessible = true;
  
  for (const file of modelFiles) {
    try {
      const response = await fetch(`/models/${file}`, { 
        cache: 'no-cache',
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (!response.ok) {
        allAccessible = false;
        errors.push(`Cannot access ${file}: status ${response.status}`);
        continue;
      }
      
      // Try to parse the JSON
      try {
        const text = await response.text();
        JSON.parse(text);
      } catch (jsonError) {
        allAccessible = false;
        errors.push(`Invalid JSON in ${file}: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
      }
    } catch (error) {
      allAccessible = false;
      errors.push(`Error accessing ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  return {
    accessible: allAccessible,
    errors
  };
}
