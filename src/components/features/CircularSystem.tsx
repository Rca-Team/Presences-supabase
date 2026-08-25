import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { FileText, Plus, Send, AlertCircle, Clock, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';

interface Circular {
  id: string;
  title: string;
  content: string;
  circular_type: string;
  is_urgent: boolean;
  sent_at: string | null;
  acknowledgments_count: number;
  created_at: string;
}

const CircularSystem = () => {
  const { isAdminOrPrincipal } = useUserRole();
  const [circulars, setCirculars] = useState<Circular[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', circular_type: 'general', is_urgent: false });

  const fetch_ = async () => {
    const { data } = await supabase.from('circulars').select('*').order('created_at', { ascending: false });
    if (data) setCirculars(data as Circular[]);
  };

  useEffect(() => { fetch_(); }, []);

  const create = async () => {
    if (!form.title || !form.content) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('circulars').insert({
      ...form,
      created_by: user?.id,
      sent_at: new Date().toISOString()
    });
    if (error) toast.error('Failed to create circular');
    else { toast.success('Circular sent!'); setShowCreate(false); setForm({ title: '', content: '', circular_type: 'general', is_urgent: false }); fetch_(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Digital Circulars / परिपत्र
          </h2>
          <p className="text-sm text-muted-foreground">Send notices and homework to parents</p>
        </div>
        {isAdminOrPrincipal && (
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-4 w-4 mr-1" /> New Circular
          </Button>
        )}
      </div>

      {showCreate && (
        <Card className="border-primary/20">
          <CardContent className="pt-4 space-y-3">
            <Input placeholder="Circular title / शीर्षक" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
            <Textarea placeholder="Content / विषय..." value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} rows={4} />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch checked={form.is_urgent} onCheckedChange={v => setForm(p => ({ ...p, is_urgent: v }))} />
                <Label>Urgent / अत्यावश्यक</Label>
              </div>
              <Button onClick={create}>
                <Send className="h-4 w-4 mr-1" /> Send to Parents
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {circulars.map(c => (
          <Card key={c.id} className={c.is_urgent ? 'border-destructive/30' : ''}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-foreground">{c.title}</h3>
                    {c.is_urgent && <Badge variant="destructive" className="text-xs"><AlertCircle className="h-3 w-3 mr-1" />Urgent</Badge>}
                    <Badge variant="outline" className="text-xs capitalize">{c.circular_type}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{c.content}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {c.acknowledgments_count} acknowledged
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
        {circulars.length === 0 && (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No circulars yet</CardContent></Card>
        )}
      </div>
    </div>
  );
};

export default CircularSystem;
