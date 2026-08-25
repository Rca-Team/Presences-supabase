
import React from 'react';
import { motion } from 'framer-motion';
import { GradientCard } from '@/components/ui/gradient-card';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { Users, UserCheck, TrendingUp } from 'lucide-react';
import { fetchUnifiedAttendanceStats } from '@/utils/attendanceStatsHelper';

interface StatsOverviewProps {
  isLoading: boolean;
  data?: {
    totalUsers?: number;
    presentToday?: number;
    presentPercentage?: number;
    weeklyAverage?: number;
  };
  refetch: () => void;
}

const StatsOverview: React.FC<StatsOverviewProps> = ({ isLoading, data, refetch }) => {
  const { data: attendanceStats, refetch: refetchStats } = useQuery({
    queryKey: ['attendanceStatsRealtime'],
    queryFn: async () => {
      const result = await fetchUnifiedAttendanceStats();
      return {
        totalUsers: result.totalRegistered,
        presentToday: result.presentToday,
        presentPercentage: result.attendanceRate,
      };
    },
    initialData: data && data.totalUsers !== undefined && data.presentToday !== undefined && data.presentPercentage !== undefined 
      ? {
          totalUsers: data.totalUsers,
          presentToday: data.presentToday,
          presentPercentage: data.presentPercentage,
        }
      : undefined,
    refetchInterval: 30000,
  });

  const stats = attendanceStats || { totalUsers: 0, presentToday: 0, presentPercentage: 0 };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <GradientCard
          title="Total Registered"
          value={stats.totalUsers}
          icon={Users}
          gradient="blue"
          subtitle="Active students & staff"
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="relative overflow-hidden rounded-xl border bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 via-green-400/10 to-transparent opacity-50" />
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl opacity-30 bg-green-400" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Present Today</p>
              <p className="mt-1 text-3xl font-bold tracking-tight">{stats.presentToday}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.presentPercentage}% attendance rate
              </p>
            </div>
            <ProgressRing 
              value={stats.presentPercentage} 
              size="md" 
              color="success"
              showValue={false}
            >
              <UserCheck className="h-5 w-5 text-green-500" />
            </ProgressRing>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <GradientCard
          title="Weekly Average"
          value={`${data?.weeklyAverage ?? stats.presentPercentage}%`}
          icon={TrendingUp}
          gradient="purple"
          subtitle="Last 7 days"
        />
      </motion.div>
    </div>
  );
};

export default StatsOverview;
