
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Search, User, UserCheck, UserX, Calendar, MoreVertical, Phone, Filter, ArrowUpDown, Clock, CheckCircle2, XCircle, SortAsc, SortDesc, Trash2, BellRing, X, BrainCircuit } from 'lucide-react';
import NotificationService from './NotificationService';
import ExistingUserContactPopup from './ExistingUserContactPopup';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { fetchUnifiedStudentSnapshot } from '@/utils/attendanceStatsHelper';
import { pickPreferredPhotoCandidate, resolveStudentPhotoUrl } from '@/utils/studentPhotoResolver';
import { CLASSES, SECTIONS } from '@/constants/schoolConfig';
import { parseClassSection, saveTeacherCategories } from '@/utils/teacherAccess';

interface AdminFacesListProps {
  viewMode: 'grid' | 'list';
  selectedFaceId: string | null;
  nameFilter: string;
  setSelectedFaceId: (id: string | null) => void;
}

interface RegisteredFace {
  id: string;
  user_id?: string;
  name: string;
  employee_id: string;
  department: string;
  image_url: string;
  position?: string;
  total_attendance: number;
  last_attendance?: string;
}

type TodayStatus = 'present' | 'late' | 'absent';
type StatusFilter = 'all' | 'present' | 'late' | 'absent';
type SortField = 'name' | 'status' | 'attendance' | 'lastSeen';
type SortDir = 'asc' | 'desc';

const AdminFacesList: React.FC<AdminFacesListProps> = ({ 
  viewMode, 
  selectedFaceId,
  nameFilter,
  setSelectedFaceId
}) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [faces, setFaces] = useState<RegisteredFace[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, number>>({});
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [todayStatuses, setTodayStatuses] = useState<Record<string, { status: TodayStatus; time?: string }>>({});
  const [emotionStatsByStudent, setEmotionStatsByStudent] = useState<Record<string, { label: string; confidence: number; samples: number }>>({});
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<RegisteredFace | null>(null);
  const [teacherCategories, setTeacherCategories] = useState<string[]>([]);
  const [classTeacherCategory, setClassTeacherCategory] = useState<string>('none');
  const [isPromoting, setIsPromoting] = useState(false);

  const extractSection = (department: string): string => {
    if (!department) return '';
    const match = department.match(/Section\s*([A-D])/i);
    return match ? match[1].toUpperCase() : '';
  };

  const extractClass = (department: string): string => {
    if (!department) return '';
    const match = department.match(/(?:Class|Grade)\s*(\d+)/i);
    return match ? match[1] : '';
  };

  // Fetch today's attendance statuses - match by MULTIPLE identifiers
  const fetchTodayStatuses = useCallback(async (faceList: RegisteredFace[]) => {
    try {
      const unified = await fetchUnifiedStudentSnapshot();

      const statusMap: Record<string, { status: TodayStatus; time?: string }> = {};

      // Initialize all as absent
      faceList.forEach(face => {
        statusMap[face.employee_id] = { status: 'absent' };
      });

      faceList.forEach((face) => {
        const candidateKeys = [face.employee_id, face.user_id, face.id].filter(Boolean) as string[];
        const matched = candidateKeys
          .map((key) => unified.statusesByEmployeeId[key])
          .find(Boolean);

        if (!matched) return;

        statusMap[face.employee_id] = {
          status: matched.status,
          time: matched.time ? format(new Date(matched.time), 'hh:mm a') : undefined,
        };
      });

      setTodayStatuses(statusMap);
    } catch (error) {
      console.error('Error fetching today statuses:', error);
    }
  }, []);

  const filteredAndSortedFaces = useMemo(() => {
    let result = faces.filter(face => {
      if (nameFilter !== 'all' && face.id !== nameFilter) return false;

      if (sectionFilter !== 'all') {
        if (extractSection(face.department) !== sectionFilter) return false;
      }

      if (classFilter !== 'all') {
        if (extractClass(face.department) !== classFilter) return false;
      }

      // Status filter
      if (statusFilter !== 'all') {
        const faceStatus = todayStatuses[face.employee_id]?.status || 'absent';
        if (faceStatus !== statusFilter) return false;
      }

      const searchLower = searchTerm.toLowerCase();
      return (
        face.name?.toLowerCase().includes(searchLower) ||
        face.employee_id?.toLowerCase().includes(searchLower) ||
        face.department?.toLowerCase().includes(searchLower)
      );
    });

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'status': {
          const order = { present: 0, late: 1, absent: 2 };
          const sa = todayStatuses[a.employee_id]?.status || 'absent';
          const sb = todayStatuses[b.employee_id]?.status || 'absent';
          cmp = order[sa] - order[sb];
          break;
        }
        case 'attendance':
          cmp = a.total_attendance - b.total_attendance;
          break;
        case 'lastSeen': {
          const da = a.last_attendance ? new Date(a.last_attendance).getTime() : 0;
          const db = b.last_attendance ? new Date(b.last_attendance).getTime() : 0;
          cmp = da - db;
          break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [faces, nameFilter, searchTerm, sectionFilter, classFilter, statusFilter, sortField, sortDir, todayStatuses]);

  // Stats counts
  const statusCounts = useMemo(() => {
    const counts = { present: 0, late: 0, absent: 0 };
    faces.forEach(face => {
      const s = todayStatuses[face.employee_id]?.status || 'absent';
      counts[s]++;
    });
    return counts;
  }, [faces, todayStatuses]);

  const fetchRegisteredFaces = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const { data: registrationRecords, error } = await supabase
        .from('attendance_records')
        .select('id, user_id, device_info, image_url, category')
        .eq('status', 'registered')
        .order('timestamp', { ascending: false });

      if (error) throw error;

      if (registrationRecords) {
        const [{ data: profileRows }, { data: descriptorRows }] = await Promise.all([
          supabase
            .from('profiles')
            .select('user_id, avatar_url')
            .not('avatar_url', 'is', null),
          supabase
            .from('face_descriptors')
            .select('user_id, student_id, image_url')
            .not('image_url', 'is', null),
        ]);

        const profileImageByUserId = new Map<string, string>();
        (profileRows || []).forEach((profile: any) => {
          if (profile?.user_id && profile?.avatar_url && !profileImageByUserId.has(profile.user_id)) {
            profileImageByUserId.set(profile.user_id, profile.avatar_url);
          }
        });

        const descriptorImageByUserId = new Map<string, string>();
        const descriptorImageByStudentKey = new Map<string, string>();
        (descriptorRows || []).forEach((row: any) => {
          const descriptorImg = (row?.image_url || '').toString().trim();
          const descriptorUserId = (row?.user_id || '').toString().trim();
          const descriptorStudentId = (row?.student_id || '').toString().trim();
          if (!descriptorImg) return;
          if (descriptorUserId && !descriptorImageByUserId.has(descriptorUserId)) {
            descriptorImageByUserId.set(descriptorUserId, descriptorImg);
          }
          if (descriptorStudentId && !descriptorImageByStudentKey.has(descriptorStudentId)) {
            descriptorImageByStudentKey.set(descriptorStudentId, descriptorImg);
          }
        });

        // Deduplicate by employee_id first, keeping the most recent registration
        const seenKeys = new Set<string>();
        const processedFaces = registrationRecords
          .map(record => {
            try {
              const di = (record.device_info as any) || {};
              const metadata = di.metadata || {};
              const name = metadata.name || di.name || 'Unknown';
              const employeeId = (metadata.employee_id || di.employee_id || record.student_id || record.id || '').toString().trim();
              const key = employeeId || record.user_id || record.id;
              const canonicalUserId = (record.user_id || '').toString().trim();
              if (!name || name === 'Unknown' || name === 'User') return null;
              if (seenKeys.has(key)) return null;
              seenKeys.add(key);

              const imageCandidate = pickPreferredPhotoCandidate(
                canonicalUserId ? profileImageByUserId.get(canonicalUserId) : '',
                metadata?.face_model?.id_card_photo_url,
                metadata?.id_card_photo_url,
                canonicalUserId ? descriptorImageByUserId.get(canonicalUserId) : '',
                employeeId ? descriptorImageByStudentKey.get(employeeId) : '',
                record.image_url,
                metadata.firebase_image_url,
                metadata.image,
              );

              return {
                id: record.id,
                user_id: record.user_id,
                name,
                employee_id: employeeId,
                department: metadata.department || metadata.class_section || record.category || 'N/A',
                position: metadata.position || 'Student',
                image_url: imageCandidate,
                total_attendance: 0,
                last_attendance: metadata.last_attendance || 'Never'
              } as RegisteredFace;
            } catch {
              return null;
            }
          })
          .filter((face): face is RegisteredFace => face !== null);

        const resolvedFaces = await Promise.all(
          processedFaces.map(async (face) => ({
            ...face,
            image_url: await resolveStudentPhotoUrl(face.image_url),
          }))
        );

        setFaces(resolvedFaces);
        fetchTodayStatuses(resolvedFaces);
        const fetchEmotionStats = async () => {
          const { data: emotionRows } = await supabase
            .from('emotion_events')
            .select('user_id, student_id, emotion_label, confidence_score')
            .order('captured_at', { ascending: false })
            .limit(2000);

          const summary: Record<string, { label: string; confidence: number; samples: number }> = {};

          processedFaces.forEach((face) => {
            const matches = (emotionRows || []).filter((row: any) =>
              (face.user_id && row.user_id === face.user_id) ||
              (row.student_id && [face.employee_id, face.user_id].filter(Boolean).includes(row.student_id)),
            );

            if (!matches.length) {
              summary[face.employee_id] = { label: 'neutral', confidence: 0, samples: 0 };
              return;
            }

            const latest = matches.slice(0, 24);
            const grouped = latest.reduce((acc: Record<string, { count: number; confidenceSum: number }>, row: any) => {
              const key = String(row.emotion_label || 'neutral').toLowerCase();
              if (!acc[key]) acc[key] = { count: 0, confidenceSum: 0 };
              acc[key].count += 1;
              acc[key].confidenceSum += Number(row.confidence_score || 0);
              return acc;
            }, {});

            let dominantLabel = 'neutral';
            let dominant = { count: 0, confidenceSum: 0 };
            for (const [label, stats] of Object.entries(grouped) as [string, { count: number; confidenceSum: number }][]) {
              if (stats.count > dominant.count) {
                dominantLabel = label;
                dominant = stats;
              }
            }
            summary[face.employee_id] = {
              label: dominantLabel,
              confidence: dominant.count ? Math.round((dominant.confidenceSum / dominant.count) * 100) : 0,
              samples: latest.length,
            };
          });

          setEmotionStatsByStudent(summary);
        };

        fetchEmotionStats();
        
        if (selectedFaceId && !processedFaces.some(face => face.id === selectedFaceId)) {
          setSelectedFaceId(null);
        }

        const uniqueEmployeeIds = [...new Set(processedFaces.map(face => face.employee_id))];
        Promise.all(
          uniqueEmployeeIds.map(employeeId => fetchAttendanceCount(String(employeeId)))
        ).catch(error => {
          console.error('Error fetching attendance counts:', error);
        });
      }
    } catch (error) {
      console.error('Error fetching registered faces:', error);
      toast({
        title: "Error",
        description: "Failed to load registered faces",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, selectedFaceId, setSelectedFaceId, fetchTodayStatuses]);

  useEffect(() => {
    fetchRegisteredFaces();

    let updateTimeout: ReturnType<typeof setTimeout>;
    
    const attendanceChannel = supabase
      .channel('attendance-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'attendance_records' }, 
        () => {
          clearTimeout(updateTimeout);
          updateTimeout = setTimeout(() => {
            fetchRegisteredFaces();
          }, 1000);
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'emotion_events' },
        () => {
          clearTimeout(updateTimeout);
          updateTimeout = setTimeout(() => {
            fetchRegisteredFaces();
          }, 1000);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(updateTimeout);
      supabase.removeChannel(attendanceChannel);
    };
  }, [nameFilter, fetchRegisteredFaces]);

  const fetchAttendanceCount = async (employeeId: string) => {
    try {
      // Query by employee_id in device_info AND by status present/late
      const { data, error } = await supabase
        .from('attendance_records')
        .select('timestamp, status')
        .in('status', ['present', 'late', 'unauthorized'])
        .contains('device_info', { metadata: { employee_id: employeeId } });

      if (error) throw error;

      const uniqueDays = new Set(
        (data || []).map(record => new Date(record.timestamp).toLocaleDateString())
      );
      
      const attendanceCount = uniqueDays.size;

      setAttendanceCounts(prev => ({ ...prev, [employeeId]: attendanceCount }));
      setFaces(prev => prev.map(face => 
        face.employee_id === employeeId ? { ...face, total_attendance: attendanceCount } : face
      ));
    } catch (error) {
      console.error(`Error fetching attendance count for ${employeeId}:`, error);
    }
  };

  const handleDeleteFace = async (id: string) => {
    if (!confirm("Are you sure you want to delete this registered face?")) return;
    
    try {
      // IMPORTANT SAFETY FIX:
      // Delete ONLY the selected registration row.
      // Multiple students can share user_id in legacy data, so user_id-based deletes can remove many students.
      const { error: recErr } = await supabase.from('attendance_records').delete().eq('id', id);
      if (recErr) throw recErr;

      toast({ title: "Success", description: "Selected student removed" });
      if (id === selectedFaceId) setSelectedFaceId(null);
      await fetchRegisteredFaces();
    } catch (error) {
      console.error('Error deleting face:', error);
      toast({ title: "Error", description: "Failed to delete face data", variant: "destructive" });
    }
  };

  const openPromoteDialog = (face: RegisteredFace) => {
    setSelectedTeacher(face);
    const inferred = face.department.match(/(\d+)\s*[-\s]\s*([A-D])/i);
    const inferredCategory = inferred ? `${inferred[1]}-${inferred[2].toUpperCase()}` : null;
    setTeacherCategories(inferredCategory ? [inferredCategory] : []);
    setClassTeacherCategory('none');
    setPromoteOpen(true);
  };

  const toggleTeacherCategory = (category: string) => {
    setTeacherCategories(prev => prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]);
  };

  const handlePromoteTeacher = async () => {
    if (!selectedTeacher) return;
    if (!selectedTeacher.user_id) {
      toast({ title: 'Missing linked account', description: 'This student has no user account linked yet.', variant: 'destructive' });
      return;
    }

    setIsPromoting(true);
    try {
      await supabase.from('attendance_records').update({ category: 'Teacher' }).eq('id', selectedTeacher.id);
      await saveTeacherCategories(selectedTeacher.user_id, teacherCategories);

      if (classTeacherCategory !== 'none') {
        const parsed = parseClassSection(classTeacherCategory);
        if (parsed) {
          await supabase
            .from('class_teachers')
            .delete()
            .eq('class', parsed.className)
            .eq('section', parsed.section);

          await supabase.from('class_teachers').insert({
            class: parsed.className,
            section: parsed.section,
            teacher_id: selectedTeacher.user_id,
            teacher_name: selectedTeacher.name,
          });
        }
      }

      toast({ title: 'Teacher updated', description: `${selectedTeacher.name} can now use teacher timetable and substitution features.` });
      setPromoteOpen(false);
      await fetchRegisteredFaces();
    } catch (error: any) {
      toast({ title: 'Failed to update teacher access', description: error?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setIsPromoting(false);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const getStatusBadge = (employeeId: string) => {
    const info = todayStatuses[employeeId];
    const status = info?.status || 'absent';
    
    switch (status) {
      case 'present':
        return (
          <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30 gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Present
            {info?.time && <span className="text-[10px] opacity-75 ml-0.5">{info.time}</span>}
          </Badge>
        );
      case 'late':
        return (
          <Badge className="bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30 gap-1">
            <Clock className="w-3 h-3" />
            Late
            {info?.time && <span className="text-[10px] opacity-75 ml-0.5">{info.time}</span>}
          </Badge>
        );
      case 'absent':
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 gap-1">
            <XCircle className="w-3 h-3" />
            Absent
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-2xl" />)}
        </div>
        <Skeleton className="h-10 rounded-xl" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const totalStudents = faces.length;
  const attendanceRate = totalStudents > 0 
    ? Math.round(((statusCounts.present + statusCounts.late) / totalStudents) * 100)
    : 0;

  const hasActiveFilters = statusFilter !== 'all' || sectionFilter !== 'all' || classFilter !== 'all' || searchTerm.trim() !== '';

  return (
    <>
      <ExistingUserContactPopup />
      <div className="space-y-4">

        {/* ── Status Pills ── */}
        <div className="flex gap-2">
          {([
            { key: 'present' as StatusFilter, count: statusCounts.present, icon: CheckCircle2, label: 'Present', activeClass: 'bg-green-500/15 border-green-500/40 text-green-700 dark:text-green-400', dotClass: 'bg-green-500' },
            { key: 'late' as StatusFilter, count: statusCounts.late, icon: Clock, label: 'Late', activeClass: 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400', dotClass: 'bg-amber-500' },
            { key: 'absent' as StatusFilter, count: statusCounts.absent, icon: XCircle, label: 'Absent', activeClass: 'bg-red-500/15 border-red-500/40 text-red-700 dark:text-red-400', dotClass: 'bg-red-500' },
          ]).map(item => (
            <motion.button
              key={item.key}
              whileTap={{ scale: 0.96 }}
              onClick={() => setStatusFilter(statusFilter === item.key ? 'all' : item.key)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 px-2 rounded-2xl border-2 transition-all duration-200 font-medium",
                statusFilter === item.key
                  ? item.activeClass
                  : "bg-card border-border hover:border-muted-foreground/20 text-foreground"
              )}
            >
              <span className={cn("w-2 h-2 rounded-full", item.dotClass)} />
              <span className="text-xl font-bold tabular-nums">{item.count}</span>
              <span className="text-xs opacity-70 hidden sm:inline">{item.label}</span>
            </motion.button>
          ))}
        </div>

        {/* ── Attendance rate bar ── */}
        <div className="relative h-2 rounded-full bg-muted overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-green-500 to-emerald-400"
            initial={{ width: 0 }}
            animate={{ width: `${attendanceRate}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
          <span className="absolute right-0 -top-5 text-[10px] font-medium text-muted-foreground">
            {attendanceRate}% attendance
          </span>
        </div>

        {/* ── Search + Compact Filters ── */}
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search students..."
              className="pl-9 h-10 rounded-xl bg-muted/40 border-0 focus-visible:ring-1"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <Select value={sectionFilter} onValueChange={setSectionFilter}>
              <SelectTrigger className="w-auto min-w-[100px] h-8 text-xs rounded-lg border-dashed">
                <SelectValue placeholder="Section" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sections</SelectItem>
                {['A','B','C','D'].map(s => (
                  <SelectItem key={s} value={s}>Section {s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-auto min-w-[100px] h-8 text-xs rounded-lg border-dashed">
                <SelectValue placeholder="Class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(g => (
                  <SelectItem key={g} value={String(g)}>Class {g}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg border-dashed gap-1">
                  <ArrowUpDown className="h-3 w-3" />
                  Sort
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-xs">Sort By</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {[
                  { field: 'name' as SortField, label: 'Name' },
                  { field: 'status' as SortField, label: 'Status' },
                  { field: 'attendance' as SortField, label: 'Attendance' },
                  { field: 'lastSeen' as SortField, label: 'Last Seen' },
                ].map(item => (
                  <DropdownMenuItem key={item.field} onClick={() => toggleSort(item.field)} className="text-xs gap-2">
                    {sortField === item.field ? (sortDir === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-8 text-xs rounded-lg gap-1 text-muted-foreground" onClick={() => { setStatusFilter('all'); setSectionFilter('all'); setClassFilter('all'); setSearchTerm(''); }}>
                <X className="h-3 w-3" /> Clear
              </Button>
            )}
          </div>
        </div>

        {/* ── Face List ── */}
        <div className="space-y-1.5">
          {filteredAndSortedFaces.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
              <UserX className="mx-auto h-10 w-10 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No students found</p>
            </motion.div>
          ) : (
            filteredAndSortedFaces.map((face, index) => (
              <motion.div
                key={`${face.employee_id}-${face.user_id || face.id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                layout="position"
              >
                  <Card
                    className={cn(
                      "cursor-pointer transition-all duration-200 active:scale-[0.98] sm:hover:shadow-md overflow-hidden",
                      selectedFaceId === face.id
                        ? "ring-2 ring-primary shadow-md"
                        : "hover:bg-accent/50"
                    )}
                    onClick={() => setSelectedFaceId(face.id === selectedFaceId ? null : face.id)}
                  >
                    <CardContent className="p-2.5 sm:p-3">
                      <div className="flex items-center gap-2.5 sm:gap-3">
                        <div className="relative shrink-0">
                          <Avatar className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl border border-border">
                            <AvatarImage src={face.image_url} alt={face.name} className="object-cover" />
                            <AvatarFallback className="rounded-xl text-sm font-bold bg-muted">
                              {face.name?.charAt(0) || '?'}
                            </AvatarFallback>
                          </Avatar>
                          {/* Status dot */}
                          <span className={cn(
                            "absolute -bottom-0.5 -right-0.5 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full border-2 border-card",
                            todayStatuses[face.employee_id]?.status === 'present' ? 'bg-green-500' :
                            todayStatuses[face.employee_id]?.status === 'late' ? 'bg-amber-500' :
                            'bg-red-400'
                          )} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{face.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">{face.employee_id}</span>
                            {face.department !== 'N/A' && (
                              <span className="text-[10px] text-muted-foreground truncate">· {face.department}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant="outline" className="hidden md:inline-flex gap-1 text-[10px]">
                            <BrainCircuit className="w-3 h-3" />
                            {emotionStatsByStudent[face.employee_id]?.label?.replace('-', ' ') || 'neutral'}
                          </Badge>
                          {getStatusBadge(face.employee_id)}
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={e => e.stopPropagation()}>
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedFaceId(face.id); }} className="text-xs gap-2">
                                <Calendar className="h-3 w-3" /> View Calendar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openPromoteDialog(face); }} className="text-xs gap-2">
                                <UserCheck className="h-3 w-3" /> Make Teacher
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDeleteFace(face.id); }} className="text-xs text-destructive gap-2">
                                <Trash2 className="h-3 w-3" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
              </motion.div>
            ))
          )}
        </div>

        <p className="text-[10px] text-muted-foreground text-center pt-2">
          {filteredAndSortedFaces.length} of {totalStudents} students
        </p>
      </div>

      <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Make Teacher — {selectedTeacher?.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm">Class access permissions</Label>
              <div className="max-h-52 overflow-y-auto space-y-2 mt-2">
                {CLASSES.map(cls => {
                  const classCats = SECTIONS.map(sec => `${cls}-${sec}`);
                  return (
                    <div key={cls} className="border rounded-md p-2">
                      <p className="text-xs font-medium mb-1">Class {cls}</p>
                      <div className="grid grid-cols-4 gap-2">
                        {classCats.map(cat => {
                          const checked = teacherCategories.includes(cat);
                          return (
                            <label key={cat} className={cn('flex items-center gap-1 text-xs rounded px-1.5 py-1 cursor-pointer', checked ? 'bg-primary/10 text-primary' : 'hover:bg-muted')}>
                              <Checkbox checked={checked} onCheckedChange={() => toggleTeacherCategory(cat)} />
                              <span>{cat.split('-')[1]}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="text-sm">Class teacher assignment (optional)</Label>
              <Select value={classTeacherCategory} onValueChange={setClassTeacherCategory}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Assign as class teacher" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No class teacher assignment</SelectItem>
                  {CLASSES.flatMap(cls => SECTIONS.map(sec => `${cls}-${sec}`)).map(cat => (
                    <SelectItem key={cat} value={cat}>Class {cat.split('-')[0]} - {cat.split('-')[1]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPromoteOpen(false)}>Cancel</Button>
              <Button onClick={handlePromoteTeacher} disabled={isPromoting || !selectedTeacher?.user_id}>
                {isPromoting ? 'Saving...' : 'Save Teacher Access'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminFacesList;
