import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Trophy,
  Award,
  Sparkles,
  Flame,
  Star,
  CheckCircle2,
  Medal,
  TrendingUp,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { ChildProfile, ParentSummaryStats, BadgeItem } from '@/hooks/useParentPortal';

interface ParentAchievementsHubProps {
  child: ChildProfile;
  summary: ParentSummaryStats;
  badges: BadgeItem[];
}

const DEFAULT_BADGES = [
  { name: '🌅 Early Bird Hero', desc: 'Arrived before 07:15 AM for 5 consecutive days', unlocked: true, color: 'from-amber-500 to-orange-500' },
  { name: '🔥 Consistency Streak', desc: 'Maintained continuous 100% daily attendance', unlocked: true, color: 'from-rose-500 to-amber-500' },
  { name: '🌟 Perfect Month Star', desc: 'Completed full month without unauthorized absences', unlocked: true, color: 'from-emerald-500 to-teal-500' },
  { name: '⏰ Punctuality Master', desc: 'Zero late arrivals during official morning gate period', unlocked: true, color: 'from-blue-500 to-indigo-500' },
  { name: '🛡️ Safety First Cadet', desc: 'Always checked in at designated biometric campus gate', unlocked: true, color: 'from-purple-500 to-pink-500' },
];

export const ParentAchievementsHub: React.FC<ParentAchievementsHubProps> = ({
  child,
  summary,
  badges,
}) => {
  const level = Math.max(1, Math.floor((summary.presentDays * 15 + summary.streak * 10) / 100) + 1);
  const xp = summary.presentDays * 15 + summary.streak * 10;

  return (
    <Card className="rounded-3xl border-border/80 bg-card shadow-sm overflow-hidden">
      <CardHeader className="p-4 sm:p-6 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-black text-foreground flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" /> Student Badges & Achievements
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Rewarding punctuality, consistency, and daily school discipline for {child.name}.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-xs font-bold rounded-full gap-1">
              <Award className="h-3.5 w-3.5" /> Level {level} Scholar
            </Badge>
            <Badge variant="outline" className="text-xs font-mono rounded-full text-muted-foreground">
              {xp} Total XP
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 pt-1 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DEFAULT_BADGES.map((b, i) => (
            <motion.div
              key={b.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="p-3.5 rounded-2xl border border-border/70 bg-background/60 hover:bg-muted/30 transition-all flex items-start gap-3.5"
            >
              <div
                className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${b.color} text-white flex items-center justify-center shrink-0 shadow-md text-base`}
              >
                <Star className="h-5 w-5 fill-white" />
              </div>

              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-black text-foreground">{b.name}</p>
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[9px] px-1.5 py-0 rounded-full font-bold">
                    Unlocked
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {b.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
