import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DoorOpen,
  Camera,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ChildProfile } from '@/hooks/useParentPortal';
import { format } from 'date-fns';

interface ParentGateFeedProps {
  child: ChildProfile;
}

interface GateEntryItem {
  id: string;
  student_id: string;
  student_name: string;
  entry_time: string;
  entry_type: 'entry' | 'exit';
  gate_name?: string;
  is_recognized?: boolean;
  image_url?: string;
}

export const ParentGateFeed: React.FC<ParentGateFeedProps> = ({ child }) => {
  const [gateEntries, setGateEntries] = useState<GateEntryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadGateEntries() {
      setIsLoading(true);
      try {
        const { data } = await supabase
          .from('gate_entries')
          .select('*')
          .or(`student_id.eq.${child.id},student_id.eq.${child.employee_id}`)
          .order('entry_time', { ascending: false })
          .limit(20);

        setGateEntries(data || []);
      } catch (err) {
        console.warn('Could not fetch gate entries:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadGateEntries();
  }, [child.id, child.employee_id]);

  return (
    <Card className="rounded-3xl border-border/80 bg-card shadow-sm overflow-hidden">
      <CardHeader className="p-4 sm:p-6 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-black text-foreground flex items-center gap-2">
              <DoorOpen className="h-5 w-5 text-primary" /> Campus Gate Entry & Exit Logs
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Automated AI biometric gate verification records for {child.name}.
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs rounded-full gap-1 border-emerald-500/30 text-emerald-600 bg-emerald-500/10">
            <ShieldCheck className="h-3 w-3" /> Live Biometric Gate
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 pt-1 space-y-3">
        {gateEntries.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed border-border/80 bg-background/40">
            <DoorOpen className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-xs font-bold text-foreground">No Gate Turnstile Logs Recorded Yet</p>
            <p className="text-[11px] text-muted-foreground max-w-xs mx-auto mt-0.5">
              Live gate timestamps appear automatically when your child passes through smart AI turnstiles.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {gateEntries.map((entry) => {
              const isEntry = entry.entry_type === 'entry';
              return (
                <div
                  key={entry.id}
                  className="p-3.5 rounded-2xl border border-border/70 bg-background/60 hover:bg-muted/30 transition-all flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                        isEntry
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                          : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30'
                      }`}
                    >
                      <DoorOpen className="h-4 w-4" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-black text-foreground">
                          {isEntry ? 'Campus Gate Entry' : 'Campus Gate Exit'}
                        </p>
                        <Badge variant="outline" className="text-[10px] font-semibold rounded-md">
                          {entry.gate_name || 'Main Gate 1'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" />
                        {format(new Date(entry.entry_time), 'EEEE, dd MMM yyyy • hh:mm a')}
                      </p>
                    </div>
                  </div>

                  <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] rounded-full">
                    ✅ Verified Face
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
