import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { 
  AlertTriangle, 
  Shield, 
  ShieldOff, 
  Lock, 
  Unlock,
  Bell,
  Users,
  Clock,
  History,
  Send
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface LockdownEvent {
  id: string;
  type: 'activate' | 'deactivate';
  reason: string;
  timestamp: Date;
  initiatedBy: string;
}

const EmergencyLockdown: React.FC = () => {
  const { toast } = useToast();
  const [isLockdownActive, setIsLockdownActive] = useState(false);
  const [lockdownReason, setLockdownReason] = useState('');
  const [notifyParents, setNotifyParents] = useState(true);
  const [notifyTeachers, setNotifyTeachers] = useState(true);
  const [lockdownHistory, setLockdownHistory] = useState<LockdownEvent[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    checkLockdownStatus();
    fetchLockdownHistory();
  }, []);

  const checkLockdownStatus = async () => {
    try {
      const { data } = await supabase
        .from('attendance_settings')
        .select('*')
        .eq('key', 'lockdown_active')
        .single();

      setIsLockdownActive(data?.value === 'true');
    } catch (error) {
      // Setting might not exist yet
      console.log('Lockdown setting not found, defaulting to inactive');
    }
  };

  const fetchLockdownHistory = async () => {
    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .like('title', '%Lockdown%')
        .order('created_at', { ascending: false })
        .limit(10);

      const history: LockdownEvent[] = (data || []).map(n => ({
        id: n.id,
        type: n.title.includes('Activated') ? 'activate' : 'deactivate',
        reason: n.message || '',
        timestamp: new Date(n.created_at),
        initiatedBy: 'Admin',
      }));

      setLockdownHistory(history);
    } catch (error) {
      console.error('Error fetching history:', error);
    }
  };

  const activateLockdown = async () => {
    if (!lockdownReason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for the lockdown.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      // Update lockdown status
      await supabase
        .from('attendance_settings')
        .upsert({
          key: 'lockdown_active',
          value: 'true',
          updated_at: new Date().toISOString(),
        });

      // Store lockdown reason
      await supabase
        .from('attendance_settings')
        .upsert({
          key: 'lockdown_reason',
          value: lockdownReason,
          updated_at: new Date().toISOString(),
        });

      // Create notification for all users
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase
        .from('notifications')
        .insert({
          user_id: user?.id || 'system',
          title: '🚨 Emergency Lockdown Activated',
          message: lockdownReason,
          type: 'alert',
        });

      setIsLockdownActive(true);
      setLockdownReason('');

      toast({
        title: "Lockdown Activated",
        description: "Emergency lockdown is now active. Attendance system is paused.",
        variant: "destructive",
      });

      fetchLockdownHistory();
    } catch (error) {
      console.error('Error activating lockdown:', error);
      toast({
        title: "Error",
        description: "Failed to activate lockdown",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const deactivateLockdown = async () => {
    setIsProcessing(true);
    try {
      await supabase
        .from('attendance_settings')
        .upsert({
          key: 'lockdown_active',
          value: 'false',
          updated_at: new Date().toISOString(),
        });

      const { data: { user } } = await supabase.auth.getUser();

      await supabase
        .from('notifications')
        .insert({
          user_id: user?.id || 'system',
          title: '✅ Lockdown Deactivated',
          message: 'The emergency lockdown has been lifted. Normal operations resumed.',
          type: 'info',
        });

      setIsLockdownActive(false);

      toast({
        title: "Lockdown Deactivated",
        description: "Normal operations have been restored.",
      });

      fetchLockdownHistory();
    } catch (error) {
      console.error('Error deactivating lockdown:', error);
      toast({
        title: "Error",
        description: "Failed to deactivate lockdown",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card className={`border-2 ${isLockdownActive ? 'border-red-500 bg-red-500/5' : 'border-green-500 bg-green-500/5'}`}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-4 rounded-full ${isLockdownActive ? 'bg-red-500/20' : 'bg-green-500/20'}`}>
                {isLockdownActive ? (
                  <Lock className="h-8 w-8 text-red-500" />
                ) : (
                  <Unlock className="h-8 w-8 text-green-500" />
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold">
                  {isLockdownActive ? 'LOCKDOWN ACTIVE' : 'System Normal'}
                </h2>
                <p className="text-muted-foreground">
                  {isLockdownActive 
                    ? 'Attendance system is paused. All check-ins disabled.'
                    : 'All systems operational. Attendance is being tracked.'}
                </p>
              </div>
            </div>
            <Badge 
              variant={isLockdownActive ? 'destructive' : 'default'}
              className="text-lg py-2 px-4"
            >
              {isLockdownActive ? 'EMERGENCY' : 'NORMAL'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Control Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Lockdown Controls
            </CardTitle>
            <CardDescription>
              Emergency lockdown pauses all attendance operations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isLockdownActive ? (
              <>
                <div className="space-y-2">
                  <Label>Reason for Lockdown</Label>
                  <Textarea
                    value={lockdownReason}
                    onChange={(e) => setLockdownReason(e.target.value)}
                    placeholder="Enter the reason for emergency lockdown..."
                    rows={3}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4" />
                      <Label>Notify Parents</Label>
                    </div>
                    <Switch
                      checked={notifyParents}
                      onCheckedChange={setNotifyParents}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <Label>Notify Teachers</Label>
                    </div>
                    <Switch
                      checked={notifyTeachers}
                      onCheckedChange={setNotifyTeachers}
                    />
                  </div>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="destructive" 
                      className="w-full"
                      disabled={isProcessing}
                    >
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Activate Emergency Lockdown
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-5 w-5" />
                        Confirm Emergency Lockdown
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This will immediately pause all attendance operations. 
                        Students will not be able to check in until the lockdown is lifted.
                        {notifyParents && " Parents will be notified."}
                        {notifyTeachers && " Teachers will be notified."}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={activateLockdown} className="bg-destructive text-destructive-foreground">
                        Activate Lockdown
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="default" 
                    className="w-full bg-green-600 hover:bg-green-700"
                    disabled={isProcessing}
                  >
                    <ShieldOff className="h-4 w-4 mr-2" />
                    Deactivate Lockdown
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Deactivation</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will restore normal attendance operations. 
                      Students will be able to check in again.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={deactivateLockdown}>
                      Restore Normal Operations
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </CardContent>
        </Card>

        {/* History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Lockdown History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lockdownHistory.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {lockdownHistory.map(event => (
                  <div 
                    key={event.id}
                    className={`p-3 rounded-lg border ${
                      event.type === 'activate' ? 'border-red-500/30 bg-red-500/5' : 'border-green-500/30 bg-green-500/5'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant={event.type === 'activate' ? 'destructive' : 'default'}>
                        {event.type === 'activate' ? 'Activated' : 'Deactivated'}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(event.timestamp, 'MMM d, yyyy HH:mm')}
                      </span>
                    </div>
                    {event.reason && (
                      <p className="text-sm text-muted-foreground mt-1">{event.reason}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No lockdown events recorded</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button variant="outline" className="h-auto py-4 flex-col gap-2">
              <Send className="h-5 w-5" />
              <span>Send All-Clear</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2">
              <Bell className="h-5 w-5" />
              <span>Alert Parents</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2">
              <Users className="h-5 w-5" />
              <span>Notify Staff</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmergencyLockdown;
