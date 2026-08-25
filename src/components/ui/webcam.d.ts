
import { ForwardRefExoticComponent, RefAttributes } from 'react';

// Define the Webcam component props
export interface WebcamProps {
  onCapture?: (imageData: string) => void;
  showControls?: boolean;
  className?: string;
  overlayClassName?: string;
  cameraFacing?: 'user' | 'environment';
  aspectRatio?: 'square' | 'video';
  autoStart?: boolean;
  enhancementEnabled?: boolean;
}

// Define the Webcam component with ref
export type WebcamComponent = ForwardRefExoticComponent<WebcamProps & RefAttributes<HTMLVideoElement>>;

declare const Webcam: WebcamComponent;
export default Webcam;
