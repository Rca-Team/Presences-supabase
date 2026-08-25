import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Brain, CheckCircle2, AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { getTrainingStats, getUsersWithTrainingSamples } from '@/services/face-recognition/ProgressiveTrainingService';

interface TrainingStatusCardProps {
  className?: string;
}

interface UserTrainingStatus {
  userId: string;
  name: string;
  imageUrl?: string;
  category?: string;
  sampleCount: number;
  confidenceLevel: 'low' | 'medium' | 'high';
}

export const TrainingStatusCard: React.FC<TrainingStatusCardProps> = ({ className }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<UserTrainingStatus[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, trainedUsers: 0, avgSamples: 0 });

  const fetchTrainingData = async () => {
    setIsLoading(true);
    try {
      const trainedUsers = await getUsersWithTrainingSamples();
      const trainingStats = await getTrainingStats();
      
      // Fetch user details from attendance_records
      const { data: records } = await supabase
        .from('attendance_records')
        .select('user_id, device_info, image_url, category')
        .eq('status', 'registered');
      
      const userMap = new Map<string, UserTrainingStatus>();
      
      // Process registered users
      records?.forEach(record => {
        const userId = record.user_id || '';
        const deviceInfo = record.device_info as any;
        const name = deviceInfo?.metadata?.name || 'Unknown';
        
        if (!userMap.has(userId)) {
          const sampleCount = trainedUsers.find(u => u.userId === userId)?.sampleCount || 0;
          const confidenceLevel: 'low' | 'medium' | 'high' = 
            sampleCount >= 8 ? 'high' : 
            sampleCount >= 4 ? 'medium' : 'low';
          
          userMap.set(userId, {
            userId,
            name,
            imageUrl: record.image_url || deviceInfo?.metadata?.firebase_image_url,
            category: record.category || undefined,
            sampleCount,
            confidenceLevel
          });
        }
      });
      
      setUsers(Array.from(userMap.values()).sort((a, b) => b.sampleCount - a.sampleCount));
      setStats({
        totalUsers: userMap.size,
        trainedUsers: trainingStats.usersWithSamples,
        avgSamples: trainingStats.averageSamplesPerUser
      });
    } catch (error) {
      console.error('Error fetching training data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrainingData();
  }, []);

  const getConfidenceBadge = (level: 'low' | 'medium' | 'high') => {
    switch (level) {
      case 'high':
        return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">High</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">Medium</Badge>;
      case 'low':
        return <Badge className="bg-red-500/20 text-red-500 border-red-500/30">Low</Badge>;
    }
  };

  const trainingProgress = stats.totalUsers > 0 
    ? Math.round((stats.trainedUsers / stats.totalUsers) * 100) 
    : 0;

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Model Training Status
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={fetchTrainingData} disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Training Coverage</span>
            <span className="font-medium">{stats.trainedUsers}/{stats.totalUsers} users</span>
          </div>
          <Progress value={trainingProgress} className="h-2" />
          <p className="text-xs text-muted-foreground">
            Average {stats.avgSamples.toFixed(1)} samples per trained user
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <p className="text-2xl font-bold text-green-500">
              {users.filter(u => u.confidenceLevel === 'high').length}
            </p>
            <p className="text-xs text-muted-foreground">High Accuracy</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <p className="text-2xl font-bold text-yellow-500">
              {users.filter(u => u.confidenceLevel === 'medium').length}
            </p>
            <p className="text-xs text-muted-foreground">Medium</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <p className="text-2xl font-bold text-red-500">
              {users.filter(u => u.confidenceLevel === 'low').length}
            </p>
            <p className="text-xs text-muted-foreground">Needs Training</p>
          </div>
        </div>

        {/* User List */}
        <ScrollArea className="h-[200px]">
          <div className="space-y-2">
            {users.slice(0, 10).map(user => (
              <div
                key={user.userId}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.imageUrl} />
                    <AvatarFallback className="text-xs">
                      {user.name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.sampleCount} samples
                    </p>
                  </div>
                </div>
                {getConfidenceBadge(user.confidenceLevel)}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Info */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <Sparkles className="h-4 w-4 text-primary mt-0.5" />
          <p className="text-xs text-muted-foreground">
            The model automatically improves as more attendance is recorded. 
            Users with 8+ samples have the highest recognition accuracy.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
