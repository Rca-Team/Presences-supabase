import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, ClipboardCheck } from 'lucide-react';

const CHECKLIST_STORAGE_KEY = 'presence_launch_readiness_v1';

const checklistItems = [
  'Register flow: no duplicate draft spam and no duplicate final registration',
  'Gate Mode: session starts reliably and scanner opens without crash',
  'Gate Mode: registered pilot-class students are recognized correctly',
  'Attendance: manual confirm updates stats and Admin in near real-time',
  'Admin: dashboard opens reliably and refreshes without stutter',
  'Notifications: Email, WhatsApp, and SMS deliver in pilot test run',
  'Mobile + Desktop smoke test completed for Register, Gate, Attendance',
  'Launch-day simulation completed for one class end-to-end',
];

const getPersistedChecks = (): boolean[] => {
  try {
    const raw = localStorage.getItem(CHECKLIST_STORAGE_KEY);
    if (!raw) return checklistItems.map(() => false);
    const parsed = JSON.parse(raw) as boolean[];
    if (!Array.isArray(parsed)) return checklistItems.map(() => false);
    return checklistItems.map((_, index) => Boolean(parsed[index]));
  } catch {
    return checklistItems.map(() => false);
  }
};

const LaunchReadinessChecklist = () => {
  const [checks, setChecks] = useState<boolean[]>(() => getPersistedChecks());

  const { completed, total, progress } = useMemo(() => {
    const done = checks.filter(Boolean).length;
    const all = checklistItems.length;
    return {
      completed: done,
      total: all,
      progress: all ? Math.round((done / all) * 100) : 0,
    };
  }, [checks]);

  const toggleCheck = (index: number, nextState: boolean) => {
    const nextChecks = checks.map((value, i) => (i === index ? nextState : value));
    setChecks(nextChecks);
    localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(nextChecks));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Launch readiness checklist
          </CardTitle>
          <Badge variant={progress === 100 ? 'default' : 'secondary'}>
            {completed}/{total}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground">Pilot launch progress: {progress}%</p>
        </div>

        <div className="space-y-3">
          {checklistItems.map((item, index) => {
            const checked = checks[index];
            return (
              <label
                key={item}
                className="flex items-start gap-3 rounded-lg border border-border/70 p-3 bg-card/70"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) => toggleCheck(index, value === true)}
                  className="mt-0.5"
                />
                <span className="text-sm leading-relaxed text-foreground/90 flex-1">{item}</span>
                {checked ? <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" /> : null}
              </label>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default LaunchReadinessChecklist;