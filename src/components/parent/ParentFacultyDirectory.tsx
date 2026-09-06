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
  Sparkles,
  MapPin,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ChildProfile } from '@/hooks/useParentPortal';
import swamiAnantVyasPhoto from '@/assets/swami-anant-vyas.png';

interface ParentFacultyDirectoryProps {
  child: ChildProfile;
}

interface TeacherDetails {
  name: string;
  designation: string;
  department?: string;
  email: string;
  phone: string;
  avatarUrl?: string;
  consultationHours: string;
  room: string;
}

// Canonical faculty records for school
const DEFAULT_CLASS_TEACHERS: Record<string, TeacherDetails> = {
  '6-A': {
    name: 'Swami Anant Vyas',
    designation: 'Class Teacher (Class 6-A)',
    department: 'Computer Science, AI & Mathematics',
    email: 'filterself@gmail.com',
    phone: '+91 98108 81236',
    avatarUrl: swamiAnantVyasPhoto,
    consultationHours: '12:30 PM – 01:30 PM (Mon – Fri)',
    room: 'Room 104, Class 6-A (Junior Wing)',
  },
  '6-B': {
    name: 'Mrs. Sunita Sharma',
    designation: 'Class Teacher (Class 6-B)',
    department: 'English Language & Literature',
    email: 'sunitasharma@kvs.ac.in',
    phone: '+91 98765 43210',
    consultationHours: '12:30 PM – 01:30 PM (Mon – Fri)',
    room: 'Room 105, Class 6-B',
  },
};

const sanitizeTeacherName = (rawName?: string | null, cat?: string): string | null => {
  if (!rawName) return null;
  const clean = rawName.trim();
  const lower = clean.toLowerCase();
  // Filter out invalid names that are just class categories or placeholder text
  if (
    lower === '6th a' ||
    lower === '6-a' ||
    lower === 'class 6-a' ||
    lower === 'class teacher' ||
    lower === 'teacher' ||
    lower === cat?.toLowerCase()
  ) {
    return null;
  }
  return clean;
};

export const ParentFacultyDirectory: React.FC<ParentFacultyDirectoryProps> = ({ child }) => {
  const cat = child.category || '6-A';
  const defaultTeacher = DEFAULT_CLASS_TEACHERS[cat] || DEFAULT_CLASS_TEACHERS['6-A'];

  const [classTeacher, setClassTeacher] = useState<TeacherDetails>(defaultTeacher);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function loadTeachers() {
      setIsLoading(true);
      try {
        const [cls, sec] = cat.split('-');

        // 1. Try fetching from settings table first (unrestricted)
        const { data: settingData } = await supabase
          .from('attendance_settings')
          .select('value')
          .eq('key', `class_teacher_${cat}`)
          .maybeSingle();

        if (settingData && settingData.value) {
          const val = settingData.value as any;
          const cleanName = sanitizeTeacherName(val.name || val.teacher_name, cat);
          if (cleanName) {
            setClassTeacher({
              name: cleanName,
              designation: val.designation || `Class Teacher (Class ${cat})`,
              department: val.department || defaultTeacher.department,
              email: val.email || defaultTeacher.email,
              phone: val.phone || defaultTeacher.phone,
              avatarUrl: val.avatarUrl || defaultTeacher.avatarUrl,
              consultationHours: val.consultationHours || defaultTeacher.consultationHours,
              room: val.room || defaultTeacher.room,
            });
            setIsLoading(false);
            return;
          }
        }

        // 2. Try class_teachers table
        const { data } = await supabase
          .from('class_teachers')
          .select('*')
          .or(`category.eq.${cat},and(class.eq.${cls},section.eq.${sec})`)
          .maybeSingle();

        if (data) {
          const cleanName = sanitizeTeacherName(data.teacher_name, cat);
          if (cleanName) {
            setClassTeacher({
              name: cleanName,
              designation: `Class Teacher (Class ${cat})`,
              department: (data.metadata as any)?.department || defaultTeacher.department,
              email: data.teacher_email || (data.metadata as any)?.email || defaultTeacher.email,
              phone: (data.metadata as any)?.phone || defaultTeacher.phone,
              avatarUrl: (data.metadata as any)?.avatar_url || defaultTeacher.avatarUrl,
              consultationHours: (data.metadata as any)?.consultation_hours || defaultTeacher.consultationHours,
              room: (data.metadata as any)?.room || defaultTeacher.room,
            });
            setIsLoading(false);
            return;
          }
        }

        // 3. Fallback to default verified teacher for Class 6-A
        setClassTeacher(defaultTeacher);
      } catch (err) {
        console.warn('Error loading teacher info:', err);
        setClassTeacher(defaultTeacher);
      } finally {
        setIsLoading(false);
      }
    }

    loadTeachers();
  }, [cat]);

  const cleanPhoneForDial = classTeacher.phone.replace(/[^0-9+]/g, '');

  return (
    <div className="space-y-4">
      {/* Class Teacher Card */}
      <Card className="rounded-3xl border-border/80 bg-card shadow-sm overflow-hidden">
        <CardHeader className="p-4 sm:p-6 pb-3">
          <CardTitle className="text-lg font-black text-foreground flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" /> Class Teacher Desk
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Direct verified communication channel for Class {child.category}.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 pt-1 space-y-4">
          <div className="p-4 sm:p-5 rounded-2xl bg-muted/40 border border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 sm:gap-4">
              <Avatar className="h-16 w-16 rounded-2xl border-2 border-primary/20 shadow-md ring-2 ring-background shrink-0 overflow-hidden">
                <AvatarImage
                  src={classTeacher.avatarUrl || swamiAnantVyasPhoto}
                  alt={classTeacher.name}
                  className="object-cover"
                />
                <AvatarFallback className="bg-primary/20 text-primary font-bold text-xl">
                  {classTeacher.name.charAt(0)}
                </AvatarFallback>
              </Avatar>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base sm:text-lg font-black text-foreground tracking-tight">
                    {classTeacher.name}
                  </h3>
                  <Badge className="bg-primary/15 text-primary border-primary/25 text-[10px] sm:text-xs rounded-full font-bold px-2.5">
                    Class Teacher
                  </Badge>
                </div>

                <p className="text-xs font-semibold text-primary/90 mt-0.5">
                  {classTeacher.designation}
                  {classTeacher.department && (
                    <span className="text-muted-foreground font-normal"> • {classTeacher.department}</span>
                  )}
                </p>

                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-1.5 font-medium">
                  <Clock className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span>Consultation: {classTeacher.consultationHours}</span>
                </p>

                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <MapPin className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                  <span>{classTeacher.room}</span>
                </p>
              </div>
            </div>

            {/* Contact Actions */}
            <div className="flex sm:flex-col gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
              <Button
                variant="default"
                size="sm"
                className="rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white h-9 px-4 shadow-sm flex-1 sm:flex-initial"
                onClick={() => window.open(`tel:${cleanPhoneForDial}`)}
              >
                <Phone className="mr-1.5 h-3.5 w-3.5" /> Call ({classTeacher.phone})
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="rounded-xl text-xs font-bold h-9 px-4 border-border/80 flex-1 sm:flex-initial"
                onClick={() =>
                  window.open(
                    `mailto:${classTeacher.email}?subject=Inquiry regarding ${child.name} (Class ${child.category})`
                  )
                }
              >
                <Mail className="mr-1.5 h-3.5 w-3.5" /> Email ({classTeacher.email})
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
              <Badge variant="outline" className="font-mono text-xs rounded-xl py-1.5 px-3 bg-muted/40">
                📞 011-22144321
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
