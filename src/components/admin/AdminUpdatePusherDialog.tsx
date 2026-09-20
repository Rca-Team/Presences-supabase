import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Send, Smartphone, Zap, Loader2, CheckCircle2 } from 'lucide-react';
import { useAppUpdate } from '@/hooks/useAppUpdate';

interface AdminUpdatePusherDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminUpdatePusherDialog: React.FC<AdminUpdatePusherDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const { toast } = useToast();
  const { broadcastUpdate } = useAppUpdate();

  const [version, setVersion] = useState('v2.4.2');
  const [title, setTitle] = useState('System Update Available');
  const [description, setDescription] = useState('New facial AI speed improvements and real-time gate pass updates are live.');
  const [forceReload, setForceReload] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast({
        title: 'Incomplete Details',
        description: 'Please provide an update title and description.',
        variant: 'destructive',
      });
      return;
    }

    setIsPublishing(true);
    try {
      await broadcastUpdate({
        version: version.trim() || 'v2.4.2',
        title: title.trim(),
        description: description.trim(),
        forced: forceReload,
      });

      toast({
        title: 'Update Broadcasted 🚀',
        description: `All active mobile apps and connected clients received the update notification.`,
      });
      onClose();
    } catch (err: any) {
      toast({
        title: 'Broadcast Failed',
        description: err?.message || 'Could not send update broadcast.',
        variant: 'destructive',
      });
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md rounded-3xl p-0 overflow-hidden border-border/80 shadow-2xl">
        <DialogHeader className="p-5 pb-4 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-black text-foreground">
                Mobile App Update Pusher
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Broadcast instant update notifications or force-refresh mobile sessions
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleBroadcast} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-foreground">Release / Version Tag</Label>
            <Input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g. v2.4.2"
              className="h-9 text-xs rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-foreground">Notification Headline</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Major Performance Upgrade"
              className="h-9 text-xs rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-foreground">Changelog / Message for Users</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of new features..."
              rows={3}
              className="text-xs rounded-xl resize-none"
            />
          </div>

          <div className="p-3 rounded-2xl border border-border/60 bg-muted/30 flex items-center gap-2.5">
            <Checkbox
              id="force_reload"
              checked={forceReload}
              onCheckedChange={(c) => setForceReload(Boolean(c))}
              className="rounded-md"
            />
            <Label htmlFor="force_reload" className="text-xs font-medium text-foreground cursor-pointer">
              <strong>Immediate Reload:</strong> Automatically reload active mobile screens without waiting for tap (recommended for urgent hotfixes).
            </Label>
          </div>

          <DialogFooter className="pt-2 flex sm:justify-between items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="rounded-xl text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPublishing}
              className="rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            >
              {isPublishing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Broadcasting...</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>Push to All Devices</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AdminUpdatePusherDialog;
