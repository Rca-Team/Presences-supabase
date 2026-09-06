import React, { useState } from 'react';
import { 
  SubTopic, 
  CuratedVideo, 
  TopicQuestion, 
  MathCalculationResult 
} from '../../types/smartboard';
import { VideoCuratorService } from '../../services/videoCuratorService';
import { GeminiTeachingService } from '../../services/geminiTeachingService';
import { 
  Play, 
  Calculator, 
  HelpCircle, 
  Lightbulb, 
  Sparkles, 
  ChevronRight, 
  Plus, 
  ExternalLink,
  Split,
  Layers,
  Loader2,
  X
} from 'lucide-react';

interface TeacherCopilotDockProps {
  activeSubTopic: SubTopic;
  activeChapterName: string;
  onSendQuestionToSplitSlide: (question: TopicQuestion) => void;
  onStampTextToCanvas: (text: string) => void;
}

export const TeacherCopilotDock: React.FC<TeacherCopilotDockProps> = ({
  activeSubTopic,
  activeChapterName,
  onSendQuestionToSplitSlide,
  onStampTextToCanvas,
}) => {
  const [activeTab, setActiveTab] = useState<'videos' | 'calc' | 'questions' | 'analogies'>('videos');

  // Video embed modal state
  const [selectedVideo, setSelectedVideo] = useState<CuratedVideo | null>(null);

  // Calculation Performer state
  const [calcInput, setCalcInput] = useState('2x^2 - 7x + 3 = 0');
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcResult, setCalcResult] = useState<MathCalculationResult | null>(null);

  // Dynamic Question Generator state
  const [questionDifficulty, setQuestionDifficulty] = useState<'easy' | 'medium' | 'hard' | 'board-exam'>('medium');
  const [isGeneratingQuestion, setIsGeneratingQuestion] = useState(false);
  const [customQuestions, setCustomQuestions] = useState<TopicQuestion[]>([]);

  // Execute AI Calculation
  const handlePerformCalculation = async () => {
    if (!calcInput.trim()) return;
    setIsCalculating(true);
    try {
      const res = await GeminiTeachingService.calculateStepByStep(calcInput);
      setCalcResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsCalculating(false);
    }
  };

  // Generate real-time question with Gemini AI
  const handleGenerateLiveQuestion = async () => {
    setIsGeneratingQuestion(true);
    try {
      const q = await GeminiTeachingService.generateQuestion(
        `${activeChapterName}: ${activeSubTopic.name}`,
        questionDifficulty,
        'numerical'
      );
      setCustomQuestions(prev => [q, ...prev]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingQuestion(false);
    }
  };

  // Combine preloaded curriculum questions with dynamically generated questions
  const allQuestions = [...customQuestions, ...activeSubTopic.questions];

  // Get curated videos for this subtopic
  const videos = VideoCuratorService.getVideosForTopic(activeSubTopic.name, activeSubTopic.id);

  return (
    <div className="w-96 md:w-[420px] h-full bg-slate-900 border-l border-slate-800 flex flex-col shadow-2xl z-20 select-none">
      
      {/* Dock Top Banner */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white leading-tight">Jarvis Teaching Co-Pilot</h3>
            <span className="text-[11px] text-emerald-400 font-medium block truncate max-w-[240px]">
              {activeSubTopic.name}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="grid grid-cols-4 p-1.5 gap-1 bg-slate-950/60 border-b border-slate-800 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('videos')}
          className={`py-2 rounded-lg flex flex-col items-center gap-1 transition ${
            activeTab === 'videos'
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Play className="w-4 h-4" />
          <span>Videos</span>
        </button>

        <button
          onClick={() => setActiveTab('calc')}
          className={`py-2 rounded-lg flex flex-col items-center gap-1 transition ${
            activeTab === 'calc'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span>Solver</span>
        </button>

        <button
          onClick={() => setActiveTab('questions')}
          className={`py-2 rounded-lg flex flex-col items-center gap-1 transition ${
            activeTab === 'questions'
              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          <span>Questions</span>
        </button>

        <button
          onClick={() => setActiveTab('analogies')}
          className={`py-2 rounded-lg flex flex-col items-center gap-1 transition ${
            activeTab === 'analogies'
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Lightbulb className="w-4 h-4" />
          <span>Analogies</span>
        </button>
      </div>

      {/* Dock Content Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
        {/* ================= TAB 1: CURATED VIDEOS ================= */}
        {activeTab === 'videos' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider">
                Topic Visual Animations ({videos.length})
              </span>
              <span className="text-[11px] text-emerald-400 font-medium">Distraction-Free</span>
            </div>

            {videos.map(vid => (
              <div
                key={vid.id}
                className="bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded-xl p-3 transition shadow-sm group cursor-pointer"
                onClick={() => setSelectedVideo(vid)}
              >
                <div className="flex items-start gap-3">
                  <div className="relative w-20 h-14 rounded-lg bg-slate-900 flex-shrink-0 flex items-center justify-center overflow-hidden border border-slate-700">
                    <img
                      src={`https://img.youtube.com/vi/${vid.youtubeId}/mqdefault.jpg`}
                      alt={vid.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/10 transition">
                      <Play className="w-6 h-6 text-white drop-shadow" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-white leading-snug line-clamp-2 mb-1 group-hover:text-red-400 transition">
                      {vid.title}
                    </h4>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span>{vid.creator}</span>
                      <span>•</span>
                      <span>{vid.duration}</span>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-300 mt-2 line-clamp-2">
                  {vid.description}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ================= TAB 2: AI CALCULATION PERFORMER ================= */}
        {activeTab === 'calc' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Input Equation, Formula or Expression:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={calcInput}
                  onChange={(e) => setCalcInput(e.target.value)}
                  placeholder="e.g. 3x^2 - 12x + 9 = 0 or 1/f = 1/20 - 1/(-30)"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-cyan-500"
                />
                <button
                  onClick={handlePerformCalculation}
                  disabled={isCalculating}
                  className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow"
                >
                  {isCalculating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Solve'}
                </button>
              </div>
            </div>

            {/* Quick Math Shortcuts */}
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <button
                onClick={() => setCalcInput('2x^2 + 5x - 12 = 0')}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300 font-mono"
              >
                Quadratic Roots
              </button>
              <button
                onClick={() => setCalcInput('1/f = 1/60 - 1/20')}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300 font-mono"
              >
                Lens Formula
              </button>
              <button
                onClick={() => setCalcInput('1/R = 1/2 + 1/3 + 1/6')}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300 font-mono"
              >
                Parallel Resistors
              </button>
            </div>

            {/* Calculation Result Breakdown */}
            {calcResult && (
              <div className="bg-slate-950/80 border border-cyan-500/30 rounded-xl p-3.5 space-y-3 shadow-md animate-in fade-in">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                    {calcResult.category} Solution
                  </span>
                  <button
                    onClick={() => onStampTextToCanvas(`${calcResult.problem}\nAnswer: ${calcResult.finalAnswer}`)}
                    className="text-[11px] text-cyan-300 hover:text-white flex items-center gap-1 font-semibold"
                  >
                    <Plus className="w-3 h-3" /> Stamp to Board
                  </button>
                </div>

                <div className="space-y-2 font-mono text-xs">
                  {calcResult.steps.map((s, idx) => (
                    <div key={idx} className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-[11px] text-slate-400 mb-0.5">{s.description}</div>
                      <div className="text-cyan-200 font-bold">{s.formulaOrMath}</div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">Final Evaluated:</span>
                  <span className="text-sm font-mono font-bold text-emerald-400">
                    {calcResult.finalAnswer}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: QUESTIONS & REALTIME SOLVING ================= */}
        {activeTab === 'questions' && (
          <div className="space-y-4">
            {/* Generate Question Header */}
            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Generate Live Question</span>
                <select
                  value={questionDifficulty}
                  onChange={(e) => setQuestionDifficulty(e.target.value as any)}
                  className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 outline-none"
                >
                  <option value="easy">Easy (Warm-up)</option>
                  <option value="medium">Medium (Standard)</option>
                  <option value="hard">Hard (Advanced)</option>
                  <option value="board-exam">Board Exam Problem</option>
                </select>
              </div>

              <button
                onClick={handleGenerateLiveQuestion}
                disabled={isGeneratingQuestion}
                className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow"
              >
                {isGeneratingQuestion ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate AI Problem</span>
                  </>
                )}
              </button>
            </div>

            {/* Question Cards List */}
            <div className="space-y-3">
              {allQuestions.map(q => (
                <div
                  key={q.id}
                  className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3.5 space-y-2.5 hover:border-purple-500/40 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30">
                      {q.difficulty}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      ~{q.estimatedTimeMin} mins
                    </span>
                  </div>

                  <p className="text-xs font-medium text-slate-100 leading-relaxed">
                    {q.prompt}
                  </p>

                  {/* Dual Action Buttons */}
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-700/50">
                    <button
                      onClick={() => onSendQuestionToSplitSlide(q)}
                      className="flex-1 py-1.5 px-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1 shadow"
                    >
                      <Split className="w-3.5 h-3.5" />
                      <span>Send to Split Slide</span>
                    </button>

                    <button
                      onClick={() => onStampTextToCanvas(`Problem: ${q.prompt}\nAns: ${q.finalAnswer}`)}
                      className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs transition"
                      title="Stamp to Whiteboard"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= TAB 4: CONCEPT ANALOGIES ================= */}
        {activeTab === 'analogies' && (
          <div className="space-y-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Real-World Metaphors for Fast Teaching:
            </span>

            {activeSubTopic.analogies.map((analogy, i) => (
              <div
                key={i}
                className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-200 leading-relaxed shadow-sm flex items-start gap-2.5"
              >
                <Lightbulb className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p>{analogy}</p>
              </div>
            ))}

            {/* Key Formulas Summary */}
            {activeSubTopic.formulas && activeSubTopic.formulas.length > 0 && (
              <div className="mt-4 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider block">
                  Core Formulas on Deck:
                </span>
                <div className="space-y-1 font-mono text-xs text-slate-200">
                  {activeSubTopic.formulas.map((f, idx) => (
                    <div key={idx} className="p-1.5 bg-slate-900 rounded border border-slate-800">
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Video In-App Modal Player */}
      {selectedVideo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col">
            <div className="px-4 py-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white truncate max-w-xl">
                {selectedVideo.title}
              </h3>
              <button
                onClick={() => setSelectedVideo(null)}
                className="p-1 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="aspect-video w-full bg-black">
              <iframe
                src={VideoCuratorService.getEmbedUrl(selectedVideo.youtubeId)}
                title={selectedVideo.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
