import React, { useState, useEffect, useRef } from 'react';
import { TopicQuestion, DrawingStroke, Point } from '../../types/smartboard';
import { Swords, Clock, CheckCircle2, RotateCcw, X, Award, Play, Pause } from 'lucide-react';
import confetti from 'canvas-confetti';
import { audioService } from '../../services/audioService';

interface StudentVsStudentChallengeProps {
  question: TopicQuestion;
  student1Name?: string;
  student2Name?: string;
  onClose: () => void;
}

export const StudentVsStudentChallenge: React.FC<StudentVsStudentChallengeProps> = ({
  question,
  student1Name = 'Team Blue',
  student2Name = 'Team Green',
  onClose,
}) => {
  const canvas1Ref = useRef<HTMLCanvasElement | null>(null);
  const canvas2Ref = useRef<HTMLCanvasElement | null>(null);

  const [timer1, setTimer1] = useState(0);
  const [timer2, setTimer2] = useState(0);
  const [isTimer1Running, setIsTimer1Running] = useState(true);
  const [isTimer2Running, setIsTimer2Running] = useState(true);
  const [winner, setWinner] = useState<string | null>(null);

  // Inking states
  const [strokes1, setStrokes1] = useState<DrawingStroke[]>([]);
  const [strokes2, setStrokes2] = useState<DrawingStroke[]>([]);
  const activeStroke1 = useRef<DrawingStroke | null>(null);
  const activeStroke2 = useRef<DrawingStroke | null>(null);

  // Timer intervals
  useEffect(() => {
    let int1: any = null;
    let int2: any = null;
    if (isTimer1Running) int1 = setInterval(() => setTimer1(t => t + 1), 1000);
    if (isTimer2Running) int2 = setInterval(() => setTimer2(t => t + 1), 1000);
    return () => { clearInterval(int1); clearInterval(int2); };
  }, [isTimer1Running, isTimer2Running]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleDeclareWinner = (teamName: string) => {
    setWinner(teamName);
    setIsTimer1Running(false);
    setIsTimer2Running(false);
    audioService.playSuccessChime();
    confetti({
      particleCount: 100,
      spread: 80,
      origin: { y: 0.6 }
    });
  };

  // Canvas 1 Pointer Handlers (Student 1)
  const handleDown1 = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvas1Ref.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const pt: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 0.5 };
    activeStroke1.current = {
      id: `s1-${Date.now()}`,
      tool: 'pen',
      points: [pt],
      color: '#38bdf8', // Cyan/Blue
      width: 3,
      opacity: 1,
      createdAt: Date.now()
    };
    drawCanvas(canvas1Ref.current, [...strokes1, activeStroke1.current]);
  };

  const handleMove1 = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeStroke1.current || !canvas1Ref.current) return;
    const rect = canvas1Ref.current.getBoundingClientRect();
    const pt: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    activeStroke1.current.points.push(pt);
    drawCanvas(canvas1Ref.current, [...strokes1, activeStroke1.current]);
  };

  const handleUp1 = () => {
    if (!activeStroke1.current) return;
    setStrokes1(prev => [...prev, activeStroke1.current!]);
    activeStroke1.current = null;
  };

  // Canvas 2 Pointer Handlers (Student 2)
  const handleDown2 = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvas2Ref.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const pt: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 0.5 };
    activeStroke2.current = {
      id: `s2-${Date.now()}`,
      tool: 'pen',
      points: [pt],
      color: '#4ade80', // Emerald/Green
      width: 3,
      opacity: 1,
      createdAt: Date.now()
    };
    drawCanvas(canvas2Ref.current, [...strokes2, activeStroke2.current]);
  };

  const handleMove2 = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeStroke2.current || !canvas2Ref.current) return;
    const rect = canvas2Ref.current.getBoundingClientRect();
    const pt: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    activeStroke2.current.points.push(pt);
    drawCanvas(canvas2Ref.current, [...strokes2, activeStroke2.current]);
  };

  const handleUp2 = () => {
    if (!activeStroke2.current) return;
    setStrokes2(prev => [...prev, activeStroke2.current!]);
    activeStroke2.current = null;
  };

  const drawCanvas = (canvas: HTMLCanvasElement | null, allStrokes: DrawingStroke[]) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let y = 35; y < canvas.height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(10, y);
      ctx.lineTo(canvas.width - 10, y);
      ctx.stroke();
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    allStrokes.forEach(s => {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      const pts = s.points;
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
    });
  };

  useEffect(() => {
    const setupCanvas = (canvas: HTMLCanvasElement | null) => {
      if (!canvas || !canvas.parentElement) return;
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    };
    setupCanvas(canvas1Ref.current);
    setupCanvas(canvas2Ref.current);
  }, []);

  return (
    <div className="absolute inset-0 z-40 bg-slate-950/95 backdrop-blur-xl flex flex-col select-none overflow-hidden animate-in fade-in">
      {/* Top Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
            <Swords className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
                Board Challenge Mode
              </span>
              <span className="text-xs text-slate-400">• 2-Player Simultaneous Race</span>
            </div>
            <h2 className="text-sm md:text-base font-bold text-white truncate max-w-2xl">
              {question.prompt}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {winner && (
            <div className="flex items-center gap-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-3 py-1 rounded-xl text-xs font-bold animate-bounce">
              <Award className="w-4 h-4" />
              <span>Winner: {winner}!</span>
            </div>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-xs"
          >
            Exit Challenge
          </button>
        </div>
      </div>

      {/* 50/50 Split Canvas Workspace */}
      <div className="flex-1 grid grid-cols-2 divide-x divide-slate-800 overflow-hidden">
        
        {/* Lane 1: Blue Team */}
        <div className="flex flex-col p-4 bg-blue-950/20">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-blue-900/40">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                1
              </div>
              <span className="text-sm font-bold text-blue-300">{student1Name}</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 font-mono text-xs text-blue-300 bg-blue-900/40 px-2.5 py-1 rounded-lg">
                <Clock className="w-3.5 h-3.5" />
                <span>{formatTime(timer1)}</span>
              </div>
              <button
                onClick={() => handleDeclareWinner(student1Name)}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold"
              >
                Finished!
              </button>
            </div>
          </div>

          <div className="flex-1 relative rounded-xl border border-blue-800/40 bg-slate-950/70 overflow-hidden">
            <canvas
              ref={canvas1Ref}
              className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
              onPointerDown={handleDown1}
              onPointerMove={handleMove1}
              onPointerUp={handleUp1}
              onPointerCancel={handleUp1}
            />
          </div>
        </div>

        {/* Lane 2: Green Team */}
        <div className="flex flex-col p-4 bg-emerald-950/20">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-emerald-900/40">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                2
              </div>
              <span className="text-sm font-bold text-emerald-300">{student2Name}</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 font-mono text-xs text-emerald-300 bg-emerald-900/40 px-2.5 py-1 rounded-lg">
                <Clock className="w-3.5 h-3.5" />
                <span>{formatTime(timer2)}</span>
              </div>
              <button
                onClick={() => handleDeclareWinner(student2Name)}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold"
              >
                Finished!
              </button>
            </div>
          </div>

          <div className="flex-1 relative rounded-xl border border-emerald-800/40 bg-slate-950/70 overflow-hidden">
            <canvas
              ref={canvas2Ref}
              className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
              onPointerDown={handleDown2}
              onPointerMove={handleMove2}
              onPointerUp={handleUp2}
              onPointerCancel={handleUp2}
            />
          </div>
        </div>

      </div>
    </div>
  );
};
