import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shuffle, Sparkles, UserCheck, GraduationCap, CheckCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AndroidWidgetItem, MaterialPalette, AndroidWidgetSize, PALETTE_CLASSES } from './types';
import { ClassStudent } from '@/components/teacher/TeacherAdminWorkspace';
import { sanitizeStudentPhotoUrl } from '@/utils/studentPhotoResolver';
import { playWheelTickSound, playWinnerCelebrationChime } from '@/utils/audioChimes';

interface StudentPickerWidgetProps {
  widget?: AndroidWidgetItem;
  students?: ClassStudent[];
  size?: AndroidWidgetSize;
  palette?: MaterialPalette;
}

export const StudentPickerWidget: React.FC<StudentPickerWidgetProps> = ({
  widget,
  students = [],
  size = widget?.size || '2x2',
  palette = widget?.palette || 'dynamic-purple',
}) => {
  const paletteConfig = PALETTE_CLASSES[palette] || PALETTE_CLASSES['dynamic-purple'];
  const [selectedStudent, setSelectedStudent] = useState<ClassStudent | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const handlePickStudent = () => {
    if (students.length === 0) return;
    setIsRolling(true);
    setShowConfetti(false);

    let counter = 0;
    const totalSteps = 16;
    let delay = 50;

    const rollStep = () => {
      const randomIdx = Math.floor(Math.random() * students.length);
      const candidate = students[randomIdx];
      setSelectedStudent(candidate);
      playWheelTickSound();
      counter++;

      if (counter < totalSteps) {
        delay += 15; // Natural deceleration
        setTimeout(rollStep, delay);
      } else {
        setIsRolling(false);
        setShowConfetti(true);
        playWinnerCelebrationChime();
        setTimeout(() => setShowConfetti(false), 3500);
      }
    };

    rollStep();
  };

  const photoUrl = selectedStudent?.photo_url
    ? sanitizeStudentPhotoUrl(selectedStudent.photo_url)
    : selectedStudent
    ? `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(selectedStudent.name || 'Student')}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`
    : '';

  return (
    <div className="relative flex flex-col justify-between h-full gap-2 text-center select-none overflow-hidden">
      {/* Floating Confetti Sparkles */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
          <div className="absolute w-full h-full flex items-center justify-around">
            <motion.div animate={{ y: [-10, 40], opacity: [1, 0], scale: [0.5, 1.5] }} transition={{ duration: 1.2 }} className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <motion.div animate={{ y: [-20, 50], opacity: [1, 0], scale: [0.8, 1.8] }} transition={{ duration: 1.4, delay: 0.1 }} className="w-3 h-3 rounded-full bg-pink-400" />
            <motion.div animate={{ y: [-15, 45], opacity: [1, 0], scale: [0.6, 1.6] }} transition={{ duration: 1.3, delay: 0.2 }} className="w-2 h-2 rounded-full bg-sky-400" />
            <motion.div animate={{ y: [-25, 55], opacity: [1, 0], scale: [0.7, 1.7] }} transition={{ duration: 1.5, delay: 0.3 }} className="w-3 h-3 rounded-full bg-emerald-400" />
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {selectedStudent ? (
          <motion.div
            key={selectedStudent.id + (isRolling ? '-rolling' : '')}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            className="flex flex-col items-center justify-center my-auto"
          >
            <div className="relative">
              <Avatar className="h-16 w-16 sm:h-20 sm:w-20 rounded-3xl border-2 border-indigo-500/50 shadow-xl ring-4 ring-indigo-500/10">
                <AvatarImage src={photoUrl} alt={selectedStudent.name} />
                <AvatarFallback className="text-base font-black bg-indigo-500/20 text-indigo-300">
                  {selectedStudent.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {!isRolling && (
                <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-emerald-500 text-white shadow-md">
                  <CheckCircle className="h-3.5 w-3.5" />
                </div>
              )}
            </div>

            <h4 className="text-base sm:text-lg font-black text-foreground mt-2.5 truncate max-w-full px-2">
              {selectedStudent.name}
            </h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[11px] font-mono text-muted-foreground font-bold">
                Roll #{selectedStudent.roll_number || '—'}
              </span>
              {selectedStudent.today_status && (
                <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                  selectedStudent.today_status === 'present' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-rose-500/15 text-rose-500'
                }`}>
                  {selectedStudent.today_status}
                </span>
              )}
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-col items-center justify-center my-auto p-3 text-muted-foreground">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-2 shadow-xs">
              <Shuffle className="h-6 w-6 animate-pulse" />
            </div>
            <p className="text-sm font-extrabold text-foreground">Lucky Student Picker</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {students.length > 0 ? `${students.length} Enrolled Students Ready` : 'Select a class with students'}
            </p>
          </div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={handlePickStudent}
        disabled={isRolling || students.length === 0}
        className="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 active:scale-95 text-white font-extrabold text-xs shadow-md shadow-indigo-500/25 flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
      >
        <Sparkles className={`h-4 w-4 ${isRolling ? 'animate-spin' : ''}`} />
        <span>{isRolling ? 'Spinning Wheel...' : selectedStudent ? 'Pick Another Student' : 'Spin Lucky Wheel'}</span>
      </button>
    </div>
  );
};
