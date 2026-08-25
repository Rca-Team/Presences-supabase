import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ShieldAlert, UserX, Clock, MapPin, Bell, 
  CheckCircle2, AlertTriangle, Eye, Megaphone 
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Alert {
  id: string;
  type: 'stranger' | 'absent' | 'late_repeat' | 'zone' | 'early_departure';
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  time: Date;
  resolved: boolean;
  data?: any;
}

const SmartAlertDashboard = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    generateAlerts();
  }, []);

  const generateAlerts = async () => {
    const generatedAlerts: Alert[] = [];

    // Check for consecutive absentees (3+ days)
    try {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      
      const { data: recentRecords } = await supabase
        .from('attendance_records')
        .select('user_id, status, timestamp')
        .gte('timestamp', threeDaysAgo.toISOString())
        .eq('status', 'absent');

      if (recentRecords) {
        const absentCounts = new Map<string, number>();
        recentRecords.forEach(r => {
          if (r.user_id) absentCounts.set(r.user_id, (absentCounts.get(r.user_id) || 0) + 1);
        });
        absentCounts.forEach((count, userId) => {
          if (count >= 3) {
            generatedAlerts.push({
              id: `absent-${userId}`,
              type: 'absent',
              title: 'Consecutive Absence Alert',
              description: `Student absent for ${count} consecutive days. Parent notification recommended.`,
              severity: 'high',
              time: new Date(),
              resolved: false,
              data: { userId, days: count }
            });
          }
        });
      }
    } catch {}

    // Check for repeat late comers
    try {
      const { data: lateEntries } = await supabase
        .from('late_entries')
        .select('student_id, student_name')
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString());

      if (lateEntries) {
        const lateCounts = new Map<string, { count: number; name: string }>();
        lateEntries.forEach(e => {
          const existing = lateCounts.get(e.student_id) || { count: 0, name: e.student_name || 'Unknown' };
          lateCounts.set(e.student_id, { count: existing.count + 1, name: existing.name });
        });
        lateCounts.forEach(({ count, name }, id) => {
          if (count >= 3) {
            generatedAlerts.push({
              id: `late-${id}`,
              type: 'late_repeat',
              title: 'Chronic Late Comer',
              description: `${name} has been late ${count} times this week.`,
              severity: 'medium',
              time: new Date(),
              resolved: false,
            });
          }
        });
      }
    } catch {}

    // Check unauthorized zone entries
    try {
      const { data: unauthorized } = await supabase
        .from('zone_entries')
        .select('*, campus_zones(name)')
        .eq('is_authorized', false)
        .eq('alert_triggered', true)
        .order('created_at', { ascending: false })
        .limit(5);

      if (unauthorized) {
        unauthorized.forEach((entry: any) => {
          generatedAlerts.push({
            id: `zone-${entry.id}`,
            type: 'zone',
            title: 'Unauthorized Zone Entry',
            description: `Unauthorized entry detected in ${entry.campus_zones?.name || 'restricted zone'}`,
            severity: 'critical',
            time: new Date(entry.entry_time),
            resolved: false,
          });
        });
      }
    } catch {}

    setAlerts(generatedAlerts);
  };

  const resolveAlert = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
    toast.success('Alert resolved');
  };

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.type === filter);
  const unresolvedCount = alerts.filter(a => !a.resolved).length;

  const severityColor = (s: string) => {
    switch (s) {
      case 'critical': return 'text-red-600 bg-red-500/10';
      case 'high': return 'text-orange-500 bg-orange-500/10';
      case 'medium': return 'text-yellow-500 bg-yellow-500/10';
      default: return 'text-blue-500 bg-blue-500/10';
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'stranger': return <ShieldAlert className="h-4 w-4" />;
      case 'absent': return <UserX className="h-4 w-4" />;
      case 'late_repeat': return <Clock className="h-4 w-4" />;
      case 'zone': return <MapPin className="h-4 w-4" />;
      default: return <AlertTriangle className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-destructive" />
            Smart Alert Dashboard
          </h2>
          <p className="text-sm text-muted-foreground">
            {unresolvedCount} unresolved alert{unresolvedCount !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="outline" onClick={generateAlerts} size="sm">
          <Eye className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'stranger', 'absent', 'late_repeat', 'zone'].map(f => (
          <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)} className="capitalize">
            {f === 'all' ? 'All' : f.replace('_', ' ')}
          </Button>
        ))}
      </div>

      {/* Alerts */}
      <ScrollArea className="h-[500px]">
        <div className="space-y-3">
          {filtered.map(alert => (
            <Card key={alert.id} className={alert.resolved ? 'opacity-50' : ''}>
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${severityColor(alert.severity)}`}>
                    {typeIcon(alert.type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm text-foreground">{alert.title}</h3>
                      <Badge variant="outline" className="text-xs capitalize">{alert.severity}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{alert.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {alert.time.toLocaleString('en-IN')}
                    </p>
                  </div>
                  {!alert.resolved && (
                    <Button variant="ghost" size="sm" onClick={() => resolveAlert(alert.id)}>
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              No alerts to show
            </CardContent></Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default SmartAlertDashboard;
