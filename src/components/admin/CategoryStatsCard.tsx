import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Users, UserCheck, UserX, Clock } from 'lucide-react';

interface CategoryStats {
  category: string;
  totalUsers: number;
  presentToday: number;
  absentToday: number;
  lateToday: number;
  attendancePercentage: number;
}

interface CategoryStatsCardProps {
  stats: CategoryStats[];
  isLoading?: boolean;
}

const getCategoryColor = (category: string) => {
  const colors: Record<string, string> = {
    'A': 'bg-blue-500',
    'B': 'bg-green-500',
    'C': 'bg-yellow-500',
    'D': 'bg-orange-500',
    'Teacher': 'bg-purple-500',
  };
  return colors[category] || 'bg-gray-500';
};

const getCategoryRingColor = (percentage: number): 'success' | 'warning' | 'destructive' => {
  if (percentage >= 80) return 'success';
  if (percentage >= 60) return 'warning';
  return 'destructive';
};

const CategoryStatsCard: React.FC<CategoryStatsCardProps> = ({ stats, isLoading }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-32 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {stats.map((stat) => (
        <Card key={stat.category} className="overflow-hidden group hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <CardHeader className={`${getCategoryColor(stat.category)} text-white py-3`}>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              {stat.category === 'Teacher' ? 'Teachers' : `Category ${stat.category}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {/* Progress Ring with Stats */}
            <div className="flex items-center gap-4">
              <ProgressRing
                value={stat.attendancePercentage}
                size="lg"
                color={getCategoryRingColor(stat.attendancePercentage)}
                thickness={5}
              />
              <div className="flex-1 space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-bold">{stat.totalUsers}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-1 text-green-500">
                    <UserCheck className="h-3 w-3" />
                    <span className="text-xs">Present</span>
                  </div>
                  <span className="font-semibold text-green-500">{stat.presentToday}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-1 text-red-500">
                    <UserX className="h-3 w-3" />
                    <span className="text-xs">Absent</span>
                  </div>
                  <span className="font-semibold text-red-500">{stat.absentToday}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-1 text-yellow-500">
                    <Clock className="h-3 w-3" />
                    <span className="text-xs">Late</span>
                  </div>
                  <span className="font-semibold text-yellow-500">{stat.lateToday}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default CategoryStatsCard;
