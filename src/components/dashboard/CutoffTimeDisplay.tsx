import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { getCutoffTime, formatCutoffTime, isPastCutoffTime, getAttendanceCutoffTime } from '@/services/attendance/AttendanceSettingsService';
import { supabase } from '@/integrations/supabase/client';

const CutoffTimeDisplay = () => {
  const { data: cutoffTime, isLoading, refetch } = useQuery({
    queryKey: ['cutoffTime'],
    queryFn: getAttendanceCutoffTime,
    refetchInterval: 10000, // Refetch every 10 seconds for more responsiveness
  });

  // Set up real-time subscription for settings changes
  React.useEffect(() => {
    const channel = supabase
      .channel('cutoff_time_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'attendance_settings',
        filter: 'key=eq.cutoff_time'
      }, () => {
        refetch();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-r from-yellow-50 to-yellow-100 border-yellow-200">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-200 rounded-full">
              <Clock className="h-5 w-5 text-yellow-700 animate-spin" />
            </div>
            <div>
              <h3 className="font-semibold text-yellow-800">Loading cutoff time...</h3>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formattedTime = cutoffTime ? formatCutoffTime(cutoffTime) : '9:00 AM';
  const isPast = cutoffTime ? isPastCutoffTime(cutoffTime) : false;

  return (
    <Card className="bg-gradient-to-r from-yellow-50 to-yellow-100 border-yellow-200 shadow-md hover:shadow-lg transition-shadow duration-200">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${isPast ? 'bg-red-200' : 'bg-yellow-200'}`}>
            {isPast ? (
              <AlertTriangle className="h-5 w-5 text-red-700" />
            ) : (
              <Clock className="h-5 w-5 text-yellow-700" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-yellow-800 text-sm uppercase tracking-wide">
              Attendance Cutoff Time
            </h3>
            <p className={`text-lg font-bold ${isPast ? 'text-red-700' : 'text-yellow-900'}`}>
              {formattedTime}
            </p>
            {isPast && (
              <p className="text-xs text-red-600 mt-1">
                ⚠️ Past cutoff time - late arrivals
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CutoffTimeDisplay;