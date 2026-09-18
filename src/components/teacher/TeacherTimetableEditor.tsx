import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  CalendarDays,
  Clock,
  BookOpen,
  Edit2,
  Save,
  Printer,
  Sparkles,
  Plus,
  Trash2,
  Users,
  CheckCircle2,
  Flame,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ClassAssignment } from './TeacherAdminWorkspace';

interface PeriodSlot {
  period: number;
  time: string;
  subject: string;
  teacher: string;
  room: string;
}

const DEFAULT_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DEFAULT_PERIODS: PeriodSlot[] = [
  { period: 1, time: '08:30 - 09:15', subject: 'Mathematics', teacher: 'Dr. R. K. Sharma', room: 'Room 204' },
  { period: 2, time: '09:15 - 10:00', subject: 'Physics', teacher: 'Prof. Gaurav', room: 'Physics Lab' },
  { period: 3, time: '10:15 - 11:00', subject: 'Chemistry', teacher: 'Dr. V. Nair', room: 'Chem Lab' },
  { period: 4, time: '11:00 - 11:45', subject: 'English Core', teacher: 'Mrs. S. Sen', room: 'Room 204' },
  { period: 5, time: '12:30 - 01:15', subject: 'Computer Science', teacher: 'Mr. A. Joshi', room: 'Comp Lab 1' },
  { period: 6, time: '01:15 - 02:00', subject: 'Biology / Physical Ed', teacher: 'Dr. P. Roy', room: 'Ground' },
  { period: 7, time: '02:00 - 02:40', subject: 'Library / Remedial', teacher: 'Mrs. S. Sen', room: 'Library' },
];

interface TeacherTimetableEditorProps {
  activeClass: ClassAssignment;
}

export const TeacherTimetableEditor: React.FC<TeacherTimetableEditorProps> = ({ activeClass }) => {
  const { toast } = useToast();
  const storageKey = `presences_timetable_${activeClass.category}`;

  const [timetable, setTimetable] = useState<Record<string, PeriodSlot[]>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    const initial: Record<string, PeriodSlot[]> = {};
    DEFAULT_DAYS.forEach(day => {
      initial[day] = [...DEFAULT_PERIODS];
    });
    return initial;
  });

  const [activeDay, setActiveDay] = useState<string>('Monday');
  const [editingSlot, setEditingSlot] = useState<{ day: string; slot: PeriodSlot; index: number } | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(timetable));
    } catch {}
  }, [timetable, storageKey]);

  // Save edited slot
  const handleSaveSlot = () => {
    if (!editingSlot) return;
    const { day, slot, index } = editingSlot;
    setTimetable(prev => {
      const daySlots = [...(prev[day] || [])];
      daySlots[index] = slot;
      return { ...prev, [day]: daySlots };
    });

    toast({ title: 'Timetable Updated', description: `Saved Period ${slot.period} for ${day}.` });
    setIsEditDialogOpen(false);
  };

  // Print Timetable
  const handlePrintTimetable = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Class ${activeClass.category} Timetable</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; padding: 20px; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #2563eb; padding-bottom: 10px; }
            .title { font-size: 20px; font-weight: bold; color: #1e3a8a; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: center; }
            th { background-color: #f1f5f9; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">PM SHRI KENDRIYA VIDYALAYA NFC VIGYAN VIHAR</div>
            <div>Official Class Timetable • Class ${activeClass.category}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Day</th>
                ${DEFAULT_PERIODS.map(p => `<th>P${p.period}<br><span style="font-size:9px; font-weight:normal;">${p.time}</span></th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${DEFAULT_DAYS.map(day => `
                <tr>
                  <td style="font-weight: bold; text-align: left;">${day}</td>
                  ${(timetable[day] || []).map(p => `
                    <td>
                      <strong>${p.subject}</strong><br>
                      <span style="font-size:9px; color:#475569;">${p.teacher}</span>
                    </td>
                  `).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const currentDaySlots = timetable[activeDay] || DEFAULT_PERIODS;

  return (
    <div className="space-y-4">
      <Card className="border shadow-md rounded-2xl bg-card">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-extrabold flex items-center gap-2">
                    <span>Class Timetable & Period Schedule</span>
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs font-bold">
                      Class {activeClass.category}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    View and customize weekly periods, subjects, assigned faculty, and room locations for your class.
                  </CardDescription>
                </div>
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={handlePrintTimetable}
              className="text-xs h-8 rounded-xl gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" /> Print Timetable
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          {/* Day Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
            {DEFAULT_DAYS.map((day) => (
              <Button
                key={day}
                size="sm"
                variant={activeDay === day ? 'default' : 'outline'}
                onClick={() => setActiveDay(day)}
                className="h-8 text-xs rounded-xl px-3 font-bold"
              >
                {day}
              </Button>
            ))}
          </div>

          {/* Period Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {currentDaySlots.map((slot, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-card hover:border-amber-500/40 hover:shadow-md transition-all flex flex-col justify-between gap-2"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px] font-extrabold">
                      Period {slot.period}
                    </Badge>
                    <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {slot.time}
                    </span>
                  </div>

                  <h4 className="font-bold text-sm text-foreground mt-2">
                    {slot.subject}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    👨‍🏫 {slot.teacher}
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                    📍 {slot.room}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingSlot({ day: activeDay, slot: { ...slot }, index: idx });
                      setIsEditDialogOpen(true);
                    }}
                    className="h-6 text-[10px] px-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-500/10 rounded-lg gap-1 font-semibold"
                  >
                    <Edit2 className="h-3 w-3" /> Edit Period
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Edit Slot Dialog */}
      {editingSlot && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-md sm:rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Edit2 className="h-4 w-4 text-amber-500" />
                Edit Period {editingSlot.slot.period} • {editingSlot.day}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Update subject, teacher, time, or classroom location.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div>
                <Label className="text-xs font-semibold">Subject:</Label>
                <Input
                  value={editingSlot.slot.subject}
                  onChange={e => setEditingSlot(prev => prev ? {
                    ...prev,
                    slot: { ...prev.slot, subject: e.target.value }
                  } : null)}
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Teacher:</Label>
                  <Input
                    value={editingSlot.slot.teacher}
                    onChange={e => setEditingSlot(prev => prev ? {
                      ...prev,
                      slot: { ...prev.slot, teacher: e.target.value }
                    } : null)}
                    className="h-8 text-xs mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">Room / Lab:</Label>
                  <Input
                    value={editingSlot.slot.room}
                    onChange={e => setEditingSlot(prev => prev ? {
                      ...prev,
                      slot: { ...prev.slot, room: e.target.value }
                    } : null)}
                    className="h-8 text-xs mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Time Slot:</Label>
                <Input
                  value={editingSlot.slot.time}
                  onChange={e => setEditingSlot(prev => prev ? {
                    ...prev,
                    slot: { ...prev.slot, time: e.target.value }
                  } : null)}
                  className="h-8 text-xs mt-1 font-mono"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setIsEditDialogOpen(false)} className="text-xs">
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveSlot} className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl">
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default TeacherTimetableEditor;
