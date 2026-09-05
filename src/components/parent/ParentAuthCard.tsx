import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Search,
  Users,
  Sparkles,
  PhoneCall,
  KeyRound,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  GraduationCap,
  ArrowRight,
  User,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { ChildProfile } from '@/hooks/useParentPortal';

interface ParentAuthCardProps {
  studentId: string;
  phone: string;
  isLoading: boolean;
  savedChildren: ChildProfile[];
  onStudentIdChange: (val: string) => void;
  onPhoneChange: (val: string) => void;
  onSearch: (studentId: string, phone: string) => void;
  onSelectSibling: (sibling: ChildProfile) => void;
}

export const ParentAuthCard: React.FC<ParentAuthCardProps> = ({
  studentId,
  phone,
  isLoading,
  savedChildren,
  onStudentIdChange,
  onPhoneChange,
  onSearch,
  onSelectSibling,
}) => {
  const [rememberMe, setRememberMe] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId.trim() || !phone.trim()) return;
    onSearch(studentId.trim(), phone.trim());
  };

  const handleDemoFill = (demoId: string, demoPhone: string) => {
    onStudentIdChange(demoId);
    onPhoneChange(demoPhone);
    onSearch(demoId, demoPhone);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-xl mx-auto space-y-6"
    >
      {/* Saved Sibling Switcher Bar */}
      {savedChildren.length > 0 && (
        <div className="bg-card/70 backdrop-blur-xl border border-border/80 rounded-3xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-primary" /> Your Saved Children
            </span>
            <Badge variant="secondary" className="text-[10px] rounded-full px-2">
              1-Tap Switch
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {savedChildren.map((sibling) => (
              <button
                key={sibling.employee_id}
                type="button"
                onClick={() => onSelectSibling(sibling)}
                className="flex items-center gap-2.5 p-2 pr-3.5 rounded-2xl bg-muted/60 hover:bg-primary/10 hover:border-primary/40 border border-border/60 transition-all text-left group"
              >
                <Avatar className="h-8 w-8 rounded-xl border border-border">
                  <AvatarImage src={sibling.image_url} />
                  <AvatarFallback className="text-xs font-bold bg-primary/20 text-primary">
                    {sibling.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                    {sibling.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Class {sibling.category}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Login Card */}
      <Card className="rounded-3xl border-border/80 bg-card/90 shadow-xl backdrop-blur-2xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -ml-16 -mb-16" />

        <CardHeader className="text-center pb-2 pt-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-3 shadow-inner">
            <GraduationCap className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-black tracking-tight text-foreground">
            Parent Attendance Portal
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto">
            Check your child's live school entry, daily periods, timetable, and attendance reports.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6 sm:p-8 pt-2">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Student ID */}
            <div className="space-y-1.5">
              <Label htmlFor="student-id" className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-primary" /> Student ID / Roll Number
              </Label>
              <Input
                id="student-id"
                type="text"
                placeholder="e.g. STU001 or Roll No."
                value={studentId}
                onChange={(e) => onStudentIdChange(e.target.value)}
                className="h-12 text-sm rounded-2xl bg-background/80 border-border/80 focus:border-primary px-4 shadow-xs"
                required
                autoComplete="off"
              />
            </div>

            {/* Parent Phone */}
            <div className="space-y-1.5">
              <Label htmlFor="parent-phone" className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <PhoneCall className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Registered Mobile Number
              </Label>
              <Input
                id="parent-phone"
                type="tel"
                placeholder="10-digit registered phone"
                value={phone}
                onChange={(e) => onPhoneChange(e.target.value)}
                className="h-12 text-sm rounded-2xl bg-background/80 border-border/80 focus:border-primary px-4 shadow-xs"
                required
              />
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                <ShieldCheck className="h-3 w-3 text-emerald-500 shrink-0" /> Secured access via phone verification.
              </p>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading || !studentId.trim() || !phone.trim()}
              className="w-full h-12 rounded-2xl text-sm font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white shadow-lg shadow-blue-500/25 transition-all active:scale-[0.98] mt-2 border-0"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" /> Verifying School Records...
                </>
              ) : (
                <>
                  View Child's Status <ArrowRight className="ml-2 h-4 w-4 text-white" />
                </>
              )}
            </Button>
          </form>

          {/* Quick Demo Selector for instant preview */}
          <div className="mt-6 pt-5 border-t border-border/60">
            <p className="text-[11px] font-bold text-muted-foreground text-center uppercase tracking-wider mb-2.5">
              ✨ Need Quick Testing? Try Demo:
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs rounded-xl h-8 border-dashed"
                onClick={() => handleDemoFill('1001', '9876543210')}
              >
                Sample Student (1001)
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs rounded-xl h-8 border-dashed"
                onClick={() => handleDemoFill('STU001', '9876543210')}
              >
                Sample Student (STU001)
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
