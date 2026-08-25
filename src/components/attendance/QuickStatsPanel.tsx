import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { UserCheck, Clock, Percent, Users } from 'lucide-react';
import { fetchUnifiedAttendanceStats, type UnifiedAttendanceStats } from '@/utils/attendanceStatsHelper';

const QuickStatsPanel: React.FC = () => {
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
      .channel('quick-stats-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gate_entries' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  const statItems = [
    { icon: Users, label: 'Registered', value: stats.totalRegistered, colorVar: '--ios-purple' },
    { icon: UserCheck, label: 'Present', value: stats.presentToday, colorVar: '--ios-green' },
    { icon: Clock, label: 'Late', value: stats.lateToday, colorVar: '--ios-orange' },
    { icon: Percent, label: 'Rate', value: `${stats.attendanceRate}%`, colorVar: '--ios-blue' },
  ];

  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-3">
      {statItems.map((item, i) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="relative overflow-hidden rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-2.5 sm:p-3 text-center"
        >
          <div
            className="absolute inset-0 opacity-10"
            style={{ background: `radial-gradient(circle at top right, hsl(var(${item.colorVar})), transparent 70%)` }}
          />
          <item.icon
            className="w-4 h-4 mx-auto mb-1"
            style={{ color: `hsl(var(${item.colorVar}))` }}
          />
          <p className="text-lg sm:text-xl font-bold text-foreground">{item.value}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground">{item.label}</p>
        </motion.div>
      ))}
    </div>
  );
};

export default QuickStatsPanel;
