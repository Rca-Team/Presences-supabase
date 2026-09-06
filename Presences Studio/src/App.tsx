import React, { useState } from 'react';
import { 
  ToolType, 
  BackgroundTheme, 
  DrawingStroke, 
  Slide, 
  Chapter, 
  SubTopic, 
  SubjectCurriculum, 
  TopicQuestion,
  StickyNote
} from './types/smartboard';
import { CURRICULUM_DATA } from './data/curriculumData';
import { Navbar } from './components/Navbar';
import { WhiteboardCanvas } from './components/canvas/WhiteboardCanvas';
import { Toolbar } from './components/canvas/Toolbar';
import { TeacherCopilotDock } from './components/copilot/TeacherCopilotDock';
import { SplitSlideWorkspace } from './components/canvas/SplitSlideWorkspace';
import { CurriculumPreloader } from './components/preloader/CurriculumPreloader';
import { 
  StudentPickerModal, 
  QRShareModal, 
  EndClassModal 
} from './components/tools/ClassroomTools';

export function App() {
  // 1. Curriculum & Active Lesson State
  const defaultGrade = CURRICULUM_DATA[0];
  const defaultSubject = defaultGrade.subjects[0];
  const defaultChapter = defaultSubject.chapters[0];
  const defaultSubTopic = defaultChapter.subTopics[0];

  const [activeGrade, setActiveGrade] = useState(defaultGrade);
  const [activeSubject, setActiveSubject] = useState(defaultSubject);
  const [activeChapter, setActiveChapter] = useState(defaultChapter);
  const [activeSubTopic, setActiveSubTopic] = useState(defaultSubTopic);

  // 2. Whiteboard Tooling State
  const [currentTool, setCurrentTool] = useState<ToolType>('pen');
  const [currentColor, setCurrentColor] = useState<string>('#ffffff');
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [backgroundTheme, setBackgroundTheme] = useState<BackgroundTheme>('chalkboard');

  // 3. Multi-Slide Lecture State
  const [slides, setSlides] = useState<Slide[]>([
    {
      id: 'slide-1',
      pageNumber: 1,
      title: 'Introduction',
      strokes: [],
      stickyNotes: [],
      background: 'chalkboard',
    }
  ]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  // 4. Copilot Dock & Modals
  const [isCopilotOpen, setIsCopilotOpen] = useState(true);
  const [isPreloaderOpen, setIsPreloaderOpen] = useState(false);
  const [isStudentPickerOpen, setIsStudentPickerOpen] = useState(false);
  const [isQRShareOpen, setIsQRShareOpen] = useState(false);
  const [isEndClassOpen, setIsEndClassOpen] = useState(false);

  // Active student & split-slide question
  const [activeBoardStudent, setActiveBoardStudent] = useState<string>('Student');
  const [activeSplitQuestion, setActiveSplitQuestion] = useState<TopicQuestion | null>(null);

  const currentSlide = slides[currentSlideIndex] || slides[0];

  // Update strokes for current slide
  const handleStrokesChange = (newStrokes: DrawingStroke[]) => {
    setSlides(prev => prev.map((s, idx) => {
      if (idx === currentSlideIndex) {
        return { ...s, strokes: newStrokes };
      }
      return s;
    }));
  };

  // Update sticky notes for current slide
  const handleStickyNotesChange = (newNotes: StickyNote[]) => {
    setSlides(prev => prev.map((s, idx) => {
      if (idx === currentSlideIndex) {
        return { ...s, stickyNotes: newNotes };
      }
      return s;
    }));
  };

  // Clear current slide strokes & sticky notes
  const handleClearSlide = () => {
    handleStrokesChange([]);
    handleStickyNotesChange([]);
  };

  // Slide navigation
  const handleAddSlide = () => {
    const newPageNum = slides.length + 1;
    const newSlide: Slide = {
      id: `slide-${Date.now()}`,
      pageNumber: newPageNum,
      title: `Slide ${newPageNum}`,
      strokes: [],
      stickyNotes: [],
      background: backgroundTheme,
    };
    setSlides(prev => [...prev, newSlide]);
    setCurrentSlideIndex(slides.length);
  };

  const handleNextSlide = () => {
    if (currentSlideIndex < slides.length - 1) {
      setCurrentSlideIndex(prev => prev + 1);
    }
  };

  const handlePrevSlide = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(prev => prev - 1);
    }
  };

  // Change curriculum topic from preloader
  const handleSelectCurriculumTopic = (chap: Chapter, sub: SubTopic, subj: SubjectCurriculum) => {
    setActiveChapter(chap);
    setActiveSubTopic(sub);
    setActiveSubject(subj);
    // Add a fresh slide title for the new topic
    handleAddSlide();
  };

  // Stamp text / formula into a sticky note on canvas
  const handleStampTextToCanvas = (text: string) => {
    const newNote: StickyNote = {
      id: `stamp-${Date.now()}`,
      x: 180,
      y: 160,
      width: 260,
      height: 180,
      color: '#bbf7d0', // Light green
      text: `📌 Problem:\n${text}`
    };
    handleStickyNotesChange([...currentSlide.stickyNotes, newNote]);
  };

  // Export current slide as PNG
  const handleExportPNG = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `Presences-Studios-Slide-${currentSlideIndex + 1}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* Top HUD Status & Lesson Bar */}
      <Navbar
        gradeLabel={activeGrade.label}
        subjectName={activeSubject.name}
        chapterTitle={`Ch ${activeChapter.number}: ${activeChapter.name}`}
        subtopicTitle={activeSubTopic.name}
        onOpenPreloader={() => setIsPreloaderOpen(true)}
        isCopilotOpen={isCopilotOpen}
        onToggleCopilot={() => setIsCopilotOpen(!isCopilotOpen)}
      />

      {/* Main Interactive Stage */}
      <div className="flex-1 relative flex overflow-hidden">
        
        {/* Left / Center: Full 4K Interactive Whiteboard Canvas */}
        <div className="flex-1 relative h-full overflow-hidden">
          <WhiteboardCanvas
            currentTool={currentTool}
            currentColor={currentColor}
            strokeWidth={strokeWidth}
            backgroundTheme={backgroundTheme}
            strokes={currentSlide.strokes}
            onStrokesChange={handleStrokesChange}
            stickyNotes={currentSlide.stickyNotes}
            onStickyNotesChange={handleStickyNotesChange}
            onClearCanvas={handleClearSlide}
            currentPage={currentSlideIndex + 1}
            totalPages={slides.length}
            onNextPage={handleNextSlide}
            onPrevPage={handlePrevSlide}
            onAddPage={handleAddSlide}
            onExportPNG={handleExportPNG}
            onOpenQRShare={() => setIsQRShareOpen(true)}
          />

          {/* Samsung Smartboard Floating Bottom Dock */}
          <Toolbar
            currentTool={currentTool}
            onSelectTool={setCurrentTool}
            currentColor={currentColor}
            onSelectColor={setCurrentColor}
            strokeWidth={strokeWidth}
            onSelectStrokeWidth={setStrokeWidth}
            backgroundTheme={backgroundTheme}
            onSelectBackground={setBackgroundTheme}
            onOpenStudentPicker={() => setIsStudentPickerOpen(true)}
            onOpenEndClass={() => setIsEndClassOpen(true)}
          />
        </div>

        {/* Right: Jarvis Real-Time AI Teaching Dock */}
        {isCopilotOpen && (
          <TeacherCopilotDock
            activeSubTopic={activeSubTopic}
            activeChapterName={activeChapter.name}
            onSendQuestionToSplitSlide={(q) => setActiveSplitQuestion(q)}
            onStampTextToCanvas={handleStampTextToCanvas}
          />
        )}

        {/* Auto-Adjusting Split Slide Workspace (Student Zone + Teacher Zone) */}
        {activeSplitQuestion && (
          <SplitSlideWorkspace
            question={activeSplitQuestion}
            studentName={activeBoardStudent}
            onClose={() => setActiveSplitQuestion(null)}
          />
        )}

      </div>

      {/* Modals */}
      <CurriculumPreloader
        isOpen={isPreloaderOpen}
        onClose={() => setIsPreloaderOpen(false)}
        onSelectSubTopic={handleSelectCurriculumTopic}
      />

      <StudentPickerModal
        isOpen={isStudentPickerOpen}
        onClose={() => setIsStudentPickerOpen(false)}
        onSelectStudentForBoard={(name) => {
          setActiveBoardStudent(name);
        }}
      />

      <QRShareModal
        isOpen={isQRShareOpen}
        onClose={() => setIsQRShareOpen(false)}
        chapterTitle={`${activeChapter.name} - ${activeSubTopic.name}`}
      />

      <EndClassModal
        isOpen={isEndClassOpen}
        onClose={() => setIsEndClassOpen(false)}
        sessionData={{
          grade: activeGrade.label,
          subject: activeSubject.name,
          chapter: activeChapter.name,
          subtopic: activeSubTopic.name,
          slidesCount: slides.length,
          durationMins: 45
        }}
      />

    </div>
  );
}
