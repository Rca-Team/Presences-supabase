import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { User, CheckCircle, AlertCircle, HelpCircle } from 'lucide-react';

const STORAGE_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/face-images/`;

export interface RecognizedFaceData {
  id: string;
  name: string;
  status: 'present' | 'late' | 'review' | 'unrecognized';
  confidence?: number;
  strictScore?: number;
  thresholdTarget?: number;
  imageUrl?: string;
  box: { x: number; y: number; width: number; height: number };
}

interface LiveFaceOverlayProps {
  faces: RecognizedFaceData[];
  containerWidth: number;
  containerHeight: number;
  mirrored?: boolean;
}

const LiveFaceOverlay: React.FC<LiveFaceOverlayProps> = ({
  faces,
  containerWidth,
  containerHeight,
  mirrored = true
}) => {
  if (faces.length === 0) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present': return 'bg-green-500 border-green-400';
      case 'late': return 'bg-yellow-500 border-yellow-400';
      case 'review': return 'bg-blue-500 border-blue-400';
      case 'unrecognized': return 'bg-red-500 border-red-400';
      default: return 'bg-slate-500 border-slate-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'present': return <CheckCircle className="h-3 w-3" />;
      case 'late': return <AlertCircle className="h-3 w-3" />;
      case 'review': return <AlertCircle className="h-3 w-3" />;
      case 'unrecognized': return <HelpCircle className="h-3 w-3" />;
      default: return null;
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      <AnimatePresence>
        {faces.map((face, index) => {
          // Calculate position based on face box
          const scaleX = containerWidth / (face.box.width * 4); // Approximate video scale
          const scaleY = containerHeight / (face.box.height * 4);
          
          // Position the info card below the face
          const left = mirrored 
            ? containerWidth - ((face.box.x + face.box.width) * scaleX / 4) 
            : face.box.x * scaleX / 4;
          const top = Math.min(
            (face.box.y + face.box.height) * scaleY / 4 + 10,
            containerHeight - 80
          );
          
          return (
            <motion.div
              key={face.id}
              initial={{ opacity: 0, y: -10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ delay: index * 0.1, duration: 0.3 }}
              className="absolute pointer-events-none"
              style={{
                left: `${Math.max(10, Math.min(left, containerWidth - 180))}px`,
                top: `${top}px`,
                minWidth: '160px',
              }}
            >
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-md border-2 shadow-lg ${
                face.status === 'present' ? 'bg-green-500/20 border-green-500/50' :
                face.status === 'late' ? 'bg-yellow-500/20 border-yellow-500/50' :
                face.status === 'review' ? 'bg-blue-500/20 border-blue-500/50' :
                'bg-red-500/20 border-red-500/50'
              }`}>
                {/* Profile Photo */}
                <div className="relative">
                  <Avatar className={`h-10 w-10 ring-2 ring-offset-1 ring-offset-background ${
                    face.status === 'present' ? 'ring-green-400' :
                    face.status === 'late' ? 'ring-yellow-400' :
                    face.status === 'review' ? 'ring-blue-400' :
                    'ring-red-400'
                  }`}>
                    {face.imageUrl ? (
                      <AvatarImage 
                        src={face.imageUrl.startsWith('http') || face.imageUrl.startsWith('data:') 
                          ? face.imageUrl 
                          : `${STORAGE_BASE_URL}${face.imageUrl}`
                        }
                        alt={face.name}
                        className="object-cover"
                      />
                    ) : (
                      <AvatarFallback className="bg-slate-700">
                        <User className="h-5 w-5 text-slate-300" />
                      </AvatarFallback>
                    )}
                  </Avatar>
                  {/* Status Indicator */}
                  <div className={`absolute -bottom-1 -right-1 p-0.5 rounded-full ${getStatusColor(face.status)}`}>
                    {getStatusIcon(face.status)}
                  </div>
                </div>

                {/* Name and Status */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {face.status === 'unrecognized' ? 'Unknown' : face.name}
                  </p>
                  <div className="flex items-center gap-1">
                    <Badge 
                      variant="secondary" 
                      className={`text-[10px] px-1.5 py-0 h-4 ${
                        face.status === 'present' ? 'bg-green-500/30 text-green-200' :
                        face.status === 'late' ? 'bg-yellow-500/30 text-yellow-200' :
                        face.status === 'review' ? 'bg-blue-500/30 text-blue-200' :
                        'bg-red-500/30 text-red-200'
                      }`}
                    >
                      {face.status === 'present' ? 'Present' : 
                       face.status === 'late' ? 'Late' :
                       face.status === 'review' ? 'Review' : 'Unknown'}
                    </Badge>
                    {face.confidence && face.status !== 'unrecognized' && (
                      <span className="text-[10px] text-slate-300">
                        {Math.round(face.confidence)}%
                      </span>
                    )}
                    {face.status === 'review' && typeof face.strictScore === 'number' && (
                      <span className="text-[10px] text-blue-200">
                        3D {Math.round(face.strictScore * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default LiveFaceOverlay;