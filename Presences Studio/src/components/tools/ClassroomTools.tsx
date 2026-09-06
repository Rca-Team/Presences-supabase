import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import { 
  Clock, 
  Users, 
  Share2, 
  Send, 
  X, 
  CheckCircle2, 
  RotateCw, 
  Play, 
  Pause,
  Award,
  Download,
  Sparkles,
  BookOpen
} from 'lucide-react';
import { SupabaseSyncService, ClassroomSessionSummary } from '../../services/supabaseSyncService';

// ================= 1. RANDOM STUDENT PICKER WHEEL =================
interface StudentPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStudentForBoard: (name: string) => void;
}

const DEFAULT_STUDENTS = [
  'Aryan Sharma', 'Priya Patel', 'Rohan Verma', 'Ananya Gupta',
  'Kabir Singh', 'Sneha Reddy', 'Aditya Joshi', 'Meera Nair',
  'Devansh Mehra', 'Ishita Sen', 'Vivaan Kapoor', 'Diya Chawla'
];

export const StudentPickerModal: React.FC<StudentPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectStudentForBoard,
}) => {
  const [students, setStudents] = useState<string[]>(DEFAULT_STUDENTS);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);

  if (!isOpen) return null;

  const spinWheel = () => {
    setIsSpinning(true);
    setSelectedStudent(null);

    let counter = 0;
    const totalSteps = 24;
    const interval = setInterval(() => {
      const randomIdx = Math.floor(Math.random() * students.length);
      setSelectedStudent(students[randomIdx]);
      counter++;

      if (counter >= totalSteps) {
        clearInterval(interval);
        setIsSpinning(false);
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 }
        });
      }
    }, 90);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 select-none animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-6 flex flex-col items-center shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 rounded-2xl bg-purple-500/20 text-purple-400 flex items-center justify-center mb-3">
          <Users className="w-6 h-6" />
        </div>

        <h3 className="text-lg font-bold text-white mb-1">Random Student Picker</h3>
        <p className="text-xs text-slate-400 mb-6 text-center">
          Fair, unbiased selection for classroom board problem solving
        </p>

        {/* Selected Student Display Card */}
        <div className="w-full bg-slate-950/80 border border-purple-500/30 rounded-2xl p-6 text-center mb-6 shadow-inner min-h-[110px] flex flex-col items-center justify-center">
          {selectedStudent ? (
            <div className="animate-in zoom-in-95">
              <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider block mb-1">
                Selected for the Board:
              </span>
              <h4 className="text-2xl font-extrabold text-white">
                {selectedStudent}
              </h4>
            </div>
          ) : (
            <span className="text-sm text-slate-500 font-medium">
              Tap "Spin Wheel" to select a student
            </span>
          )}
        </div>

        <div className="w-full flex gap-3">
          <button
            onClick={spinWheel}
            disabled={isSpinning}
            className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 shadow-lg"
          >
            <RotateCw className={`w-4 h-4 ${isSpinning ? 'animate-spin' : ''}`} />
            <span>{isSpinning ? 'Spinning...' : 'Spin Wheel'}</span>
          </button>

          {selectedStudent && (
            <button
              onClick={() => {
                onSelectStudentForBoard(selectedStudent);
                onClose();
              }}
              className="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm transition shadow-lg"
            >
              Assign to Board
            </button>
          )}
        </div>
      </div>
    </div>
  );
};


// ================= 2. QR CODE MOBILE SHARE MODAL =================
interface QRShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapterTitle: string;
}

export const QRShareModal: React.FC<QRShareModalProps> = ({
  isOpen,
  onClose,
  chapterTitle,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      // Generate unique classroom notes URL
      const shareUrl = `https://board.presences.ai/notes/${encodeURIComponent(chapterTitle)}-${Date.now()}`;
      QRCode.toDataURL(shareUrl, {
        width: 260,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      }).then(url => {
        setQrDataUrl(url);
      });
    }
  }, [isOpen, chapterTitle]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 select-none animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-sm p-6 flex flex-col items-center shadow-2xl relative text-center">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center mb-3">
          <Share2 className="w-6 h-6" />
        </div>

        <h3 className="text-lg font-bold text-white mb-1">Instant Student Download</h3>
        <p className="text-xs text-slate-400 mb-5">
          Scan with any mobile camera to download today’s full whiteboard slides as PDF
        </p>

        {/* QR Code Container */}
        <div className="p-4 bg-white rounded-2xl shadow-xl mb-4">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Classroom Notes QR" className="w-56 h-56 object-contain" />
          ) : (
            <div className="w-56 h-56 flex items-center justify-center text-slate-400 text-xs">
              Generating QR Code...
            </div>
          )}
        </div>

        <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
          ✓ No login required for students
        </span>
      </div>
    </div>
  );
};


// ================= 3. END CLASS & PARENT PORTAL SYNC MODAL =================
interface EndClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionData: {
    grade: string;
    subject: string;
    chapter: string;
    subtopic: string;
    slidesCount: number;
    durationMins: number;
  };
}

export const EndClassModal: React.FC<EndClassModalProps> = ({
  isOpen,
  onClose,
  sessionData,
}) => {
  const [teacherNotes, setTeacherNotes] = useState(
    `Today we covered ${sessionData.subtopic}. Students practiced 3 board problems with high engagement. Homework assigned from exercise questions 1-5.`
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  if (!isOpen) return null;

  const handlePublishToParents = async () => {
    setIsSubmitting(true);
    const summary: ClassroomSessionSummary = {
      classGrade: sessionData.grade,
      subject: sessionData.subject,
      chapter: sessionData.chapter,
      subtopic: sessionData.subtopic,
      teacherName: 'Teacher',
      slideCount: sessionData.slidesCount,
      questionsSolved: 3,
      durationMinutes: sessionData.durationMins,
      notesSummary: teacherNotes,
      timestamp: new Date().toISOString()
    };

    const res = await SupabaseSyncService.pushClassroomSummaryToParents(summary);
    setIsSubmitting(false);
    setIsDone(true);
    setStatusMessage(res.message);

    confetti({
      particleCount: 60,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 select-none animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg p-6 flex flex-col shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white leading-tight">
              Wrap Up Period & Sync to Parent Portal
            </h3>
            <span className="text-xs text-slate-400">
              {sessionData.grade} • {sessionData.subject} • {sessionData.chapter}
            </span>
          </div>
        </div>

        {isDone ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h4 className="text-lg font-bold text-white">Class Completed & Broadcast!</h4>
            <p className="text-xs text-slate-300 max-w-sm mx-auto">
              {statusMessage}
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold text-xs transition"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950/70 p-3 rounded-xl border border-slate-800 font-medium">
              <div>
                <span className="text-slate-400 block text-[11px]">Total Slides:</span>
                <span className="text-white font-bold">{sessionData.slidesCount} Slides</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Session Length:</span>
                <span className="text-white font-bold">{sessionData.durationMins} Minutes</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                AI Generated Parent Recap (Editable):
              </label>
              <textarea
                value={teacherNotes}
                onChange={(e) => setTeacherNotes(e.target.value)}
                rows={4}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none focus:border-emerald-500 leading-relaxed"
              />
            </div>

            <button
              onClick={handlePublishToParents}
              disabled={isSubmitting}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg"
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? 'Pushing to Portal...' : 'Publish to Parent Portal & Students'}</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
