
import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';

interface RecentActivityProps {
  isLoading: boolean;
  activityData?: any[];
}

const RecentActivity: React.FC<RecentActivityProps> = ({ isLoading, activityData: initialActivityData }) => {
  const [activityData, setActivityData] = useState(initialActivityData || []);

  useEffect(() => {
    // Set initial data from props
    if (initialActivityData) {
      setActivityData(initialActivityData);
    }

    // Setup real-time data fetch 
    const fetchRecentActivity = async () => {
      try {
        const { data, error } = await supabase
          .from('attendance_records')
          .select(`
            id,
            status,
            timestamp,
            confidence_score,
            user_id,
            device_info,
            image_url
          `)
          .order('timestamp', { ascending: false })
          .limit(10); 
          
        if (error) {
          console.error('Error fetching recent activity:', error);
          return;
        }
        
        if (data) {
          // Process the data to extract user info from device_info
          const processedData = await Promise.all(data.map(async (record) => {
            let name = 'Unknown';
            let avatarUrl = null;
            
            // Try to get name and image from device_info
            if (record.device_info && typeof record.device_info === 'object' && !Array.isArray(record.device_info)) {
              const deviceInfo = record.device_info as { [key: string]: Json };
              if (deviceInfo.metadata && 
                  typeof deviceInfo.metadata === 'object' && 
                  !Array.isArray(deviceInfo.metadata)) {
                if ('name' in deviceInfo.metadata) {
                  name = deviceInfo.metadata.name as string;
                }
                if ('firebase_image_url' in deviceInfo.metadata) {
                  avatarUrl = deviceInfo.metadata.firebase_image_url as string;
                }
              }
            }
            
            // Fallback to image_url if no firebase_image_url
            if (!avatarUrl && record.image_url) {
              avatarUrl = record.image_url;
            }
            
            // If no name in device_info, try to get from profiles table
            if (name === 'Unknown' && record.user_id) {
              const { data: profileData } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', record.user_id)
                .maybeSingle();
                
              if (profileData && profileData.username) {
                name = profileData.username;
              }
            }
            
            return {
              ...record,
              displayName: name,
              avatarUrl
            };
          }));
          
          setActivityData(processedData);
        }
      } catch (err) {
        console.error('Failed to fetch recent activity:', err);
      }
    };

    // Fetch immediately and then set up subscription
    fetchRecentActivity();
    
    // Set up real-time subscription
    const channel = supabase
      .channel('recent_activity_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'attendance_records'
      }, () => {
        fetchRecentActivity();
      })
      .subscribe();

    // Set up interval for frequent updates
    const interval = setInterval(() => {
      fetchRecentActivity();
    }, 2000); // Update every 2 seconds for real-time activity

    // Cleanup subscription on component unmount
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [initialActivityData]);

  return (
    <Card className="p-6 md:col-span-2 animate-slide-in-up" style={{ animationDelay: '300ms' }}>
      <h3 className="text-lg font-medium mb-4">Recent Activity</h3>
      <div className="space-y-4">
        {isLoading ? (
          <>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </>
        ) : (
          activityData?.map((item: any, index: number) => {
            // Extract name and avatar from processed data
            const name = item.displayName || 'Unknown';
            const avatarUrl = item.avatarUrl || null;
            const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const status = item.status === 'present' ? 'Checked in' : 
                          item.status === 'late' ? 'Checked in (Late)' : 'Unauthorized';
            
            return (
              <div key={`${item.id}-${index}`} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10 border-2 border-border">
                    {avatarUrl ? (
                      <AvatarImage src={avatarUrl} alt={name} />
                    ) : null}
                    <AvatarFallback>
                      <User className="h-5 w-5" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{name}</p>
                    <p className="text-sm text-muted-foreground">{time}</p>
                  </div>
                </div>
                <span className={`text-sm px-2 py-1 rounded-full ${
                  status.includes('Late') 
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500' 
                    : status.includes('Unauthorized')
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-500'
                      : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500'
                }`}>
                  {status}
                </span>
              </div>
            );
          }) || []
        )}
        
        {!isLoading && activityData?.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            No recent activity
          </div>
        )}
      </div>
    </Card>
  );
};

export default RecentActivity;
