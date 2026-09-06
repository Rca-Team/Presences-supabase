import React, { useState } from 'react';
import { CURRICULUM_DATA } from '../../data/curriculumData';
import { Chapter, SubTopic, SubjectCurriculum } from '../../types/smartboard';
import { GeminiTeachingService } from '../../services/geminiTeachingService';
import { 
  GraduationCap, 
  ChevronRight, 
  Sparkles, 
  X, 
  Search, 
  Loader2, 
  Zap,
  BookOpen
} from 'lucide-react';

interface CurriculumPreloaderProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSubTopic: (chapter: Chapter, subTopic: SubTopic, subject: SubjectCurriculum) => void;
}

export const CurriculumPreloader: React.FC<CurriculumPreloaderProps> = ({
  isOpen,
  onClose,
  onSelectSubTopic,
}) => {
  const [selectedGradeIndex, setSelectedGradeIndex] = useState(0);
  const [selectedSubjectIndex, setSelectedSubjectIndex] = useState(0);

  // Search & Universal Topic Generation
  const [searchQuery, setSearchQuery] = useState('');
  const [isGeneratingTopic, setIsGeneratingTopic] = useState(false);

  if (!isOpen) return null;

  const currentGrade = CURRICULUM_DATA[selectedGradeIndex] || CURRICULUM_DATA[0];
  const currentSubject = currentGrade.subjects[selectedSubjectIndex] || currentGrade.subjects[0];

  // Filter chapters/subtopics based on search query
  const filteredChapters = searchQuery.trim()
    ? currentSubject.chapters.map(chap => ({
        ...chap,
        subTopics: chap.subTopics.filter(
          sub =>
            sub.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            chap.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            sub.keyPoints.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      })).filter(chap => chap.subTopics.length > 0)
    : currentSubject.chapters;

  // Handle Dynamic AI Topic Generation for custom queries
  const handleGenerateCustomTopic = async () => {
    if (!searchQuery.trim()) return;
    setIsGeneratingTopic(true);
    try {
      const generatedSubTopic = await GeminiTeachingService.generateCustomTopicCurriculum(searchQuery.trim());
      const customChapter: Chapter = {
        id: `custom-chap-${Date.now()}`,
        number: 99,
        name: searchQuery.trim(),
        description: `AI synthesized smartboard module for ${searchQuery.trim()}`,
        subTopics: [generatedSubTopic]
      };
      const customSubject: SubjectCurriculum = {
        id: 'custom-subject',
        name: 'General Science / STEM',
        icon: 'Sparkles',
        chapters: [customChapter]
      };

      onSelectSubTopic(customChapter, generatedSubTopic, customSubject);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingTopic(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 md:p-6 select-none animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-5xl h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Top Header with Universal Search */}
        <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold flex-shrink-0">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">
                Curriculum Preload Hub
              </h2>
              <p className="text-xs text-slate-400">
                Preload any chapter or generate a custom AI module in real time
              </p>
            </div>
          </div>

          {/* Universal Search Bar */}
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search topic or type any concept (e.g. Thermodynamics, Photosynthesis)..."
                className="w-full bg-slate-950 border border-slate-700 text-white text-xs pl-9 pr-3 py-2 rounded-xl outline-none focus:border-emerald-500"
              />
            </div>

            {searchQuery.trim() && (
              <button
                onClick={handleGenerateCustomTopic}
                disabled={isGeneratingTopic}
                className="px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow flex-shrink-0"
              >
                {isGeneratingTopic ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    <span>AI Generate</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body: Grade & Subject Bar + Chapter Cards */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Left Side: Grade & Subject Navigator */}
          <div className="w-full md:w-64 bg-slate-950/70 border-r border-slate-800 p-4 space-y-6 overflow-y-auto flex-shrink-0">
            {/* Grade Selection */}
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Class / Grade
              </span>
              <div className="grid grid-cols-2 gap-2">
                {CURRICULUM_DATA.map((grade, idx) => (
                  <button
                    key={grade.grade}
                    onClick={() => { setSelectedGradeIndex(idx); setSelectedSubjectIndex(0); }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      selectedGradeIndex === idx
                        ? 'bg-emerald-600 text-white shadow-lg'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>{grade.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Subject Selection */}
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Subject
              </span>
              <div className="space-y-1.5">
                {currentGrade.subjects.map((subj, sIdx) => (
                  <button
                    key={subj.id}
                    onClick={() => setSelectedSubjectIndex(sIdx)}
                    className={`w-full py-2.5 px-3.5 rounded-xl text-xs font-bold transition flex items-center justify-between ${
                      selectedSubjectIndex === sIdx
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>{subj.name}</span>
                    <ChevronRight className="w-4 h-4 opacity-70" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Side: Chapters and Sub-Topics List */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-slate-900/40">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  {currentGrade.label} • {currentSubject.name} Chapters
                </h3>
                <span className="text-xs text-slate-400">
                  Select any topic to instantly deploy all lesson materials to your smartboard
                </span>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {filteredChapters.length} Chapters Available
              </span>
            </div>

            {/* If search returned no standard results, prompt AI synthesis */}
            {filteredChapters.length === 0 && searchQuery.trim() && (
              <div className="py-12 text-center bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-white">
                  Topic "{searchQuery}" Not in Pre-loaded Index
                </h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Our Jarvis AI Co-Pilot can synthesize an instant lesson outline, animated video list, formulas, and board questions right now.
                </p>
                <button
                  onClick={handleGenerateCustomTopic}
                  disabled={isGeneratingTopic}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-lg inline-flex items-center gap-2"
                >
                  {isGeneratingTopic ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  <span>Synthesize Module for "{searchQuery}"</span>
                </button>
              </div>
            )}

            <div className="space-y-6">
              {filteredChapters.map(chap => (
                <div
                  key={chap.id}
                  className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-mono font-bold text-blue-400">
                        Chapter {chap.number}
                      </span>
                      <h4 className="text-base font-bold text-white mt-0.5">
                        {chap.name}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1">
                        {chap.description}
                      </p>
                    </div>
                  </div>

                  {/* Subtopics */}
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Sub-Topics & Modules:
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {chap.subTopics.map(sub => (
                        <div
                          key={sub.id}
                          className="bg-slate-950/70 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-3.5 transition flex flex-col justify-between group"
                        >
                          <div>
                            <h5 className="text-xs font-bold text-slate-100 group-hover:text-emerald-400 transition">
                              {sub.name}
                            </h5>
                            <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-400">
                              <span>🎬 {sub.videos.length} Videos</span>
                              <span>•</span>
                              <span>❓ {sub.questions.length} Problems</span>
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              onSelectSubTopic(chap, sub, currentSubject);
                              onClose();
                            }}
                            className="mt-3 w-full py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 hover:border-transparent rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Preload to Board</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
