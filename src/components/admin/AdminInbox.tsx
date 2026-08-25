import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, RefreshCw, Search, Inbox, AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface EmailLogItem {
  id: string;
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

const statusVariant = (status: string) => {
  if (status === 'sent') return 'default';
  if (status === 'pending') return 'secondary';
  if (status === 'suppressed') return 'outline';
  return 'destructive';
};

const StatusIcon = ({ status }: { status: string }) => {
  if (status === 'sent') return <CheckCircle2 className="w-3.5 h-3.5" />;
  if (status === 'pending') return <LoaderCircle className="w-3.5 h-3.5 animate-spin" />;
  return <AlertCircle className="w-3.5 h-3.5" />;
};

const AdminInbox: React.FC = () => {
  const { toast } = useToast();
  const [logs, setLogs] = useState<EmailLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [templateFilter, setTemplateFilter] = useState<string>('all');
  const [recipientFilter, setRecipientFilter] = useState('');
  const [retryingIds, setRetryingIds] = useState<Record<string, boolean>>({});

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-email-inbox', { body: {} });
      if (error) throw error;
      setLogs((data?.logs as EmailLogItem[]) || []);
    } catch (err) {
      console.error('Error fetching email logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const timer = setInterval(fetchLogs, 10000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const dedupedLogs = useMemo(() => {
    const byMessage = new Map<string, EmailLogItem>();
    for (const row of logs) {
      const key = row.message_id || row.id;
      if (!byMessage.has(key)) byMessage.set(key, row);
    }
    return Array.from(byMessage.values());
  }, [logs]);

  const filtered = dedupedLogs.filter((e) => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (templateFilter !== 'all' && e.template_name !== templateFilter) return false;
    if (recipientFilter && !e.recipient_email.toLowerCase().includes(recipientFilter.toLowerCase())) return false;
    return true;
  });

  const liveCount = dedupedLogs.filter((e) => e.status === 'pending').length;
  const templateOptions = useMemo(
    () => Array.from(new Set(dedupedLogs.map((e) => e.template_name))).sort((a, b) => a.localeCompare(b)),
    [dedupedLogs]
  );

  const retryableStatuses = new Set(['failed', 'dlq']);

  const handleRetry = async (messageId: string | null) => {
    if (!messageId) return;
    setRetryingIds((prev) => ({ ...prev, [messageId]: true }));
    try {
      const { error } = await supabase.functions.invoke('admin-email-inbox', {
        body: { action: 'retry', messageId },
      });

      if (error) throw error;

      toast({
        title: 'Retry queued',
        description: 'The email has been added back to the send queue.',
      });

      await fetchLogs();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Retry failed',
        description: err?.message || 'Unable to retry this email.',
      });
    } finally {
      setRetryingIds((prev) => ({ ...prev, [messageId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Email Inbox (Realtime)</h2>
          {liveCount > 0 && <Badge variant="secondary" className="text-xs">{liveCount} sending</Badge>}
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="dlq">DLQ</SelectItem>
            <SelectItem value="suppressed">Suppressed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={templateFilter} onValueChange={setTemplateFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Template" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All templates</SelectItem>
            {templateOptions.map((template) => (
              <SelectItem key={template} value={template}>{template}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Filter recipient..."
            value={recipientFilter}
            onChange={(e) => setRecipientFilter(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Mail className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground font-medium">No email activity yet</p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-16rem)]">
          <div className="space-y-1">
            {filtered.map((email) => (
              <div key={email.id} className="w-full text-left p-3 rounded-lg border bg-card border-border">
                <div className="flex items-start gap-3">
                  <StatusIcon status={email.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{email.recipient_email}</span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(email.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{email.template_name}</p>
                    {email.error_message && (
                      <p className="text-xs text-destructive truncate mt-0.5">{email.error_message}</p>
                    )}
                  </div>
                  <Badge variant={statusVariant(email.status)} className="text-[10px]">
                    {email.status}
                  </Badge>
                  {email.message_id && retryableStatuses.has(email.status) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      disabled={Boolean(retryingIds[email.message_id])}
                      onClick={() => handleRetry(email.message_id)}
                    >
                      {retryingIds[email.message_id] ? 'Retrying...' : 'Retry'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default AdminInbox;
