
import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { videoEnhancementService } from '@/services/ai/VideoEnhancementService';

interface WebcamProps {
  onCapture?: (image: string) => void;
  className?: string;
  overlayClassName?: string;
  cameraFacing?: 'user' | 'environment';
  showControls?: boolean;
  aspectRatio?: 'square' | 'video';
  autoStart?: boolean;
  enhancementEnabled?: boolean;
}

export const Webcam = forwardRef<HTMLVideoElement, WebcamProps>(({
  onCapture,
  className,
  overlayClassName,
  cameraFacing = 'user',
  showControls = true,
  aspectRatio = 'video',
  autoStart = true,
  enhancementEnabled = false,
}, ref) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const enhancementCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isActive, setIsActive] = useState(autoStart);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [currentFacing, setCurrentFacing] = useState<'user' | 'environment'>(cameraFacing);
  const retryTimeoutRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const enhancementIntervalRef = useRef<number | null>(null);
  const MAX_RETRY_ATTEMPTS = 3;

  useImperativeHandle(ref, () => localVideoRef.current!, []);

  const startCamera = async () => {
    try {
      // Clear previous errors and set loading state
      setIsLoading(true);
      setError(null);
      
      // Clear any existing timeout
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      
      // Stop any existing stream
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      
      // Set a timeout to detect if camera access takes too long
      const timeoutId = window.setTimeout(() => {
        if (attemptCountRef.current < MAX_RETRY_ATTEMPTS) {
          attemptCountRef.current++;
          console.log(`Camera access timeout, retry attempt ${attemptCountRef.current}`);
          startCamera(); // Retry
        } else {
          setError('Camera access timeout. Please check your camera permissions and try again.');
          setIsLoading(false);
          setIsActive(false);
          attemptCountRef.current = 0; // Reset for future attempts
        }
      }, 8000); // 8 seconds timeout
      
      console.log(`Requesting camera access with facing mode: ${cameraFacing}, attempt ${attemptCountRef.current + 1}`);
      
      // Try with ideal constraints first
      const constraints = {
        video: { 
          facingMode: currentFacing,
          width: { ideal: 1280 },
          height: { ideal: 720 } 
        }
      };
      
      // Request camera access with better error handling
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Clear timeout as we've successfully gotten the stream
        window.clearTimeout(timeoutId);
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = mediaStream;
          
          // Wait for video to be ready
          await new Promise<void>((resolve) => {
            if (localVideoRef.current) {
              localVideoRef.current.onloadedmetadata = () => {
                resolve();
              };
            } else {
              resolve();
            }
          });
          
          // Play the video - with error handling
          try {
            await localVideoRef.current.play();
            console.log('Video playback started successfully');
          } catch (playError) {
            console.error('Error starting video playback:', playError);
            throw new Error('Failed to start video playback');
          }
        }
        
        setStream(mediaStream);
        setIsLoading(false);
        attemptCountRef.current = 0; // Reset attempt counter on success
        console.log('Camera started successfully');
      } catch (mediaError) {
        // Clear timeout as we got an error
        window.clearTimeout(timeoutId);
        
        console.error('Error accessing camera with ideal constraints:', mediaError);
        
        // If we failed with ideal constraints, try with minimal constraints
        if (attemptCountRef.current < MAX_RETRY_ATTEMPTS) {
          attemptCountRef.current++;
          console.log(`Retrying with minimal constraints, attempt ${attemptCountRef.current}`);
          
          try {
            const minimalStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: currentFacing }
            });
            
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = minimalStream;
              await localVideoRef.current.play();
            }
            
            setStream(minimalStream);
            setIsLoading(false);
            attemptCountRef.current = 0; // Reset attempt counter on success
            console.log('Camera started successfully with minimal constraints');
          } catch (minimalError) {
            console.error('Error accessing camera with minimal constraints:', minimalError);
            throw minimalError; // Let the outer catch block handle this
          }
        } else {
          throw mediaError; // Let the outer catch block handle this
        }
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          setError('Camera access denied. Please allow camera access in your browser settings.');
        } else if (err.name === 'NotFoundError') {
          setError('No camera found. Please connect a camera and try again.');
        } else if (err.name === 'AbortError') {
          setError('Camera access timeout. Please try again or use a different browser.');
        } else {
          setError(`Camera error: ${err.message}`);
        }
      } else {
        setError('Camera access denied or not available. Please check your permissions.');
      }
      
      setIsLoading(false);
      setIsActive(false);
    }
  };

  useEffect(() => {
    if (isActive) {
      startCamera();
    } else if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    }
    
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
      }
      if (enhancementIntervalRef.current) {
        window.clearInterval(enhancementIntervalRef.current);
      }
    };
  }, [isActive, currentFacing]);

  // Video enhancement loop - optimized for performance
  useEffect(() => {
    if (!enhancementEnabled || !localVideoRef.current || !enhancementCanvasRef.current || !isActive) {
      return;
    }

    const enhanceFrame = async () => {
      if (!localVideoRef.current || !enhancementCanvasRef.current || isEnhancing) {
        return;
      }

      const video = localVideoRef.current;
      const canvas = enhancementCanvasRef.current;

      if (video.readyState < 2 || video.videoWidth === 0) {
        return;
      }

      setIsEnhancing(true);
      
      try {
        // Initialize enhancement service if needed
        if (!videoEnhancementService.isEnhancementAvailable()) {
          await videoEnhancementService.initialize();
        }

        // Enhance the current frame
        const enhancedCanvas = await videoEnhancementService.enhanceVideoFrame(video);
        
        // Draw enhanced frame to display canvas
        canvas.width = enhancedCanvas.width;
        canvas.height = enhancedCanvas.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(enhancedCanvas, 0, 0);
        }
      } catch (error) {
        console.warn('Frame enhancement failed:', error);
      } finally {
        setIsEnhancing(false);
      }
    };

    // Reduced frequency: 2 FPS for better performance (500ms interval)
    enhancementIntervalRef.current = window.setInterval(enhanceFrame, 500);

    return () => {
      if (enhancementIntervalRef.current) {
        window.clearInterval(enhancementIntervalRef.current);
      }
    };
  }, [enhancementEnabled, isActive]);

  const handleCapture = () => {
    if (!localVideoRef.current || !canvasRef.current) return;
    
    const video = localVideoRef.current;
    const canvas = canvasRef.current;
    
    if (video.readyState < 2 || video.paused || video.ended) {
      console.log('Video not ready for capture');
      return;
    }
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageData = canvas.toDataURL('image/png');
      
      if (onCapture) {
        onCapture(imageData);
        console.log('Image captured and passed to parent component');
      }
    }
  };

  const toggleCamera = () => {
    // Reset attempt counter when manually toggling
    attemptCountRef.current = 0;
    setIsActive(prev => !prev);
  };

  const flipCamera = () => {
    attemptCountRef.current = 0;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setCurrentFacing(prev => prev === 'user' ? 'environment' : 'user');
  };

  return (
    <div className={cn(
      "relative overflow-hidden bg-muted rounded-xl",
      aspectRatio === 'square' ? "aspect-square" : "aspect-video",
      className
    )}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-sm z-10">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-10 w-10 text-destructive mb-3"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
          <p className="text-destructive font-medium mb-2">{error}</p>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={toggleCamera}
          >
            Try Again
          </Button>
        </div>
      )}
      
      {/* Video element (hidden when enhancement is active) */}
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className={cn(
          "w-full h-full object-cover transition-opacity duration-300",
          isActive && !isLoading && !error ? "opacity-100" : "opacity-0",
          enhancementEnabled && "hidden"
        )}
      style={{ transform: currentFacing === 'user' ? 'scaleX(-1)' : 'none' }}
      />

      {/* Enhanced video canvas (shown when enhancement is active) */}
      {enhancementEnabled && (
        <canvas
          ref={enhancementCanvasRef}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            isActive && !isLoading && !error ? "opacity-100" : "opacity-0"
          )}
          style={{ transform: currentFacing === 'user' ? 'scaleX(-1)' : 'none' }}
        />
      )}

      {/* Enhancement indicator */}
      {enhancementEnabled && isActive && !error && (
        <div className="absolute top-2 right-2 bg-primary/80 text-primary-foreground px-2 py-1 rounded-full text-xs font-medium flex items-center space-x-1 animate-fade-in z-10">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
          <span>Enhanced</span>
        </div>
      )}
      
      <canvas ref={canvasRef} className="hidden" />
      
      <div className={cn(
        "absolute inset-0 border-4 border-transparent rounded-xl transition-all duration-300",
        overlayClassName
      )} />
      
      {showControls && (
        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 z-20">
          {isActive && !error ? (
            <>
              <Button 
                variant="outline" 
                size="icon" 
                className="bg-white/80 backdrop-blur-sm hover:bg-white"
                onClick={handleCapture}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5"
                >
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </Button>
              
              <Button 
                variant="outline" 
                size="icon" 
                className="bg-white/80 backdrop-blur-sm hover:bg-white"
                onClick={flipCamera}
                title={currentFacing === 'user' ? 'Switch to back camera' : 'Switch to front camera'}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
                  <path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
                  <path d="m14 3 2 2-2 2" />
                  <path d="m10 17-2 2 2 2" />
                </svg>
              </Button>

              <Button 
                variant="outline" 
                size="icon" 
                className="bg-white/80 backdrop-blur-sm hover:bg-white text-destructive"
                onClick={toggleCamera}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5"
                >
                  <line x1="18" x2="6" y1="6" y2="18" />
                  <line x1="6" x2="18" y1="6" y2="18" />
                </svg>
              </Button>
            </>
          ) : (
            <Button 
              size="sm" 
              onClick={toggleCamera}
              className="bg-white/80 backdrop-blur-sm text-primary hover:bg-white"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-4 w-4 mr-2"
              >
                <path d="M23 7 16 12 23 17z" />
                <rect width="15" height="14" x="1" y="5" rx="2" ry="2" />
              </svg>
              Start Camera
            </Button>
          )}
        </div>
      )}
    </div>
  );
});

Webcam.displayName = "Webcam";

export default Webcam;
