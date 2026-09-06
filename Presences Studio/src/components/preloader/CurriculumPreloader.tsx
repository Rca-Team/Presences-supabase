import React, { useState } from 'react';
import { CURRICULUM_DATA } from '../../data/curriculumData';
import { Chapter, SubTopic, SubjectCurriculum } from '../../types/smartboard';
import { 
  BookOpen, 
  GraduationCap, 
  ChevronRight, 
  Sparkles, 
  X,
  Layers
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

  if (!isOpen) return null;

  const currentGrade = CURRICULUM_DATA[selectedGradeIndex] || CURRICULUM_DATA[0];
  const currentSubject = currentGrade.subjects[selectedSubjectIndex] || currentGrade.subjects[0];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 select-none animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">
                Curriculum Preload Hub
              </h2>
              <p className="text-xs text-slate-400">
                Instantly load syllabus, interactive chapters, animated videos & question banks
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content Body: Grade & Subject Bar + Chapter Cards */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Left Side: Grade & Subject Navigator */}
          <div className="w-full md:w-72 bg-slate-950/70 border-r border-slate-800 p-4 space-y-6 overflow-y-auto">
            {/* Grade Selection */}
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Select Class / Grade
              </span>
              <div className="grid grid-cols-2 gap-2">
                {CURRICULUM_DATA.map((grade, idx) => (
                  <button
                    key={grade.grade}
                    onClick={() => { setSelectedGradeIndex(idx); setSelectedSubjectIndex(0); }}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
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
                Select Subject
              </span>
              <div className="space-y-1.5">
                {currentGrade.subjects.map((subj, sIdx) => (
                  <button
                    key={subj.id}
                    onClick={() => setSelectedSubjectIndex(sIdx)}
                    className={`w-full py-3 px-4 rounded-xl text-xs font-bold transition flex items-center justify-between ${
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
                  Select any topic to instantly deploy all materials to your smartboard
                </span>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {currentSubject.chapters.length} Chapters Available
              </span>
            </div>

            <div className="space-y-6">
              {currentSubject.chapters.map(chap => (
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
