import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  Users, 
  ShieldCheck, 
  UserCog,
  Edit,
  Loader2,
  ArrowLeftRight,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Plus,
  RefreshCw,
  Trash2,
  Copy,
  BookOpen,
  GraduationCap,
  Sliders,
  Search,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CLASSES, SECTIONS, ALL_CLASS_SECTIONS } from '@/constants/schoolConfig';
import {
  fetchTeacherCategories,
  saveTeacherCategories,
  fetchTeacherPermissions,
  fetchClassTeacherMatrix,
  assignClassTeacher,
  unassignClassTeacher,
  swapClassTeacherAssignments,
  calculateAutoAllocationPlan,
  type TeacherPermissions,
  type ClassMatrixSlot,
  DEFAULT_TEACHER_PERMISSIONS,
} from '@/utils/teacherAccess';
import { motion } from 'framer-motion';

type Role = 'user' | 'principal' | 'admin' | 'teacher' | 'student' | 'staff' | string;

interface RegisteredUser {
  id: string;
  user_id: string;
  name: string;
  email: string;
  avatar_url: string;
  role: Role;
  isTeacher: boolean;
  teacherCategories: string[];
  permissions: TeacherPermissions;
  lastSignIn?: string | null;
  signedUpAt?: string | null;
}

const ROLE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  admin: { label: 'Admin', icon: Users, color: 'text-yellow-600 bg-yellow-500/10' },
  principal: { label: 'Principal', icon: ShieldCheck, color: 'text-purple-600 bg-purple-500/10' },
  teacher: { label: 'Teacher', icon: GraduationCap, color: 'text-blue-600 bg-blue-500/10' },
  student: { label: 'Student', icon: Users, color: 'text-emerald-600 bg-emerald-500/10' },
  staff: { label: 'Staff', icon: Users, color: 'text-amber-600 bg-amber-500/10' },
  user: { label: 'User', icon: Users, color: 'text-muted-foreground bg-muted' },
};

const getRoleConfig = (role?: string | null) => {
  const normalized = (role || 'user').toLowerCase();
  return ROLE_CONFIG[normalized] || ROLE_CONFIG.user;
};

const UserAccessManager: React.FC = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [matrix, setMatrix] = useState<ClassMatrixSlot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'matrix' | 'teachers' | 'users' | 'create'>('matrix');

  const [searchQuery, setSearchQuery] = useState('');
  const [wingFilter, setWingFilter] = useState<'all' | 'Middle' | 'Secondary' | 'Senior Secondary'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'vacant' | 'assigned'>('all');

  const [selectedUser, setSelectedUser] = useState<RegisteredUser | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editRole, setEditRole] = useState<Role>('user');
  const [editCategories, setEditCategories] = useState<string[]>([]);
  const [editPermissions, setEditPermissions] = useState<TeacherPermissions>(DEFAULT_TEACHER_PERMISSIONS);
  const [isSavingUser, setIsSavingUser] = useState(false);

  const [assignSlot, setAssignSlot] = useState<ClassMatrixSlot | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState(false);

  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [swapClassA, setSwapClassA] = useState<string>('6-A');
  const [swapClassB, setSwapClassB] = useState<string>('7-A');
  const [isSwapping, setIsSwapping] = useState(false);

  const [autoAllocModalOpen, setAutoAllocModalOpen] = useState(false);
  const [autoAllocPlan, setAutoAllocPlan] = useState<Array<{ slot: ClassMatrixSlot; teacher: { id: string; name: string; email?: string } }>>([]);
  const [isApplyingAlloc, setIsApplyingAlloc] = useState(false);

  const [tEmail, setTEmail] = useState('');
  const [tPass, setTPass] = useState('');
  const [tName, setTName] = useState('');
  const [tClass, setTClass] = useState<string>(String(CLASSES[0] ?? '6'));
  const [tSection, setTSection] = useState<string>(String(SECTIONS[0] ?? 'A'));
  const [tCreating, setTCreating] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; pass: string; class: string } | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const matrixData = await fetchClassTeacherMatrix();
      setMatrix(matrixData);

      const { data: authUsers, error: authError } = await supabase.rpc('get_all_auth_users');
      if (authError) throw authError;

      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('id, user_id, display_name, avatar_url, parent_email, username'),
        supabase.from('user_roles').select('user_id, role'),
      ]);

      const profileMap = new Map((profilesRes.data || []).map((p) => [p.user_id, p]));
      const roleMap = new Map((rolesRes.data || []).map((r) => [r.user_id, r.role]));

      const processedUsers: RegisteredUser[] = [];
      for (const au of authUsers || []) {
        const userId = au.user_id;
        if (!userId) continue;

        const profile: any = profileMap.get(userId) || {};
        const assignedRole = roleMap.get(userId) as Role | undefined;
        const categories = await fetchTeacherCategories(userId);
        const perms = await fetchTeacherPermissions(userId);
        const hasTeacherPerms = categories.length > 0;
        const computedRole = assignedRole || (hasTeacherPerms ? 'teacher' : 'user');

        processedUsers.push({
          id: profile.id || userId,
          user_id: userId,
          name: profile.display_name || profile.username || (au.email ? au.email.split('@')[0] : 'Unnamed User'),
          email: au.email || profile.parent_email || profile.username || '',
          avatar_url: profile.avatar_url || '',
          role: computedRole,
          isTeacher: hasTeacherPerms || computedRole === 'teacher',
          teacherCategories: categories,
          permissions: perms,
          lastSignIn: au.last_sign_in_at,
          signedUpAt: au.created_at,
        });
      }
      setUsers(processedUsers);
    } catch (error: any) {
      console.error(error);
      toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel('access-command-center')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_teachers' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  const teachersList = useMemo(() => users.filter((u) => u.role === 'teacher' || u.isTeacher), [users]);

  const filteredMatrix = useMemo(() => matrix.filter((slot) => {
    if (wingFilter !== 'all' && slot.wing !== wingFilter) return false;
    if (statusFilter === 'vacant' && slot.isAssigned) return false;
    if (statusFilter === 'assigned' && !slot.isAssigned) return false;
    return true;
  }), [matrix, wingFilter, statusFilter]);

  const openUserEdit = (user: RegisteredUser) => {
    setSelectedUser(user);
    setEditRole(user.role);
    setEditCategories(user.teacherCategories);
    setEditPermissions(user.permissions);
    setEditDialogOpen(true);
  };

  const toggleEditCategory = (cat: string) => setEditCategories((prev) => prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]);

  const toggleAllForClass = (cls: number) => {
    const classCats = SECTIONS.map((s) => `${cls}-${s}`);
    const allSelected = classCats.every((c) => editCategories.includes(c));
    setEditCategories((prev) => allSelected ? prev.filter((c) => !classCats.includes(c)) : [...new Set([...prev, ...classCats])]);
  };

  const handleSaveUser = async () => {
    if (!selectedUser) return;
    setIsSavingUser(true);
    try {
      await supabase.from('user_roles').delete().eq('user_id', selectedUser.user_id);
      await supabase.from('user_roles').insert({ user_id: selectedUser.user_id, role: editRole });
      await saveTeacherCategories(selectedUser.user_id, editCategories, editPermissions);
      toast({ title: 'Success', description: 'Access updated' });
      setEditDialogOpen(false);
      loadData();
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    finally { setIsSavingUser(false); }
  };

  const handleCreateTeacher = async () => {
    setTCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-teacher', {
        body: { email: tEmail, password: tPass, name: tName, classes: [`${tClass}-${tSection}`] },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error);
      setCreatedCredentials({ email: tEmail, pass: tPass, class: `${tClass}-${tSection}` });
      loadData();
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    finally { setTCreating(false); }
  };

  if (isLoading) return <div className="p-10 space-y-4"><Skeleton className="h-10 w-full" />{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  return (
    <div className="space-y-6">
      {/* Top Command Bar & Statistics */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-3xl border border-primary/20 bg-card/60 backdrop-blur-xl shadow-lg">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>
              Teacher Access & Class Assignment
            </h2>
            <p className="text-xs text-muted-foreground font-medium">
              Enterprise Role Management & Real-time Class-Section Allocations
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSwapModalOpen(true)}
            className="h-9 rounded-xl font-bold gap-1.5 border-border/70 hover:border-primary/50"
          >
            <ArrowLeftRight className="h-3.5 w-3.5 text-primary" />
            <span>Swap Classes</span>
          </Button>

          <Button
            size="sm"
            onClick={handlePreviewAutoAllocation}
            className="h-9 rounded-xl font-bold gap-1.5 bg-gradient-to-r from-primary to-emerald-600 text-white shadow-md shadow-primary/20 hover:opacity-95"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Auto-Allocate</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={loadData}
            className="h-9 w-9 p-0 rounded-xl"
            title="Refresh access records"
          >
            <RefreshCw className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </Button>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <Card className="rounded-2xl border bg-card/50 backdrop-blur p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-semibold">Total Classes</span>
            <BookOpen className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-black text-foreground">{matrix.length}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Classes 6 to 12 · Sections A-D</p>
        </Card>

        <Card className="rounded-2xl border bg-card/50 backdrop-blur p-4 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-1">
            <span className="text-xs font-semibold">Assigned</span>
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{matrix.filter(m => m.isAssigned).length}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Active Class In-charges</p>
        </Card>

        <Card className={`rounded-2xl border p-4 shadow-xs ${matrix.filter(m => !m.isAssigned).length > 0 ? 'border-amber-400/40 bg-amber-500/5' : 'bg-card/50'}`}>
          <div className="flex items-center justify-between text-amber-500 mb-1">
            <span className="text-xs font-semibold">Vacant Slots</span>
            <AlertTriangle className="h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-amber-500">{matrix.filter(m => !m.isAssigned).length}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{matrix.filter(m => !m.isAssigned).length > 0 ? 'Requires Teacher Allocation' : 'All Classes Assigned'}</p>
        </Card>

        <Card className="rounded-2xl border bg-card/50 backdrop-blur p-4 shadow-xs">
          <div className="flex items-center justify-between text-blue-500 mb-1">
            <span className="text-xs font-semibold">Faculty Teachers</span>
            <GraduationCap className="h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-blue-500">{teachersList.length}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{users.length} Total Registered Users</p>
        </Card>
      </div>

      {/* Main Tabs Container */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-5">
        <TabsList className="bg-muted/40 p-1 rounded-2xl border flex-wrap">
          <TabsTrigger value="matrix" className="rounded-xl font-bold text-xs gap-1.5">
            <BookOpen className="h-3.5 w-3.5" /> Class Assignment Matrix ({matrix.length})
          </TabsTrigger>
          <TabsTrigger value="teachers" className="rounded-xl font-bold text-xs gap-1.5">
            <GraduationCap className="h-3.5 w-3.5" /> Teacher Directory & Permissions ({teachersList.length})
          </TabsTrigger>
          <TabsTrigger value="users" className="rounded-xl font-bold text-xs gap-1.5">
            <Users className="h-3.5 w-3.5" /> All System Roles ({users.length})
          </TabsTrigger>
          <TabsTrigger value="create" className="rounded-xl font-bold text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Provision Teacher
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: CLASS ASSIGNMENT MATRIX */}
        <TabsContent value="matrix" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border bg-card/40">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search class or teacher..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs rounded-xl"
                />
              </div>

              <Select value={wingFilter} onValueChange={(v) => setWingFilter(v as any)}>
                <SelectTrigger className="h-8 w-[140px] text-xs rounded-xl">
                  <SelectValue placeholder="Wing" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Wings</SelectItem>
                  <SelectItem value="Middle">Middle (6-8)</SelectItem>
                  <SelectItem value="Secondary">Secondary (9-10)</SelectItem>
                  <SelectItem value="Senior Secondary">Senior Sec (11-12)</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="h-8 w-[130px] text-xs rounded-xl">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="assigned">Assigned Only</SelectItem>
                  <SelectItem value="vacant">Vacant Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="text-xs text-muted-foreground font-semibold">
              Showing {filteredMatrix.length} Classes
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
            {filteredMatrix.map((slot) => {
              const isAssigned = slot.isAssigned && slot.primaryTeacher;
              return (
                <motion.div
                  key={slot.category}
                  layout
                  className={`group relative rounded-2xl border p-4 backdrop-blur-md transition-all flex flex-col justify-between ${
                    isAssigned
                      ? 'border-border/70 bg-card/70 hover:border-primary/50 hover:shadow-md'
                      : 'border-amber-400/50 bg-amber-500/5 hover:border-amber-400 hover:shadow-md'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary font-mono font-extrabold text-sm border border-primary/20">
                          {slot.category}
                        </span>
                        <div>
                          <p className="text-xs font-extrabold text-foreground">Class {slot.class}</p>
                          <p className="text-[10px] text-muted-foreground">Section {slot.section}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[9px] px-2 py-0.5 rounded-md font-semibold">
                        {slot.wing}
                      </Badge>
                    </div>

                    {isAssigned ? (
                      <div className="p-2.5 rounded-xl bg-muted/40 border border-border/40 space-y-1">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6 rounded-lg border">
                            <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                              {slot.primaryTeacher?.teacher_name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-foreground truncate">
                              {slot.primaryTeacher?.teacher_name}
                            </p>
                            {slot.primaryTeacher?.teacher_email && (
                              <p className="text-[10px] text-muted-foreground truncate">
                                {slot.primaryTeacher.teacher_email}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="pt-1 flex items-center justify-between">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Class Teacher
                          </span>
                          {slot.coTeachers.length > 0 && (
                            <span className="text-[9px] text-muted-foreground font-semibold">
                              +{slot.coTeachers.length} Co-Teachers
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-xl border border-dashed border-amber-400/60 bg-amber-500/10 text-center space-y-1">
                        <p className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Vacant Class
                        </p>
                        <p className="text-[10px] text-muted-foreground">No Class Teacher Assigned</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAssignSlot(slot);
                        setSelectedTeacherId(slot.primaryTeacher?.teacher_id || '');
                      }}
                      className="h-7 px-2.5 text-[11px] font-semibold rounded-lg flex-1 gap-1"
                    >
                      <UserCog className="h-3 w-3" />
                      <span>{isAssigned ? 'Reassign' : 'Assign'}</span>
                    </Button>

                    {isAssigned && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleUnassignSlot(slot)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive rounded-lg"
                        title="Unassign this class"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </TabsContent>

        {/* TAB 2: TEACHER DIRECTORY & PERMISSIONS */}
        <TabsContent value="teachers" className="space-y-4">
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {teachersList.map((teacher) => {
              const roleConfig = getRoleConfig(teacher.role);
              const RoleIcon = roleConfig.icon;
              return (
                <Card key={teacher.id} className="rounded-2xl border bg-card/60 backdrop-blur p-4 shadow-sm hover:border-primary/40 transition">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-11 w-11 rounded-2xl border border-border/80 shadow-xs">
                        {teacher.avatar_url ? <AvatarImage src={teacher.avatar_url} /> : null}
                        <AvatarFallback className="font-bold text-sm bg-primary/10 text-primary">
                          {teacher.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{teacher.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{teacher.email}</p>
                      </div>
                    </div>
                    <Badge className={`${roleConfig.color} shrink-0 text-[10px] font-bold`}>
                      <RoleIcon className="h-3 w-3 mr-1" />
                      {roleConfig.label}
                    </Badge>
                  </div>

                  <div className="space-y-1 mb-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Assigned Classes</p>
                    <div className="flex flex-wrap gap-1">
                      {teacher.teacherCategories.length > 0 ? (
                        teacher.teacherCategories.map((c) => (
                          <span key={c} className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-mono font-bold text-primary">
                            {c}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No classes currently assigned</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active Capabilities</p>
                    <div className="flex flex-wrap gap-1 text-[9px] font-medium text-muted-foreground">
                      {teacher.permissions.can_take_attendance && <Badge variant="outline">Attendance</Badge>}
                      {teacher.permissions.can_edit_timetable && <Badge variant="outline">Timetable</Badge>}
                      {teacher.permissions.can_export_reports && <Badge variant="outline">Reports</Badge>}
                      {teacher.permissions.can_manage_students && <Badge variant="outline">Students</Badge>}
                      {teacher.permissions.can_send_notifications && <Badge variant="outline">Alerts</Badge>}
                      {teacher.permissions.can_view_analytics && <Badge variant="outline">Analytics</Badge>}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openUserEdit(teacher)}
                    className="w-full h-8 text-xs font-bold rounded-xl gap-1.5"
                  >
                    <Sliders className="h-3.5 w-3.5" /> Configure Permissions & Classes
                  </Button>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* TAB 3: ALL SYSTEM ROLES */}
        <TabsContent value="users" className="space-y-4">
          <Card className="rounded-2xl border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold">System Users & Roles</CardTitle>
                  <CardDescription>Full audit list of authenticated accounts</CardDescription>
                </div>
                <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as any)}>
                  <SelectTrigger className="h-8 w-[140px] text-xs rounded-xl">
                    <SelectValue placeholder="Role Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="admin">Admins</SelectItem>
                    <SelectItem value="principal">Principals</SelectItem>
                    <SelectItem value="teacher">Teachers</SelectItem>
                    <SelectItem value="user">Users</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {users.map((user) => {
                  const roleConfig = getRoleConfig(user.role);
                  const RoleIcon = roleConfig.icon;
                  return (
                    <div key={user.id} className="flex items-center justify-between p-3 rounded-xl border bg-card/50 hover:bg-card/80 transition">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-9 w-9 rounded-xl border">
                          {user.avatar_url ? <AvatarImage src={user.avatar_url} /> : null}
                          <AvatarFallback className="font-bold text-xs">
                            {user.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">{user.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge className={`${roleConfig.color} text-[10px] font-bold`}>
                          <RoleIcon className="h-3 w-3 mr-1" />
                          {roleConfig.label}
                        </Badge>
                        <Button size="sm" variant="ghost" onClick={() => openUserEdit(user)} className="h-7 px-2 text-xs rounded-lg">
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: PROVISION TEACHER */}
        <TabsContent value="create" className="space-y-4">
          <Card className="rounded-2xl border shadow-sm max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-primary" /> Provision New Teacher Account
              </CardTitle>
              <CardDescription>
                Automatically creates login credentials, registers teacher role, and binds class in-charge permissions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold text-foreground">Teacher Email *</label>
                  <Input
                    placeholder="teacher@school.com"
                    value={tEmail}
                    onChange={(e) => setTEmail(e.target.value)}
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground">Initial Password *</label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={tPass}
                    onChange={(e) => setTPass(e.target.value)}
                    className="mt-1 text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-foreground">Display Name / Full Name</label>
                  <Input
                    placeholder="e.g. Mrs. Sharma (PGT Mathematics)"
                    value={tName}
                    onChange={(e) => setTName(e.target.value)}
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground">Initial Class</label>
                  <Select value={tClass} onValueChange={setTClass}>
                    <SelectTrigger className="mt-1 text-xs">
                      <SelectValue placeholder="Class" />
                    </SelectTrigger>
                    <SelectContent>
                      {CLASSES.map((c) => (
                        <SelectItem key={String(c)} value={String(c)}>
                          Class {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground">Section</label>
                  <Select value={tSection} onValueChange={setTSection}>
                    <SelectTrigger className="mt-1 text-xs">
                      <SelectValue placeholder="Section" />
                    </SelectTrigger>
                    <SelectContent>
                      {SECTIONS.map((s) => (
                        <SelectItem key={String(s)} value={String(s)}>
                          Section {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {createdCredentials && (
                <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-2">
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> Account Successfully Created!
                  </p>
                  <div className="text-xs font-mono text-foreground space-y-0.5">
                    <p>Email: {createdCredentials.email}</p>
                    <p>Password: {createdCredentials.pass}</p>
                    <p>Assigned: Class {createdCredentials.class}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs rounded-lg gap-1"
                    onClick={() => {
                      navigator.clipboard.writeText(`Email: ${createdCredentials.email}\nPassword: ${createdCredentials.pass}\nClass: ${createdCredentials.class}`);
                      toast({ title: 'Credentials copied to clipboard' });
                    }}
                  >
                    <Copy className="h-3 w-3" /> Copy Credentials
                  </Button>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button onClick={handleCreateTeacher} disabled={tCreating} className="rounded-xl font-bold gap-2">
                  {tCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Provision Account
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* DIALOG 1: SINGLE CLASS ASSIGNMENT */}
      <Dialog open={!!assignSlot} onOpenChange={(open) => !open && setAssignSlot(null)}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold flex items-center gap-2">
              <UserCog className="h-5 w-5 text-primary" /> Assign Class Teacher
            </DialogTitle>
            <DialogDescription>
              Select teacher for Class {assignSlot?.category} ({assignSlot?.wing} Wing)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-bold text-foreground">Select Faculty Teacher</label>
              <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Choose a teacher..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {teachersList.map((t) => (
                    <SelectItem key={t.user_id} value={t.user_id}>
                      {t.name} ({t.teacherCategories.length} classes currently)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignSlot(null)} className="rounded-xl">
              Cancel
            </Button>
            <Button onClick={handleAssignTeacherToSlot} disabled={!selectedTeacherId || isAssigning} className="rounded-xl font-bold">
              {isAssigning ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Assignment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG 2: SWAP CLASS ASSIGNMENTS */}
      <Dialog open={swapModalOpen} onOpenChange={setSwapModalOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-primary" /> Swap Class Teacher Assignments
            </DialogTitle>
            <DialogDescription>
              Atomically swap teacher assignments between two classes.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-3">
            <div>
              <label className="text-xs font-bold">Class A</label>
              <Select value={swapClassA} onValueChange={setSwapClassA}>
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Class A" />
                </SelectTrigger>
                <SelectContent className="max-h-52">
                  {ALL_CLASS_SECTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      Class {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-bold">Class B</label>
              <Select value={swapClassB} onValueChange={setSwapClassB}>
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Class B" />
                </SelectTrigger>
                <SelectContent className="max-h-52">
                  {ALL_CLASS_SECTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      Class {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSwapModalOpen(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button onClick={handleExecuteSwap} disabled={isSwapping || swapClassA === swapClassB} className="rounded-xl font-bold">
              {isSwapping ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Execute Swap'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG 3: SMART AUTO-ALLOCATION PREVIEW */}
      <Dialog open={autoAllocModalOpen} onOpenChange={setAutoAllocModalOpen}>
        <DialogContent className="max-w-lg rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Smart Workload Auto-Allocation
            </DialogTitle>
            <DialogDescription>
              Calculated workload-balanced plan for {autoAllocPlan.length} vacant classes.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-64 overflow-y-auto space-y-2 py-2">
            {autoAllocPlan.map((item) => (
              <div key={item.slot.category} className="flex items-center justify-between p-2.5 rounded-xl border bg-card/60 text-xs">
                <span className="font-mono font-bold text-primary">Class {item.slot.category}</span>
                <span className="text-muted-foreground font-semibold">➔ {item.teacher.name}</span>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAutoAllocModalOpen(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button onClick={handleApplyAutoAllocation} disabled={isApplyingAlloc} className="rounded-xl font-bold bg-primary text-white">
              {isApplyingAlloc ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply All Assignments'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG 4: CONFIGURE PERMISSIONS & CLASSES DRAWER */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-xl rounded-3xl p-6 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold flex items-center gap-2">
              <Sliders className="h-5 w-5 text-primary" /> Configure User Access & Permissions
            </DialogTitle>
            <DialogDescription>
              Customizing role, class access, and granular capabilities for {selectedUser?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div>
              <label className="text-xs font-bold text-foreground">Assigned Role</label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as Role)}>
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin (Full Control)</SelectItem>
                  <SelectItem value="principal">Principal (School Oversight)</SelectItem>
                  <SelectItem value="teacher">Teacher (Class & Attendance Access)</SelectItem>
                  <SelectItem value="staff">Staff (Gate & Operations)</SelectItem>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="user">Standard User</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 p-3.5 rounded-2xl border bg-card/40">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Granular Permissions
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="flex items-center justify-between p-2 rounded-xl border bg-card/60 cursor-pointer">
                  <span>Take Attendance</span>
                  <Switch
                    checked={editPermissions.can_take_attendance}
                    onCheckedChange={(c) => setEditPermissions((p) => ({ ...p, can_take_attendance: c }))}
                  />
                </label>

                <label className="flex items-center justify-between p-2 rounded-xl border bg-card/60 cursor-pointer">
                  <span>Edit Timetable & Substitutions</span>
                  <Switch
                    checked={editPermissions.can_edit_timetable}
                    onCheckedChange={(c) => setEditPermissions((p) => ({ ...p, can_edit_timetable: c }))}
                  />
                </label>

                <label className="flex items-center justify-between p-2 rounded-xl border bg-card/60 cursor-pointer">
                  <span>Export Reports & Registers</span>
                  <Switch
                    checked={editPermissions.can_export_reports}
                    onCheckedChange={(c) => setEditPermissions((p) => ({ ...p, can_export_reports: c }))}
                  />
                </label>

                <label className="flex items-center justify-between p-2 rounded-xl border bg-card/60 cursor-pointer">
                  <span>Manage Student Records</span>
                  <Switch
                    checked={editPermissions.can_manage_students}
                    onCheckedChange={(c) => setEditPermissions((p) => ({ ...p, can_manage_students: c }))}
                  />
                </label>

                <label className="flex items-center justify-between p-2 rounded-xl border bg-card/60 cursor-pointer">
                  <span>Broadcast Alerts</span>
                  <Switch
                    checked={editPermissions.can_send_notifications}
                    onCheckedChange={(c) => setEditPermissions((p) => ({ ...p, can_send_notifications: c }))}
                  />
                </label>

                <label className="flex items-center justify-between p-2 rounded-xl border bg-card/60 cursor-pointer">
                  <span>View Analytics</span>
                  <Switch
                    checked={editPermissions.can_view_analytics}
                    onCheckedChange={(c) => setEditPermissions((p) => ({ ...p, can_view_analytics: c }))}
                  />
                </label>
              </div>
            </div>

            <div className="space-y-3 p-3.5 rounded-2xl border bg-card/40">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Assigned Classes ({editCategories.length})
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditCategories([])}
                  className="h-6 text-[10px] text-muted-foreground hover:text-destructive"
                >
                  Clear All
                </Button>
              </div>

              <div className="space-y-2">
                {CLASSES.map((cls) => {
                  const classCats = SECTIONS.map((s) => `${cls}-${s}`);
                  const allSelected = classCats.every((c) => editCategories.includes(c));
                  return (
                    <div key={cls} className="p-2 rounded-xl border bg-card/50">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-foreground">Class {cls}</span>
                        <button
                          type="button"
                          onClick={() => toggleAllForClass(cls)}
                          className="text-[10px] text-primary hover:underline font-semibold"
                        >
                          {allSelected ? 'Deselect Class' : 'Select All Sections'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {SECTIONS.map((sec) => {
                          const cat = `${cls}-${sec}`;
                          const isSel = editCategories.includes(cat);
                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => toggleEditCategory(cat)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition ${
                                isSel
                                  ? 'bg-primary text-white border-primary shadow-xs'
                                  : 'bg-muted/40 text-muted-foreground border-border/70 hover:border-primary/50'
                              }`}
                            >
                              {cat}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button onClick={handleSaveUser} disabled={isSavingUser} className="rounded-xl font-bold">
              {isSavingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save & Sync Permissions'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserAccessManager;

