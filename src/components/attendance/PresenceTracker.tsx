import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Users, 
  UserCheck, 
  Clock, 
  Wifi, 
  WifiOff,
  Activity,
  Eye,
  MapPin,
  Smartphone,
  Monitor
} from 'lucide-react';

interface OnlineUser {
  id: string;
  name: string;
  avatar?: string;
  status: 'active' | 'idle' | 'away';
  lastSeen: Date;
  device: 'mobile' | 'desktop';
  location?: string;
  action?: string;
}

interface PresenceTrackerProps {
  currentUserId?: string;
  showDetailed?: boolean;
}

const PresenceTracker: React.FC<PresenceTrackerProps> = ({ 
  currentUserId,
  showDetailed = false 
}) => {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [isConnected, setIsConnected] = useState(true);
  const [myPresence, setMyPresence] = useState<'active' | 'idle' | 'away'>('active');
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    // Create presence channel
    const presenceChannel = supabase.channel('attendance-presence', {
      config: {
        presence: {
          key: currentUserId || 'anonymous',
        },
      },
    });

    // Handle sync events
    presenceChannel.on('presence', { event: 'sync' }, () => {
      const state = presenceChannel.presenceState();
      const users: OnlineUser[] = [];
      
      Object.entries(state).forEach(([key, presences]: [string, any]) => {
        if (presences && presences.length > 0) {
          const presence = presences[0];
          users.push({
            id: key,
            name: presence.name || 'Anonymous',
            avatar: presence.avatar,
            status: presence.status || 'active',
            lastSeen: new Date(presence.online_at),
            device: presence.device || 'desktop',
            location: presence.location,
            action: presence.action,
          });
        }
      });
      
      setOnlineUsers(users);
      setViewerCount(users.length);
    });

    // Handle join events
    presenceChannel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      console.log('User joined:', key, newPresences);
    });

    // Handle leave events
    presenceChannel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      console.log('User left:', key, leftPresences);
    });

    // Subscribe and track presence
    presenceChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setIsConnected(true);
        
        // Determine device type
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        // Track current user's presence
        await presenceChannel.track({
          name: 'Current User',
          status: myPresence,
          online_at: new Date().toISOString(),
          device: isMobile ? 'mobile' : 'desktop',
          action: 'viewing',
        });
      } else {
        setIsConnected(false);
      }
    });

    // Activity detection for idle status
    let idleTimer: NodeJS.Timeout;
    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      if (myPresence !== 'active') {
        setMyPresence('active');
        presenceChannel.track({
          status: 'active',
          online_at: new Date().toISOString(),
        });
      }
      idleTimer = setTimeout(() => {
        setMyPresence('idle');
        presenceChannel.track({
          status: 'idle',
          online_at: new Date().toISOString(),
        });
      }, 60000); // 1 minute idle
    };

    // Listen for activity
    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('keypress', resetIdleTimer);
    window.addEventListener('click', resetIdleTimer);
    window.addEventListener('scroll', resetIdleTimer);
    window.addEventListener('touchstart', resetIdleTimer);

    return () => {
      clearTimeout(idleTimer);
      window.removeEventListener('mousemove', resetIdleTimer);
      window.removeEventListener('keypress', resetIdleTimer);
      window.removeEventListener('click', resetIdleTimer);
      window.removeEventListener('scroll', resetIdleTimer);
      window.removeEventListener('touchstart', resetIdleTimer);
      supabase.removeChannel(presenceChannel);
    };
  }, [currentUserId, myPresence]);

  const getStatusColor = (status: OnlineUser['status']) => {
    switch (status) {
      case 'active': return 'bg-success';
      case 'idle': return 'bg-warning';
      case 'away': return 'bg-muted';
      default: return 'bg-muted';
    }
  };

  const getStatusText = (status: OnlineUser['status']) => {
    switch (status) {
      case 'active': return 'Active';
      case 'idle': return 'Idle';
      case 'away': return 'Away';
      default: return 'Unknown';
    }
  };

  const formatLastSeen = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-border bg-gradient-to-r from-primary/10 to-primary/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">Live Presence</span>
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Badge variant="outline" className="bg-success/10 text-success border-success/20 gap-1">
                <Wifi className="w-3 h-3" />
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
                <WifiOff className="w-3 h-3" />
                Reconnecting
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="p-3 border-b border-border bg-muted/30">
        <div className="flex items-center justify-around text-center">
          <div>
            <div className="flex items-center justify-center gap-1 text-lg font-bold text-foreground">
              <Eye className="w-4 h-4 text-primary" />
              {viewerCount}
            </div>
            <p className="text-xs text-muted-foreground">Viewing Now</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div>
            <div className="flex items-center justify-center gap-1 text-lg font-bold text-success">
              <UserCheck className="w-4 h-4" />
              {onlineUsers.filter(u => u.status === 'active').length}
            </div>
            <p className="text-xs text-muted-foreground">Active</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div>
            <div className="flex items-center justify-center gap-1 text-lg font-bold text-warning">
              <Clock className="w-4 h-4" />
              {onlineUsers.filter(u => u.status === 'idle').length}
            </div>
            <p className="text-xs text-muted-foreground">Idle</p>
          </div>
        </div>
      </div>

      {/* Users list */}
      {showDetailed && (
        <ScrollArea className="h-48">
          <div className="p-2 space-y-1">
            <AnimatePresence>
              {onlineUsers.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No other users online</p>
                </div>
              ) : (
                onlineUsers.map((user, index) => (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="relative">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {user.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span 
                        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${getStatusColor(user.status)}`}
                      />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{user.name}</span>
                        {user.device === 'mobile' ? (
                          <Smartphone className="w-3 h-3 text-muted-foreground" />
                        ) : (
                          <Monitor className="w-3 h-3 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{getStatusText(user.status)}</span>
                        <span>•</span>
                        <span>{formatLastSeen(user.lastSeen)}</span>
                      </div>
                    </div>

                    {user.action && (
                      <Badge variant="secondary" className="text-xs">
                        {user.action}
                      </Badge>
                    )}
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>
      )}

      {/* Your status */}
      <div className="p-3 border-t border-border bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${getStatusColor(myPresence)}`} />
            <span className="text-xs text-muted-foreground">
              Your status: <span className="font-medium text-foreground">{getStatusText(myPresence)}</span>
            </span>
          </div>
          <div className="flex gap-1">
            {(['active', 'idle', 'away'] as const).map((status) => (
              <Button
                key={status}
                size="sm"
                variant={myPresence === status ? 'default' : 'ghost'}
                className="h-6 px-2 text-xs"
                onClick={() => setMyPresence(status)}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PresenceTracker;
