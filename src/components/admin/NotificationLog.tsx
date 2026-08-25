import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  MessageSquare, Mail, Phone, RefreshCw, CheckCircle2, 
  XCircle, Clock, Filter, ChevronDown 
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface NotificationRecord {
  id: string;
  recipient_phone: string | null;
  recipient_id: string | null;
  message_content: string | null;
  notification_type: string | null;
  status: string | null;
  created_at: string;
  gateway_response: any;
}

const NotificationLog = () => {
  const [logs, setLogs] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [limit, setLimit] = useState(50);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('notification_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (filter !== 'all') {
        query = query.eq('notification_type', filter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Failed to fetch notification logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();

    const channel = supabase
      .channel('notification-log-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notification_log' }, (payload) => {
        setLogs(prev => [payload.new as NotificationRecord, ...prev].slice(0, limit));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [filter, limit]);

  const getTypeIcon = (type: string | null) => {
    switch (type) {
      case 'whatsapp': return <MessageSquare className="w-4 h-4 text-green-500" />;
      case 'email': return <Mail className="w-4 h-4 text-blue-500" />;
      case 'sms': return <Phone className="w-4 h-4 text-orange-500" />;
      default: return <MessageSquare className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'sent':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs gap-1"><CheckCircle2 className="w-3 h-3" />Sent</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20 text-xs gap-1"><XCircle className="w-3 h-3" />Failed</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 text-xs gap-1"><Clock className="w-3 h-3" />Pending</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status || 'Unknown'}</Badge>;
    }
  };

  const getTypeBadge = (type: string | null) => {
    switch (type) {
      case 'whatsapp': return <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">WhatsApp</Badge>;
      case 'email': return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs">Email</Badge>;
      case 'sms': return <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-xs">SMS</Badge>;
      default: return <Badge variant="outline" className="text-xs">{type || 'Unknown'}</Badge>;
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const stats = {
    total: logs.length,
    sent: logs.filter(l => l.status === 'sent').length,
    failed: logs.filter(l => l.status === 'failed').length,
    whatsapp: logs.filter(l => l.notification_type === 'whatsapp').length,
    email: logs.filter(l => l.notification_type === 'email').length,
    sms: logs.filter(l => l.notification_type === 'sms').length,
  };

  return (
    <div className="space-y-4">
      {/* Stats Summary */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {[
          { label: 'Total', value: stats.total, color: 'text-foreground' },
          { label: 'Sent', value: stats.sent, color: 'text-green-600' },
          { label: 'Failed', value: stats.failed, color: 'text-red-600' },
          { label: 'WhatsApp', value: stats.whatsapp, color: 'text-green-500' },
          { label: 'Email', value: stats.email, color: 'text-blue-500' },
          { label: 'SMS', value: stats.sms, color: 'text-orange-500' },
        ].map((s, i) => (
          <Card key={i} className="p-3 text-center">
            <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Filters & Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <Filter className="w-3 h-3 mr-1" />
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={fetchLogs}>
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Log List */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">Delivery Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No notifications sent yet</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <div className="divide-y divide-border">
                {logs.map((log) => (
                  <div key={log.id} className="px-4 py-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="mt-0.5">{getTypeIcon(log.notification_type)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {getTypeBadge(log.notification_type)}
                            {getStatusBadge(log.status)}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            {log.recipient_phone ? `To: ${log.recipient_phone}` : 'No phone'}
                          </p>
                          {log.message_content && (
                            <p className="text-xs text-foreground/70 mt-1 line-clamp-2">
                              {log.message_content}
                            </p>
                          )}
                          {log.status === 'failed' && log.gateway_response && (
                            <p className="text-[10px] text-red-500 mt-1">
                              Error: {typeof log.gateway_response === 'object' 
                                ? (log.gateway_response as any)?.error || 'Unknown error' 
                                : String(log.gateway_response)}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatTime(log.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {logs.length >= limit && (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={() => setLimit(prev => prev + 50)}>
            <ChevronDown className="w-3 h-3 mr-1" /> Load More
          </Button>
        </div>
      )}
    </div>
  );
};

export default NotificationLog;
