import React, { useState, useEffect } from 'react';
import { 
  ToolType, 
  BackgroundTheme, 
  DrawingStroke, 
  Slide, 
  Chapter, 
  SubTopic, 
  SubjectCurriculum, 
  TopicQuestion,
  StickyNote,
  CanvasImage,
  CanvasTextBox
} from './types/smartboard';
import { CURRICULUM_DATA } from './data/curriculumData';
import { Navbar } from './components/Navbar';
import { WhiteboardCanvas } from './components/canvas/WhiteboardCanvas';
import { Toolbar } from './components/canvas/Toolbar';
import { TeacherCopilotDock } from './components/copilot/TeacherCopilotDock';
import { SplitSlideWorkspace } from './components/canvas/SplitSlideWorkspace';
import { SlideThumbnailDrawer } from './components/canvas/SlideThumbnailDrawer';
import { CurriculumPreloader } from './components/preloader/CurriculumPreloader';
import { 
  StudentPickerModal, 
  QRShareModal, 
  EndClassModal,
  NoiseMonitorModal,
  compileLectureToPDF
} from './components/tools/ClassroomTools';
import { PersistenceService } from './services/persistenceService';
import { audioService } from './services/audioService';

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
      images: [],
      textBoxes: [],
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
  const [isSlideDrawerOpen, setIsSlideDrawerOpen] = useState(false);

  // 5. Classroom Noise Monitor State
  const [isNoiseMonitoring, setIsNoiseMonitoring] = useState(false);
  const [noiseLevel, setNoiseLevel] = useState(15);
  const [noiseStatus, setNoiseStatus] = useState<'quiet' | 'moderate' | 'loud'>('quiet');
  const [isNoiseModalOpen, setIsNoiseModalOpen] = useState(false);

  // Active student & split-slide question
  const [activeBoardStudent, setActiveBoardStudent] = useState<string>('Student');
  const [activeSplitQuestion, setActiveSplitQuestion] = useState<TopicQuestion | null>(null);

  // Restore prior session on launch if available
  useEffect(() => {
    const saved = PersistenceService.getSavedSession();
    if (saved && saved.slides.length > 0) {
      setSlides(saved.slides);
      setCurrentSlideIndex(Math.min(saved.currentSlideIndex, saved.slides.length - 1));
      if (saved.chapter) setActiveChapter(saved.chapter);
      if (saved.subTopic) setActiveSubTopic(saved.subTopic);
      if (saved.subject) setActiveSubject(saved.subject);
    }
  }, []);

  // Continuously autosave active lecture to local persistence
  useEffect(() => {
    PersistenceService.saveSession({
      timestamp: Date.now(),
      gradeLabel: activeGrade.label,
      subject: activeSubject,
      chapter: activeChapter,
      subTopic: activeSubTopic,
      slides,
      currentSlideIndex
    });
  }, [slides, currentSlideIndex, activeChapter, activeSubTopic, activeSubject, activeGrade]);

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

  // Update images for current slide
  const handleImagesChange = (newImages: CanvasImage[]) => {
    setSlides(prev => prev.map((s, idx) => {
      if (idx === currentSlideIndex) {
        return { ...s, images: newImages };
      }
      return s;
    }));
  };

  // Update text boxes for current slide
  const handleTextBoxesChange = (newBoxes: CanvasTextBox[]) => {
    setSlides(prev => prev.map((s, idx) => {
      if (idx === currentSlideIndex) {
        return { ...s, textBoxes: newBoxes };
      }
      return s;
    }));
  };

  // Clear current slide
  const handleClearSlide = () => {
    handleStrokesChange([]);
    handleStickyNotesChange([]);
    handleImagesChange([]);
    handleTextBoxesChange([]);
  };

  // Slide navigation & organization
  const handleAddSlide = () => {
    const newPageNum = slides.length + 1;
    const newSlide: Slide = {
      id: `slide-${Date.now()}`,
      pageNumber: newPageNum,
      title: `Slide ${newPageNum}`,
      strokes: [],
      stickyNotes: [],
      images: [],
      textBoxes: [],
      background: backgroundTheme,
    };
    setSlides(prev => [...prev, newSlide]);
    setCurrentSlideIndex(slides.length);
  };

  const handleDuplicateSlide = (index: number) => {
    const target = slides[index];
    if (!target) return;
    const duplicated: Slide = {
      ...target,
      id: `slide-${Date.now()}`,
      pageNumber: slides.length + 1,
      title: `${target.title} (Copy)`,
      strokes: [...target.strokes],
      stickyNotes: [...target.stickyNotes],
      images: target.images ? [...target.images] : [],
      textBoxes: target.textBoxes ? [...target.textBoxes] : []
    };
    setSlides(prev => [...prev, duplicated]);
    setCurrentSlideIndex(slides.length);
  };

  const handleDeleteSlide = (index: number) => {
    if (slides.length <= 1) return;
    const updated = slides.filter((_, idx) => idx !== index);
    setSlides(updated);
    if (currentSlideIndex >= updated.length) {
      setCurrentSlideIndex(updated.length - 1);
    }
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
    handleAddSlide();
  };

  // Stamp text / formula into a sticky note on canvas
  const handleStampTextToCanvas = (text: string) => {
    const newNote: StickyNote = {
      id: `stamp-${Date.now()}`,
      x: 180,
      y: 160,
      width: 280,
      height: 180,
      color: '#bbf7d0',
      text: `📌 Problem:\n${text}`
    };
    handleStickyNotesChange([...currentSlide.stickyNotes, newNote]);
  };

  // Export slide as PNG
  const handleExportPNG = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `Presences-Studios-Slide-${currentSlideIndex + 1}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Export full multi-page lecture as PDF
  const handleExportPDF = async () => {
    await compileLectureToPDF(slides, `${activeChapter.name} - ${activeSubTopic.name}`);
  };

  // Toggle Noise Monitoring
  const handleToggleNoiseMonitor = async () => {
    if (isNoiseMonitoring) {
      audioService.stopNoiseMonitoring();
      setIsNoiseMonitoring(false);
    } else {
      const ok = await audioService.startNoiseMonitoring((lvl, st) => {
        setNoiseLevel(lvl);
        setNoiseStatus(st);
      });
      if (ok) {
        setIsNoiseMonitoring(true);
        setIsNoiseModalOpen(true);
      }
    }
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
        isNoiseMonitoring={isNoiseMonitoring}
        noiseStatus={noiseStatus}
        onToggleNoiseMonitor={handleToggleNoiseMonitor}
        onToggleSlideDrawer={() => setIsSlideDrawerOpen(!isSlideDrawerOpen)}
        onExportPDF={handleExportPDF}
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
            images={currentSlide.images}
            onImagesChange={handleImagesChange}
            textBoxes={currentSlide.textBoxes}
            onTextBoxesChange={handleTextBoxesChange}
            onClearCanvas={handleClearSlide}
            currentPage={currentSlideIndex + 1}
            totalPages={slides.length}
            onNextPage={handleNextSlide}
            onPrevPage={handlePrevSlide}
            onAddPage={handleAddSlide}
            onToggleSlideDrawer={() => setIsSlideDrawerOpen(!isSlideDrawerOpen)}
            onExportPNG={handleExportPNG}
            onExportPDF={handleExportPDF}
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

          {/* Slide Thumbnail Drawer */}
          <SlideThumbnailDrawer
            isOpen={isSlideDrawerOpen}
            onClose={() => setIsSlideDrawerOpen(false)}
            slides={slides}
            currentSlideIndex={currentSlideIndex}
            onSelectSlide={(idx) => setCurrentSlideIndex(idx)}
            onAddSlide={handleAddSlide}
            onDuplicateSlide={handleDuplicateSlide}
            onDeleteSlide={handleDeleteSlide}
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

      <NoiseMonitorModal
        isOpen={isNoiseModalOpen}
        onClose={() => setIsNoiseModalOpen(false)}
        noiseLevel={noiseLevel}
        noiseStatus={noiseStatus}
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
