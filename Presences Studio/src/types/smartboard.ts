export type ToolType = 
  | 'select'
  | 'pen' 
  | 'brush' 
  | 'highlighter' 
  | 'laser' 
  | 'eraser' 
  | 'stroke-eraser'
  | 'line' 
  | 'arrow' 
  | 'double-arrow'
  | 'dashed'
  | 'rectangle' 
  | 'circle' 
  | 'triangle' 
  | 'axes'
  | 'ruler'
  | 'protractor'
  | 'compass'
  | 'text' 
  | 'sticky';

export type BackgroundTheme = 
  | 'chalkboard' 
  | 'slate' 
  | 'whiteboard' 
  | 'lined' 
  | 'grid' 
  | 'dots';

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export interface DrawingStroke {
  id: string;
  tool: ToolType;
  points: Point[];
  color: string;
  width: number;
  opacity: number;
  isFilled?: boolean;
  text?: string;
  createdAt: number;
}

export interface StickyNote {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  text: string;
}

export interface Slide {
  id: string;
  pageNumber: number;
  title: string;
  strokes: DrawingStroke[];
  stickyNotes: StickyNote[];
  background: BackgroundTheme;
  splitLayout?: {
    enabled: boolean;
    question: TopicQuestion;
    studentName?: string;
    solveTimeSeconds: number;
    checkpoints: {
      formula: boolean;
      substitution: boolean;
      finalAnswer: boolean;
    };
    revealedSteps: number;
  };
}

export interface CuratedVideo {
  id: string;
  title: string;
  creator: string;
  duration: string;
  youtubeId: string;
  description: string;
  tags: string[];
}

export interface MathSolutionStep {
  stepNumber: number;
  description: string;
  formulaOrMath: string;
  explanation?: string;
}

export interface MathCalculationResult {
  problem: string;
  category: 'algebra' | 'calculus' | 'geometry' | 'physics' | 'chemistry' | 'arithmetic';
  finalAnswer: string;
  steps: MathSolutionStep[];
  graphFormula?: string;
}

export interface TopicQuestion {
  id: string;
  prompt: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'board-exam';
  type: 'conceptual' | 'numerical' | 'mcq' | 'proof' | 'board-exam';
  options?: string[];
  correctOption?: number;
  hints: string[];
  solutionSteps: string[];
  finalAnswer: string;
  estimatedTimeMin: number;
}

export interface SubTopic {
  id: string;
  name: string;
  keyPoints: string[];
  formulas?: string[];
  videos: CuratedVideo[];
  questions: TopicQuestion[];
  analogies: string[];
}

export interface Chapter {
  id: string;
  number: number;
  name: string;
  description: string;
  subTopics: SubTopic[];
}

export interface SubjectCurriculum {
  id: string;
  name: string;
  icon: string;
  chapters: Chapter[];
}

export interface GradeCurriculum {
  grade: string;
  label: string;
  subjects: SubjectCurriculum[];
}
