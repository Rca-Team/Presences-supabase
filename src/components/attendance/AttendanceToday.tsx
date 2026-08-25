
import React from 'react';
import { Card } from '@/components/ui/card';
import { format } from 'date-fns';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useAttendance } from '@/contexts/AttendanceContext';

const AttendanceToday = () => {
  const { recentAttendance } = useAttendance();

  return (
    <Card className="p-4 sm:p-6">
      <h3 className="text-lg font-medium mb-4">Recent Records</h3>
      <div className="space-y-3 max-h-80 sm:max-h-96 overflow-y-auto pr-2">
        {recentAttendance.length > 0 ? (
          recentAttendance.map((record, index) => (
            <div 
              key={`${record.id || index}`} 
              className="flex items-center justify-between rounded-lg border p-2 sm:p-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <Avatar className="w-8 h-8 sm:w-10 sm:h-10 border shrink-0">
                  {record.image_url ? (
                    <AvatarImage src={record.image_url} alt={record.name} />
                  ) : (
                    <AvatarFallback className="bg-primary/10">
                      <span className="text-primary font-medium text-xs sm:text-sm">{record.name.charAt(0)}</span>
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-xs sm:text-sm truncate">{record.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="hidden sm:inline">{format(new Date(record.timestamp), 'MMM d, yyyy')} • </span>
                    {format(new Date(record.timestamp), 'h:mm a')}
                  </p>
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${
                record.status === 'Present' 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500' 
                  : record.status === 'Late'
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500'
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500'
              }`}>
                {record.status}
              </span>
            </div>
          ))
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            No attendance records for today
          </div>
        )}
      </div>
    </Card>
  );
};

export default AttendanceToday;
