import React, { useState, useEffect, useRef } from 'react';
import { TopicQuestion, DrawingStroke, Point } from '../../types/smartboard';
import { 
  Clock, 
  CheckCircle2, 
  Circle, 
  Eye, 
  EyeOff, 
  RotateCcw, 
  Sparkles, 
  User, 
  Play, 
  Pause,
  Award,
  BookOpen
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface SplitSlideWorkspaceProps {
  question: TopicQuestion;
  onClose: () => void;
  studentName?: string;
  onStampToWhiteboard?: (strokes: DrawingStroke[]) => void;
}

export const SplitSlideWorkspace: React.FC<SplitSlideWorkspaceProps> = ({
  question,
  onClose,
  studentName = 'Student',
}) => {
  // Real-time solving timer
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(true);

  // Checkpoints
  const [checkpoints, setCheckpoints] = useState({
    givenIdentified: false,
    formulaApplied: false,
    finalAnswerVerified: false,
  });

  // Progressive Solution Reveal for Teacher
  const [revealedStepCount, setRevealedStepCount] = useState(0);
  const [showFinalAnswer, setShowFinalAnswer] = useState(false);

  // Dedicated Student Canvas Ref & Inking
  const studentCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const teacherCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [studentStrokes, setStudentStrokes] = useState<DrawingStroke[]>([]);
  const isStudentDrawingRef = useRef(false);
  const currentStudentStrokeRef = useRef<DrawingStroke | null>(null);

  // Stopwatch timer interval
  useEffect(() => {
    let interval: any = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setSecondsElapsed(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  // Format time MM:SS
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Toggle checkpoint
  const toggleCheckpoint = (key: keyof typeof checkpoints) => {
    const updated = { ...checkpoints, [key]: !checkpoints[key] };
    setCheckpoints(updated);

    // If all checkpoints completed, trigger congratulatory confetti!
    if (updated.givenIdentified && updated.formulaApplied && updated.finalAnswerVerified) {
      setIsTimerRunning(false);
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  };

  // Student canvas pointer handlers
  const handleStudentPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = studentCanvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const rect = canvas.getBoundingClientRect();
    const pt: Point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5
    };

    isStudentDrawingRef.current = true;
    currentStudentStrokeRef.current = {
      id: `s-stroke-${Date.now()}`,
      tool: 'pen',
      points: [pt],
      color: '#38bdf8', // Cyan pen for student
      width: 3,
      opacity: 1,
      createdAt: Date.now()
    };
    drawStudentCanvas();
  };

  const handleStudentPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isStudentDrawingRef.current || !currentStudentStrokeRef.current) return;
    const canvas = studentCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pt: Point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5
    };

    currentStudentStrokeRef.current.points.push(pt);
    drawStudentCanvas();
  };

  const handleStudentPointerUp = () => {
    if (!isStudentDrawingRef.current) return;
    isStudentDrawingRef.current = false;
    if (currentStudentStrokeRef.current) {
      setStudentStrokes(prev => [...prev, currentStudentStrokeRef.current!]);
      currentStudentStrokeRef.current = null;
    }
    drawStudentCanvas();
  };

  const drawStudentCanvas = () => {
    const canvas = studentCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw lined notebook background guides
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 1;
    for (let y = 40; y < canvas.height; y += 34) {
      ctx.beginPath();
      ctx.moveTo(10, y);
      ctx.lineTo(canvas.width - 10, y);
      ctx.stroke();
    }

    // Draw all strokes
    const allStrokes = [...studentStrokes];
    if (currentStudentStrokeRef.current) {
      allStrokes.push(currentStudentStrokeRef.current);
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    allStrokes.forEach(stroke => {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      const pts = stroke.points;
      if (pts.length < 2) return;

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const xc = (pts[i].x + pts[i - 1].x) / 2;
        const yc = (pts[i].y + pts[i - 1].y) / 2;
        ctx.quadraticCurveTo(pts[i - 1].x, pts[i - 1].y, xc, yc);
      }
      ctx.stroke();
    });
  };

  useEffect(() => {
    const canvas = studentCanvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    drawStudentCanvas();
  }, []);

  return (
    <div className="absolute inset-0 z-30 bg-slate-950/95 backdrop-blur-xl flex flex-col select-none overflow-hidden animate-in fade-in duration-200">
      {/* Top Slide Header with Question Banner */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-3.5 flex items-start justify-between gap-6 shadow-md">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
              Interactive Slide
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {question.difficulty}
            </span>
            <span className="text-xs text-slate-400 font-medium">
              Target Time: {question.estimatedTimeMin} min
            </span>
          </div>
          <h2 className="text-lg md:text-xl font-bold text-white leading-snug">
            {question.prompt}
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {/* Realtime Solving Stopwatch HUD */}
          <div className="flex items-center gap-2 bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-700 shadow-inner">
            <Clock className="w-5 h-5 text-emerald-400 animate-pulse" />
            <span className="text-lg font-mono font-bold text-emerald-400">
              {formatTime(secondsElapsed)}
            </span>
            <button
              onClick={() => setIsTimerRunning(!isTimerRunning)}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 ml-1"
              title={isTimerRunning ? 'Pause' : 'Resume'}
            >
              {isTimerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={() => { setSecondsElapsed(0); setIsTimerRunning(true); }}
              className="p-1 hover:bg-slate-700 rounded text-slate-300"
              title="Reset Timer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium text-sm transition"
          >
            Back to Whiteboard
          </button>
        </div>
      </div>

      {/* Dual Workspaces: Left (Student Zone) & Right (Teacher Zone) */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800/80 overflow-hidden">
        
        {/* ================= ZONE A: STUDENT WORKSPACE ================= */}
        <div className="flex flex-col bg-slate-900/40 p-4 h-full overflow-hidden">
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
                <User className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-bold text-cyan-300">
                  {studentName}'s Live Workspace
                </span>
                <span className="text-xs text-slate-400 block">
                  Write solution using stylus on the lines below
                </span>
              </div>
            </div>

            <button
              onClick={() => setStudentStrokes([])}
              className="text-xs text-slate-400 hover:text-red-400 px-2 py-1 rounded bg-slate-800/60"
            >
              Clear Ink
            </button>
          </div>

          {/* Real-Time Solving Milestone Checkpoints */}
          <div className="flex items-center gap-4 py-2 px-3 bg-slate-800/40 rounded-lg mb-3 text-xs">
            <span className="text-slate-400 font-semibold">Milestones:</span>
            <button
              onClick={() => toggleCheckpoint('givenIdentified')}
              className={`flex items-center gap-1.5 transition font-medium ${
                checkpoints.givenIdentified ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {checkpoints.givenIdentified ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
              <span>1. Given Data</span>
            </button>

            <button
              onClick={() => toggleCheckpoint('formulaApplied')}
              className={`flex items-center gap-1.5 transition font-medium ${
                checkpoints.formulaApplied ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {checkpoints.formulaApplied ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
              <span>2. Formula Chosen</span>
            </button>

            <button
              onClick={() => toggleCheckpoint('finalAnswerVerified')}
              className={`flex items-center gap-1.5 transition font-medium ${
                checkpoints.finalAnswerVerified ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {checkpoints.finalAnswerVerified ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
              <span>3. Verified</span>
            </button>
          </div>

          {/* Touch-active Lined Canvas for student stylus writing */}
          <div className="flex-1 relative rounded-xl border border-slate-800/80 bg-slate-950/60 overflow-hidden shadow-inner">
            <canvas
              ref={studentCanvasRef}
              className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
              onPointerDown={handleStudentPointerDown}
              onPointerMove={handleStudentPointerMove}
              onPointerUp={handleStudentPointerUp}
              onPointerCancel={handleStudentPointerUp}
            />
          </div>
        </div>

        {/* ================= ZONE B: TEACHER WORKSPACE & REVEAL ================= */}
        <div className="flex flex-col bg-slate-900/60 p-4 h-full overflow-hidden">
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-bold text-purple-300">
                  Teacher Solution & Progressive Guidance
                </span>
                <span className="text-xs text-slate-400 block">
                  Reveal hints & step-by-step logic in stages
                </span>
              </div>
            </div>

            {/* Step Reveal Control Buttons */}
            <div className="flex items-center gap-2">
              {revealedStepCount < question.solutionSteps.length ? (
                <button
                  onClick={() => setRevealedStepCount(prev => prev + 1)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow transition"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Reveal Step {revealedStepCount + 1}</span>
                </button>
              ) : (
                <button
                  onClick={() => setRevealedStepCount(0)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Hide Steps</span>
                </button>
              )}
            </div>
          </div>

          {/* Hints Section */}
          {question.hints && question.hints.length > 0 && (
            <div className="mb-4 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                <Sparkles className="w-3.5 h-3.5" /> Quick Hints for Class
              </span>
              <ul className="text-xs text-amber-200/90 space-y-1 pl-4 list-disc">
                {question.hints.map((hint, i) => (
                  <li key={i}>{hint}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Progressive Step-by-Step Official Working */}
          <div className="flex-1 overflow-y-auto pr-2 space-y-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Canonical Working ({revealedStepCount} of {question.solutionSteps.length} Steps Revealed):
            </span>

            {question.solutionSteps.map((step, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-xl border transition duration-300 ${
                  idx < revealedStepCount
                    ? 'bg-slate-800/90 border-purple-500/40 text-slate-100 shadow-md'
                    : 'bg-slate-900/30 border-slate-800/40 text-slate-600 blur-[2px]'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-semibold text-purple-400 mb-1">
                  <span>Step {idx + 1}</span>
                  {idx < revealedStepCount && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                </div>
                <p className="text-sm font-mono leading-relaxed">
                  {idx < revealedStepCount ? step : 'Hidden step...'}
                </p>
              </div>
            ))}

            {/* Final Answer Banner */}
            <div className="mt-4 pt-3 border-t border-slate-800">
              {showFinalAnswer ? (
                <div className="bg-emerald-500/20 border border-emerald-500/40 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
                      Final Verified Answer
                    </span>
                    <span className="text-base font-mono font-bold text-emerald-300">
                      {question.finalAnswer}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowFinalAnswer(false)}
                    className="text-xs text-emerald-400/80 hover:text-emerald-200"
                  >
                    Hide
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowFinalAnswer(true)}
                  className="w-full py-2.5 bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2"
                >
                  <Award className="w-4 h-4" />
                  <span>Reveal Final Answer</span>
                </button>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
