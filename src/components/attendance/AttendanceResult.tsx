
import React from 'react';
import { Button } from '@/components/ui/button';
import { OptimizedFaceRecognitionResult } from '@/hooks/useOptimizedFaceRecognition';
import { Clock, UserCheck, AlertTriangle } from 'lucide-react';

interface AttendanceResultProps {
  result: OptimizedFaceRecognitionResult;
  resetResult: () => void;
}

const AttendanceResult: React.FC<AttendanceResultProps> = ({ result, resetResult }) => {
  // Extract data from the optimized result structure
  let status: 'present' | 'late' | 'unauthorized' = 'unauthorized';
  let employee: any = null;
  let recognized = false;

  if (result.type === 'single' && result.single) {
    status = result.single.status || 'unauthorized';
    employee = result.single.employee;
    recognized = result.single.recognized;
  } else if (result.type === 'multiple' && result.multiple?.recognizedFaces.length > 0) {
    const firstRecognized = result.multiple.recognizedFaces[0];
    if (firstRecognized.recognition) {
      employee = firstRecognized.recognition.employee;
      recognized = firstRecognized.recognition.recognized;
      status = 'present'; // Default for multiple face recognition
    }
  }

  return (
    <div className={`rounded-lg p-6 text-center ${
      status === 'unauthorized' 
        ? 'bg-destructive/10 border border-destructive/20' 
        : status === 'late'
          ? 'bg-amber-50 border border-amber-200'
          : 'bg-secondary/50'
    }`}>
      <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 ${
        status === 'unauthorized'
          ? 'bg-destructive/10 text-destructive'
          : status === 'late'
            ? 'bg-amber-100 text-amber-600'
            : 'bg-primary/10 text-primary'
      }`}>
        {status === 'unauthorized' ? (
          <AlertTriangle className="h-8 w-8" />
        ) : status === 'late' ? (
          <Clock className="h-8 w-8" />
        ) : (
          <UserCheck className="h-8 w-8" />
        )}
      </div>
      
      <h3 className="text-xl font-bold">
        {status === 'unauthorized' || !recognized ? 'Unknown Person' : employee?.name}
      </h3>
      
      <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full bg-opacity-10 text-sm font-medium">
        <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
          status === 'present' 
            ? 'bg-green-500'
            : status === 'late'
              ? 'bg-amber-500'
              : 'bg-destructive'
        }`}></span>
        {status === 'unauthorized' || !recognized
          ? 'Not Registered' 
          : status === 'late'
            ? 'Marked as Late'
            : 'Marked as Present'}
      </div>
      
      {result.timestamp && (
        <p className="text-muted-foreground mt-1">
          {new Date(result.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
      
      {(status === 'unauthorized' || !recognized) && (
        <p className="mt-3 text-sm text-destructive">
          This person is not registered in the system.
        </p>
      )}
      
      {status === 'late' && recognized && (
        <p className="mt-3 text-sm text-amber-600">
          You've arrived after the cutoff time.
        </p>
      )}
      
      <div className="mt-4 flex justify-center gap-2">
        <Button onClick={resetResult}>
          Take Another
        </Button>
        
        {(status === 'unauthorized' || !recognized) && (
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = '/register';
            }}
          >
            Register New Person
          </Button>
        )}
      </div>
    </div>
  );
};

export default AttendanceResult;
