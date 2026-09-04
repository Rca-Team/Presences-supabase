import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { User, CheckCircle2, AlertCircle, HelpCircle, ShieldCheck } from 'lucide-react';

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
  videoWidth?: number;
  videoHeight?: number;
  mirrored?: boolean;
}

function calculateCardPosition(
  box: { x: number; y: number; width: number; height: number },
  cw: number,
  ch: number,
  vw: number,
  vh: number,
  mirrored: boolean
) {
  if (!cw || !ch) return { left: 16, top: 16 };

  const safeVw = vw || 1280;
  const safeVh = vh || 720;
  const scale = Math.max(cw / safeVw, ch / safeVh);
  const renderedW = safeVw * scale;
  const renderedH = safeVh * scale;
  const offsetX = (cw - renderedW) / 2;
  const offsetY = (ch - renderedH) / 2;

  let screenX = offsetX + (box.x || 0) * scale;
  let screenY = offsetY + (box.y || 0) * scale;
  let screenW = (box.width || 120) * scale;
  let screenH = (box.height || 120) * scale;

  if (mirrored) {
    screenX = cw - (screenX + screenW);
  }

  const CARD_WIDTH = 220;
  const CARD_HEIGHT = 68;

  // Center horizontally relative to face box
  let left = screenX + screenW / 2 - CARD_WIDTH / 2;
  let top = screenY + screenH + 10;

  // If card overflows bottom of container, flip above face
  if (top + CARD_HEIGHT > ch - 16) {
    top = Math.max(16, screenY - CARD_HEIGHT - 10);
  }

  // Keep within container boundary
  left = Math.max(16, Math.min(left, cw - CARD_WIDTH - 16));
  top = Math.max(16, Math.min(top, ch - CARD_HEIGHT - 16));

  return { left, top };
}

const LiveFaceOverlay: React.FC<LiveFaceOverlayProps> = ({
  faces,
  containerWidth,
  containerHeight,
  videoWidth = 1280,
  videoHeight = 720,
  mirrored = true
}) => {
  if (faces.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      <AnimatePresence>
        {faces.map((face, index) => {
          const { left, top } = calculateCardPosition(
            face.box,
            containerWidth,
            containerHeight,
            videoWidth,
            videoHeight,
            mirrored
          );

          // Calibrate confidence score: if <= 1.0 (e.g. 0.94), multiply by 100
          const rawConf = face.confidence ?? 0.95;
          const confidencePct = Math.round(rawConf <= 1.0 ? rawConf * 100 : rawConf);

          const isPresent = face.status === 'present';
          const isLate = face.status === 'late';
          const isReview = face.status === 'review';

          const accentBorder = isPresent
            ? 'border-emerald-500/40 dark:border-emerald-400/50 shadow-emerald-500/15'
            : isLate
            ? 'border-amber-500/40 dark:border-amber-400/50 shadow-amber-500/15'
            : isReview
            ? 'border-blue-500/40 dark:border-blue-400/50 shadow-blue-500/15'
            : 'border-rose-500/40 dark:border-rose-400/50 shadow-rose-500/15';

          const ringColor = isPresent
            ? 'ring-emerald-500 text-emerald-600 dark:text-emerald-400'
            : isLate
            ? 'ring-amber-500 text-amber-600 dark:text-amber-400'
            : isReview
            ? 'ring-blue-500 text-blue-600 dark:text-blue-400'
            : 'ring-rose-500 text-rose-600 dark:text-rose-400';

          const statusBadge = isPresent
            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
            : isLate
            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
            : isReview
            ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
            : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';

          const statusDot = isPresent
            ? 'bg-emerald-500'
            : isLate
            ? 'bg-amber-500'
            : isReview
            ? 'bg-blue-500'
            : 'bg-rose-500';

          const displayName = face.status === 'unrecognized'
            ? 'Unrecognized Face'
            : (face.name || 'Student');

          return (
            <motion.div
              key={face.id}
              initial={{ opacity: 0, y: 8, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.94 }}
              transition={{ delay: index * 0.05, duration: 0.25, ease: 'easeOut' }}
              className="absolute pointer-events-none"
              style={{
                left: `${left}px`,
                top: `${top}px`,
                width: '220px',
              }}
            >
              <div
                className={`flex items-center gap-2.5 p-2 rounded-2xl bg-card/95 dark:bg-zinc-950/90 backdrop-blur-xl border ${accentBorder} shadow-xl shadow-black/10 transition-all`}
              >
                {/* Profile Photo Avatar */}
                <div className="relative shrink-0">
                  <Avatar className={`h-11 w-11 rounded-xl ring-2 ${ringColor} ring-offset-1 ring-offset-background shadow-sm`}>
                    {face.imageUrl ? (
                      <AvatarImage
                        src={
                          face.imageUrl.startsWith('http') || face.imageUrl.startsWith('data:')
                            ? face.imageUrl
                            : `${STORAGE_BASE_URL}${face.imageUrl}`
                        }
                        alt={displayName}
                        className="object-cover rounded-xl"
                      />
                    ) : (
                      <AvatarFallback className="bg-gradient-to-br from-slate-700 to-slate-900 text-white rounded-xl">
                        <User className="h-5 w-5 text-emerald-400" />
                      </AvatarFallback>
                    )}
                  </Avatar>

                  {/* Status Indicator Icon */}
                  <div
                    className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center text-white shadow-sm ${
                      isPresent
                        ? 'bg-emerald-500'
                        : isLate
                        ? 'bg-amber-500'
                        : isReview
                        ? 'bg-blue-500'
                        : 'bg-rose-500'
                    }`}
                  >
                    {isPresent ? (
                      <CheckCircle2 className="h-3 w-3 stroke-[2.5]" />
                    ) : isLate ? (
                      <AlertCircle className="h-3 w-3 stroke-[2.5]" />
                    ) : (
                      <HelpCircle className="h-3 w-3 stroke-[2.5]" />
                    )}
                  </div>
                </div>

                {/* Name, Status & Confidence */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3 text-emerald-500 shrink-0" />
                    <p className="text-xs font-bold text-foreground truncate tracking-tight uppercase">
                      {displayName}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 mt-1">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${statusBadge}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
                      {isPresent
                        ? 'Present'
                        : isLate
                        ? 'Late'
                        : isReview
                        ? 'Review'
                        : 'Unknown'}
                    </span>

                    {confidencePct > 0 && face.status !== 'unrecognized' && (
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        {confidencePct}%
                      </span>
                    )}

                    {face.status === 'review' && typeof face.strictScore === 'number' && (
                      <span className="text-[10px] font-semibold text-blue-500">
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