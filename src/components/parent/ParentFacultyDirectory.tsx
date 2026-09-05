import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Users,
  GraduationCap,
  Phone,
  Mail,
  Clock,
  Building,
  ShieldCheck,
  MessageSquare,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ChildProfile } from '@/hooks/useParentPortal';

interface ParentFacultyDirectoryProps {
  child: ChildProfile;
}

export const ParentFacultyDirectory: React.FC<ParentFacultyDirectoryProps> = ({ child }) => {
  const [classTeacher, setClassTeacher] = useState<{ name: string; email?: string; phone?: string } | null>(null);

  useEffect(() => {
    async function loadTeachers() {
      try {
        const cat = child.category || '6-A';
        const [cls, sec] = cat.split('-');

        const { data } = await supabase
          .from('class_teachers')
          .select('*')
          .or(`category.eq.${cat},and(class.eq.${cls},section.eq.${sec})`)
          .maybeSingle();

        if (data) {
          setClassTeacher({
            name: data.teacher_name || 'Class Teacher',
            email: data.teacher_email || 'teacher@school.edu.in',
            phone: (data.metadata as any)?.phone || '+91 11 2233 4455',
          });
        }
      } catch (err) {
        console.warn('Error loading teacher info:', err);
      }
    }

    loadTeachers();
  }, [child.category]);

  return (
    <div className="space-y-4">
      {/* Class Teacher Card */}
      <Card className="rounded-3xl border-border/80 bg-card shadow-sm overflow-hidden">
        <CardHeader className="p-4 sm:p-6 pb-3">
          <CardTitle className="text-lg font-black text-foreground flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" /> Class Teacher Desk
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Direct communication channel for Class {child.category}.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 pt-1 space-y-4">
          <div className="p-4 rounded-2xl bg-muted/40 border border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <Avatar className="h-14 w-14 rounded-2xl border border-border">
                <AvatarFallback className="bg-primary/20 text-primary font-bold text-lg">
                  {classTeacher?.name ? classTeacher.name.charAt(0) : 'T'}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-black text-foreground">
                    {classTeacher?.name || 'Class Teacher'}
                  </p>
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] rounded-full">
                    Class Teacher
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Class {child.category} • Academic Session 2026–2027
                </p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                  <Clock className="h-3 w-3 text-emerald-500" /> Parent Consultation Hours: 12:30 PM – 01:30 PM
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl text-xs font-bold h-9 border-border/80 flex-1 sm:flex-initial"
                onClick={() => window.open(`mailto:${classTeacher?.email || 'school@kvs.ac.in'}?subject=Inquiry regarding ${child.name} (Class ${child.category})`)}
              >
                <Mail className="mr-1.5 h-3.5 w-3.5" /> Email
              </Button>
              <Button
                variant="default"
                size="sm"
                className="rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white h-9 shadow-sm flex-1 sm:flex-initial"
                onClick={() => window.open(`tel:${classTeacher?.phone || '+911122334455'}`)}
              >
                <Phone className="mr-1.5 h-3.5 w-3.5" /> Call
              </Button>
            </div>
          </div>

          {/* School Emergency & Reception Desk */}
          <div className="p-4 rounded-2xl border border-border/70 bg-background/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <p className="font-bold text-foreground flex items-center gap-1.5">
                <Building className="h-3.5 w-3.5 text-primary" /> School Administration & Reception Desk
              </p>
              <p className="text-muted-foreground">
                PM Shri Kendriya Vidyalaya NFC Vigyan Vihar, Delhi
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs rounded-xl py-1 px-3">
                📞 011-22144321
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
