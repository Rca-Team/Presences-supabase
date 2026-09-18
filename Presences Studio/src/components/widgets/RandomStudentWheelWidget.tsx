import React, { useState } from 'react';
import { Users, Shuffle, Sparkles, Award, RotateCcw } from 'lucide-react';
import confetti from 'canvas-confetti';
import { audioService } from '../../services/audioService';

const SAMPLE_STUDENTS = [
  'Aarav Sharma', 'Ananya Verma', 'Diya Patel', 'Ishaan Malhotra', 
  'Kavya Iyer', 'Rohan Gupta', 'Sneha Nair', 'Tanvi Joshi', 
  'Vihaan Reddy', 'Zoya Khan', 'Aditya Sen', 'Priya Deshmukh'
];

export const RandomStudentWheelWidget: React.FC = () => {
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);

  const handlePickRandom = () => {
    if (isSpinning) return;
    setIsSpinning(true);
    setSelectedStudent(null);

    let counter = 0;
    const interval = setInterval(() => {
      const temp = SAMPLE_STUDENTS[Math.floor(Math.random() * SAMPLE_STUDENTS.length)];
      setSelectedStudent(temp);
      counter++;

      if (counter > 15) {
        clearInterval(interval);
        const finalStudent = SAMPLE_STUDENTS[Math.floor(Math.random() * SAMPLE_STUDENTS.length)];
        setSelectedStudent(finalStudent);
        setIsSpinning(false);
        audioService.playCorrectChime();

        // Fire celebratory confetti on board
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.2, x: 0.85 }
        });
      }
    }, 80);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-gradient-to-r from-purple-950/90 to-indigo-950/90 border border-purple-500/40 backdrop-blur-xl shadow-xl text-white text-xs select-none">
      <div className="flex items-center gap-1.5 font-bold text-purple-300">
        <Shuffle className={`w-3.5 h-3.5 text-purple-400 ${isSpinning ? 'animate-spin' : ''}`} />
        <span>Lucky Student:</span>
      </div>

      <div className="font-bold text-xs text-yellow-300 bg-purple-900/60 px-2.5 py-0.5 rounded-xl border border-purple-400/30 max-w-[120px] truncate">
        {selectedStudent ? selectedStudent : 'Tap to Pick'}
      </div>

      <button
        onClick={handlePickRandom}
        disabled={isSpinning}
        className="px-2.5 py-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 text-white font-extrabold rounded-xl shadow transition text-[10px] flex items-center gap-1"
      >
        <Sparkles className="w-3 h-3" />
        <span>{isSpinning ? 'Picking...' : 'Pick'}</span>
      </button>
    </div>
  );
};
