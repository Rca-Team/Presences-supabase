import React, { useState } from 'react';
import { CuratedVideo } from '../../types/smartboard';
import { VideoCuratorService } from '../../services/videoCuratorService';
import { Play, X, Maximize2, Minimize2, Move } from 'lucide-react';

interface FloatingVideoPipProps {
  video: CuratedVideo | null;
  onClose: () => void;
}

export const FloatingVideoPip: React.FC<FloatingVideoPipProps> = ({
  video,
  onClose,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [position, setPosition] = useState({ x: 24, y: 70 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  if (!video) return null;

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setPosition({
      x: Math.max(10, Math.min(window.innerWidth - 300, e.clientX - dragStart.x)),
      y: Math.max(60, Math.min(window.innerHeight - 200, e.clientY - dragStart.y))
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: isExpanded ? '480px' : '340px',
      }}
      className="absolute z-30 bg-slate-900/95 border-2 border-emerald-500/60 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl select-none animate-in zoom-in-95"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Draggable Titlebar */}
      <div
        onPointerDown={handlePointerDown}
        className="px-3 py-2 bg-slate-800/90 border-b border-slate-700/80 flex items-center justify-between cursor-move text-slate-200"
      >
        <div className="flex items-center gap-1.5 truncate max-w-[220px]">
          <Play className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 animate-pulse" />
          <span className="text-xs font-bold text-white truncate">
            {video.title}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
            title={isExpanded ? "Collapse PiP" : "Expand PiP"}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-red-400"
            title="Close Video"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Video Player */}
      <div className="aspect-video w-full bg-black">
        <iframe
          src={VideoCuratorService.getEmbedUrl(video.youtubeId)}
          title={video.title}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>

      {/* Bottom info pill */}
      <div className="px-3 py-1.5 bg-slate-950/80 flex items-center justify-between text-[11px] text-slate-400">
        <span>🎬 {video.creator}</span>
        <span className="text-emerald-400 font-semibold">Live In-Class Animation</span>
      </div>
    </div>
  );
};
