
import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';

// Color constants
const STATUS_COLORS = ['#10B981', '#EF4444', '#F59E0B'];

interface StatusChartProps {
  isLoading: boolean;
  statusData?: Array<{name: string, value: number}>;
}

const StatusChart: React.FC<StatusChartProps> = ({ isLoading, statusData: initialStatusData }) => {
  const [statusData, setStatusData] = useState(initialStatusData || []);

  useEffect(() => {
    // Set initial data
    if (initialStatusData) {
      setStatusData(initialStatusData);
    }

    // Function to fetch real-time status data
    const fetchStatusData = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        
        // Get all attendance records for today
        const { data: todayRecords, error: recordsError } = await supabase
          .from('attendance_records')
          .select('status')
          .gte('timestamp', `${today}T00:00:00`)
          .lte('timestamp', `${today}T23:59:59`);
          
        if (recordsError) {
          console.error('Error fetching status data:', recordsError);
          return;
        }
        
        // Count by status
        const presentCount = todayRecords?.filter(r => r.status === 'present').length || 0;
        const lateCount = todayRecords?.filter(r => r.status === 'unauthorized' || r.status === 'late').length || 0;
        
        // Get total users
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('count');
          
        if (profilesError) {
          console.error('Error fetching profiles count:', profilesError);
          return;
        }
        
        const totalUsers = profilesData?.[0]?.count || 0;
        const absentCount = Math.max(0, totalUsers - presentCount - lateCount);
        
        // Calculate percentages
        const total = Math.max(1, totalUsers); // Avoid division by zero
        const presentPercentage = Math.round((presentCount / total) * 100);
        const latePercentage = Math.round((lateCount / total) * 100);
        const absentPercentage = Math.round((absentCount / total) * 100);
        
        // Update chart data
        setStatusData([
          { name: 'Present', value: presentPercentage },
          { name: 'Absent', value: absentPercentage },
          { name: 'Late', value: latePercentage },
        ]);
        
      } catch (error) {
        console.error('Error in fetchStatusData:', error);
      }
    };
    
    // Fetch data immediately and set up subscription
    fetchStatusData();
    
    // Set up real-time subscription for attendance records
    const attendanceChannel = supabase
      .channel('status_chart_attendance_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'attendance_records'
      }, () => {
        fetchStatusData();
      })
      .subscribe();

    // Set up real-time subscription for profiles changes
    const profilesChannel = supabase
      .channel('status_chart_profiles_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'profiles'
      }, () => {
        fetchStatusData();
      })
      .subscribe();

    // Set up interval for periodic updates
    const interval = setInterval(() => {
      fetchStatusData();
    }, 2500); // Update every 2.5 seconds
      
    return () => {
      supabase.removeChannel(attendanceChannel);
      supabase.removeChannel(profilesChannel);
      clearInterval(interval);
    };
  }, [initialStatusData]);

  return (
    <Card className="p-6 animate-slide-in-up" style={{ animationDelay: '400ms' }}>
      <h3 className="text-lg font-medium mb-4">Today's Status</h3>
      <div className="h-64">
        {isLoading ? (
          <Skeleton className="h-full w-full rounded-full" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={statusData || []}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
                label={({name, percent}) => `${name}: ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {statusData?.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `${value}%`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="flex justify-center gap-4 mt-2">
        {(statusData || []).map((entry: any, index: number) => (
          <div key={index} className="flex items-center">
            <div 
              className="w-3 h-3 rounded-full mr-2" 
              style={{ backgroundColor: STATUS_COLORS[index % STATUS_COLORS.length] }}
            ></div>
            <span className="text-sm">{entry.name}: {entry.value}%</span>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default StatusChart;
