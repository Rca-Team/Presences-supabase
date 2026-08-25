import React from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';

interface RetakeAttendanceButtonProps {
  onRetake: () => void;
  disabled?: boolean;
}

const RetakeAttendanceButton: React.FC<RetakeAttendanceButtonProps> = ({ onRetake, disabled }) => {
  return (
    <Button 
      onClick={onRetake} 
      variant="outline" 
      className="w-full"
      disabled={disabled}
    >
      <RotateCcw className="mr-2 h-4 w-4" />
      Retake Attendance
    </Button>
  );
};

export default RetakeAttendanceButton;