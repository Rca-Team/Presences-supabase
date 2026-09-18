import React from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Phone, Send, CheckCircle2, UserX, ExternalLink } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { AndroidWidgetItem, PALETTE_CLASSES } from './types';
import { ClassStudent } from '@/components/teacher/TeacherAdminWorkspace';
import { sanitizeStudentPhotoUrl } from '@/utils/studentPhotoResolver';

interface AbsenteeBlastWidgetProps {
  widget: AndroidWidgetItem;
  students: ClassStudent[];
  activeClassName?: string;
  onOpenAbsenteeManager?: () => void;
}

export const AbsenteeBlastWidget: React.FC<AbsenteeBlastWidgetProps> = ({
  widget,
  students,
  activeClassName = 'Class',
  onOpenAbsenteeManager,
}) => {
  const palette = PALETTE_CLASSES[widget.palette] || PALETTE_CLASSES['dynamic-emerald'];

  const absentees = React.useMemo(() => {
    return (students || [])
      .filter((s) => s.today_status === 'absent' || (!s.today_status || s.today_status === 'unmarked'))
      .slice(0, 8);
  }, [students]);

  const sendWhatsApp = (s: ClassStudent) => {
    if (!s.parent_phone) return;
    const clean = s.parent_phone.replace(/[^0-9]/g, '');
    const phone = clean.length === 10 ? `91${clean}` : clean;
    const text = encodeURIComponent(
      `Dear ${s.parent_name || 'Parent'}, this is from PM Shri KV NFC Vigyan Vihar regarding ${s.name} (${activeClassName}). Today's attendance is marked: ${s.today_status?.toUpperCase() || 'ABSENT'}. Please contact class teacher if you have any questions.`
    );
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  return (
    <div className="flex flex-col justify-between h-full gap-3">
      {/* Header with Counter and Blast All action */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-xl sm:text-2xl font-black text-foreground font-mono block">
            {absentees.length} <span className="text-xs text-muted-foreground font-normal">Pending Absentees</span>
          </span>
          <span className="text-xs text-muted-foreground font-medium block">
            1-Tap WhatsApp Guardian Alerts
          </span>
        </div>

        {onOpenAbsenteeManager && (
          <button
            type="button"
            onClick={onOpenAbsenteeManager}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold shadow-sm shadow-emerald-500/20 transition-all shrink-0"
          >
            <Send className="h-3.5 w-3.5" /> Blast Hub
          </button>
        )}
      </div>

      {/* Horizontal Carousel of Absentees */}
      {absentees.length === 0 ? (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-center flex flex-col items-center justify-center my-auto">
          <CheckCircle2 className="h-6 w-6 text-emerald-500 mb-1" />
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">100% Attendance Verified!</p>
          <p className="text-[10px] text-muted-foreground">All students present today in {activeClassName}.</p>
        </div>
      ) : (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {absentees.map((s) => {
            const photoUrl = s.photo_url
              ? sanitizeStudentPhotoUrl(s.photo_url)
              : `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(s.name || 'Student')}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;

            return (
              <div
                key={s.id}
                className="flex items-center gap-2.5 p-2 px-3 rounded-2xl bg-card/80 border border-border/80 shadow-xs shrink-0 max-w-[200px]"
              >
                <Avatar className="h-8 w-8 rounded-xl border border-rose-500/30 shrink-0">
                  <AvatarImage src={photoUrl} alt={s.name} />
                  <AvatarFallback className="text-[10px] font-bold bg-muted">
                    {s.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold text-foreground truncate">{s.name}</p>
                  <p className="text-[10px] font-mono text-muted-foreground">Roll #{s.roll_number || '—'}</p>
                </div>

                <button
                  type="button"
                  onClick={() => sendWhatsApp(s)}
                  disabled={!s.parent_phone}
                  className="h-7 w-7 rounded-lg bg-emerald-500/15 hover:bg-emerald-500 text-emerald-600 hover:text-white flex items-center justify-center transition-colors shrink-0 disabled:opacity-30"
                  title={s.parent_phone ? `WhatsApp ${s.parent_name || 'Parent'}` : 'No phone recorded'}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
