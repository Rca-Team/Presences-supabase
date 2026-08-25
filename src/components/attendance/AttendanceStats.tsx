
import React, { useState, useEffect, useCallback } from 'react';
import { GradientCard } from '@/components/ui/gradient-card';
import { ProgressRing } from '@/components/ui/progress-ring';
import { supabase } from '@/integrations/supabase/client';
import { Users, UserCheck, AlertTriangle, UserX } from 'lucide-react';
import { fetchUnifiedAttendanceStats, type UnifiedAttendanceStats } from '@/utils/attendanceStatsHelper';

const AttendanceStats = () => {
  const [stats, setStats] = useState<UnifiedAttendanceStats>({
    totalRegistered: 0, presentToday: 0, lateToday: 0, absentToday: 0, attendanceRate: 0
  });

  const refresh = useCallback(async () => {
    const result = await fetchUnifiedAttendanceStats();
    setStats(result);
  }, []);

  useEffect(() => {
    refresh();
    
    const channel = supabase
      .channel('attendance_stats_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => refresh())
      .subscribe();

    const gateChannel = supabase
      .channel('gate_stats_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gate_entries' }, () => refresh())
      .subscribe();
    
    return () => { 
      supabase.removeChannel(channel);
      supabase.removeChannel(gateChannel);
    };
  }, [refresh]);

  const presentPercentage = stats.totalRegistered > 0 ? Math.round((stats.presentToday / stats.totalRegistered) * 100) : 0;
  const latePercentage = stats.totalRegistered > 0 ? Math.round((stats.lateToday / stats.totalRegistered) * 100) : 0;
  const absentPercentage = stats.totalRegistered > 0 ? Math.round((stats.absentToday / stats.totalRegistered) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Present Card with ProgressRing */}
      <div className="relative overflow-hidden rounded-xl border bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl from-green-500/20 via-green-400/10 to-transparent border-green-500/30">
        <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 via-green-400/10 to-transparent opacity-50" />
        <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl opacity-30 bg-green-400" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Present Today</p>
            <p className="mt-1 text-2xl font-bold tracking-tight">{presentPercentage}%</p>
            <p className="text-xs text-muted-foreground mt-1">{stats.presentToday} of {stats.totalRegistered}</p>
          </div>
          <ProgressRing 
            value={presentPercentage} 
            size="md" 
            color="success"
            showValue={false}
          >
            <UserCheck className="h-4 w-4 text-green-500" />
          </ProgressRing>
        </div>
      </div>
      
      {/* Late Arrivals Card */}
      <GradientCard
        title="Late Arrivals"
        value={stats.lateToday}
        icon={AlertTriangle}
        gradient="orange"
        subtitle={`${latePercentage}% of total`}
      />
      
      {/* Absent Card */}
      <GradientCard
        title="Absent"
        value={stats.absentToday}
        icon={UserX}
        gradient="pink"
        subtitle={`${absentPercentage}% of total`}
      />
    </div>
  );
};

export default AttendanceStats;
