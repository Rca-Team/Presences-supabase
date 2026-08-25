
import React from 'react';
import { Card } from '@/components/ui/card';

const AttendanceInstructions = () => {
  return (
    <Card className="p-6">
      <h3 className="text-lg font-medium mb-4">Instructions</h3>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 text-primary p-2 rounded-full">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div>
            <h4 className="font-medium">Stand directly in front of the camera</h4>
            <p className="text-sm text-muted-foreground">Position yourself about 1-2 feet away from the camera.</p>
          </div>
        </div>
        
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 text-primary p-2 rounded-full">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
              <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
              <line x1="6" x2="6" y1="1" y2="4"></line>
              <line x1="10" x2="10" y1="1" y2="4"></line>
              <line x1="14" x2="14" y1="1" y2="4"></line>
            </svg>
          </div>
          <div>
            <h4 className="font-medium">Ensure good lighting</h4>
            <p className="text-sm text-muted-foreground">Poor lighting can affect recognition accuracy.</p>
          </div>
        </div>
        
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 text-primary p-2 rounded-full">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 6C13.66 6 15 7.34 15 9C15 10.66 13.66 12 12 12C10.34 12 9 10.66 9 9C9 7.34 10.34 6 12 6ZM12 20C9.33 20 7 18.5 7 16C7 13.5 9.33 12 12 12C14.67 12 17 13.5 17 16C17 18.5 14.67 20 12 20Z" fill="currentColor"/>
            </svg>
          </div>
          <div>
            <h4 className="font-medium">Look directly at the camera</h4>
            <p className="text-sm text-muted-foreground">Your face should be clearly visible and not obstructed.</p>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default AttendanceInstructions;
