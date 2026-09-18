import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shuffle, Sparkles, UserCheck, GraduationCap } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AndroidWidgetItem, PALETTE_CLASSES } from './types';
import { ClassStudent } from '@/components/teacher/TeacherAdminWorkspace';
import { sanitizeStudentPhotoUrl } from '@/utils/studentPhotoResolver';

interface StudentPickerWidgetProps {
  widget: AndroidWidgetItem;
  students: ClassStudent[];
}

export const StudentPickerWidget: React.FC<StudentPickerWidgetProps> = ({
  widget,
  students,
}) => {
  const palette = PALETTE_CLASSES[widget.palette] || PALETTE_CLASSES['dynamic-rose'];
  const [selectedStudent, setSelectedStudent] = useState<ClassStudent | null>(null);
  const [isRolling, setIsRolling] = useState(false);

  const handlePickStudent = () => {
    if (students.length === 0) return;
    setIsRolling(true);

    let counter = 0;
    const interval = setInterval(() => {
      const randomIdx = Math.floor(Math.random() * students.length);
      setSelectedStudent(students[randomIdx]);
      counter++;
      if (counter > 12) {
        clearInterval(interval);
        setIsRolling(false);
      }
    }, 60);
  };

  const photoUrl = selectedStudent?.photo_url
    ? sanitizeStudentPhotoUrl(selectedStudent.photo_url)
    : selectedStudent
    ? `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(selectedStudent.name || 'Student')}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`
    : '';

  return (
    <div className="flex flex-col justify-between h-full gap-2 text-center">
      <AnimatePresence mode="wait">
        {selectedStudent ? (
          <motion.div
            key={selectedStudent.id + (isRolling ? '-rolling' : '')}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            className="flex flex-col items-center justify-center my-auto"
          >
            <Avatar className="h-14 w-14 rounded-2xl border-2 border-rose-500/40 shadow-md">
              <AvatarImage src={photoUrl} alt={selectedStudent.name} />
              <AvatarFallback className="text-sm font-black bg-rose-500/20 text-rose-700 dark:text-rose-300">
                {selectedStudent.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <h4 className="text-base font-extrabold text-foreground mt-2 truncate max-w-full px-2">
              {selectedStudent.name}
            </h4>
            <p className="text-[11px] font-mono text-muted-foreground font-bold">
              Roll #{selectedStudent.roll_number || '—'}
            </p>
          </motion.div>
        ) : (
          <div className="flex flex-col items-center justify-center my-auto p-3 text-muted-foreground">
            <Shuffle className="h-8 w-8 text-rose-500/60 mb-1 animate-pulse" />
            <p className="text-xs font-bold text-foreground">Lucky Student Picker</p>
            <p className="text-[10px]">Cold-call student for answering</p>
          </div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={handlePickStudent}
        disabled={isRolling || students.length === 0}
        className="w-full py-2 px-3 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-extrabold text-xs shadow-md shadow-rose-500/20 flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
      >
        <Sparkles className={`h-3.5 w-3.5 ${isRolling ? 'animate-spin' : ''}`} />
        {isRolling ? 'Picking...' : selectedStudent ? 'Pick Another' : 'Pick Random Student'}
      </button>
    </div>
  );
};
