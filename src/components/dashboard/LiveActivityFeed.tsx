import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Clock, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { PulseDot } from '@/components/ui/pulse-dot';

interface LiveActivityFeedProps {
  activities: Array<{
    id: string;
    name: string;
    status: 'present' | 'late' | 'absent' | 'registered';
    timestamp: string;
    imageUrl?: string;
    category?: string;
  }>;
  maxItems?: number;
  className?: string;
}

const statusConfig = {
  present: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10' },
  late: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  absent: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
  registered: { icon: AlertCircle, color: 'text-blue-500', bg: 'bg-blue-500/10' },
};

export const LiveActivityFeed: React.FC<LiveActivityFeedProps> = ({
  activities,
  maxItems = 10,
  className
}) => {
  const displayItems = activities.slice(0, maxItems);

  return (
    <Card className={cn('h-full', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <span>Live Activity</span>
            <PulseDot status="online" size="sm" />
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {activities.length} today
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px] px-6">
          {displayItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No activity yet</p>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {displayItems.map((activity, index) => {
                const config = statusConfig[activity.status];
                const Icon = config.icon;
                
                return (
                  <div
                    key={activity.id}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg transition-all',
                      'hover:bg-muted/50',
                      index === 0 && 'animate-slide-in-right bg-muted/30'
                    )}
                  >
                    <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
                      <AvatarImage src={activity.imageUrl} alt={activity.name} />
                      <AvatarFallback className="text-xs">
                        {activity.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{activity.name}</p>
                        {activity.category && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {activity.category}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                      </p>
                    </div>
                    
                    <div className={cn('p-1.5 rounded-full', config.bg)}>
                      <Icon className={cn('h-4 w-4', config.color)} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
