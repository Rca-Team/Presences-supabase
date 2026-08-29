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
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {user.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {user.email}
                            </span>
                          )}
                          {user.teacherCategories.length > 0 && (
                            <span className="text-blue-600 dark:text-blue-400 font-medium">
                              • Classes: {user.teacherCategories.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {user.role !== 'admin' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => quickPromote(user, 'admin')}
                          className="text-yellow-600 border-yellow-500/30 hover:bg-yellow-500/10 text-xs h-8"
                        >
                          <Crown className="h-3.5 w-3.5 mr-1" />
                          Admin
                        </Button>
                      )}
                      {user.role !== 'teacher' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user);
                            setNewRole('teacher');
                            setSelectedCategories(user.teacherCategories);
                            setDialogOpen(true);
                          }}
                          className="text-blue-600 border-blue-500/30 hover:bg-blue-500/10 text-xs h-8"
                        >
                          <GraduationCap className="h-3.5 w-3.5 mr-1" />
                          Assign Class
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(user)}
                        className="text-xs h-8"
                      >
                        <Edit className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Edit User Access & Class Assignment
            </DialogTitle>
            <DialogDescription>
              Update {selectedUser?.name}'s role and class assignment
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-3">
            {/* User Info */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              <Avatar className="h-11 w-11">
                {selectedUser?.avatar_url ? (
                  <AvatarImage src={selectedUser.avatar_url} alt={selectedUser?.name} />
                ) : null}
                <AvatarFallback>
                  <User className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-sm">{selectedUser?.name}</p>
                <p className="text-xs text-muted-foreground">{selectedUser?.email}</p>
              </div>
            </div>

            {/* Role Selection */}
            <div className="space-y-2">
              <p className="text-sm font-medium">System Role:</p>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      User (Standard / Student)
                    </div>
                  </SelectItem>
                  <SelectItem value="teacher">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="h-4 w-4 text-blue-500" />
                      Teacher (Class Attendance & Portal)
                    </div>
                  </SelectItem>
                  <SelectItem value="principal">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-purple-500" />
                      Principal (School-wide View)
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4 text-yellow-500" />
                      Admin (Full System Access)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Teacher Class Assignment */}
            <div className={`space-y-3 p-3 rounded-xl border ${newRole === 'teacher' ? 'bg-blue-500/5 border-blue-500/30' : 'bg-muted/30'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    <GraduationCap className="h-4 w-4 text-blue-500" />
                    Class Assignments {newRole === 'teacher' ? '(Required)' : '(Optional)'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Assign classes this teacher can take attendance and manage
                  </p>
                </div>
                <Badge variant="outline" className="text-xs bg-background">
                  {selectedCategories.length} selected
                </Badge>
              </div>

              {/* Quick helper buttons */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => {
                    const all: string[] = [];
                    CLASSES.forEach(cls => SECTIONS.forEach(s => all.push(`${cls}-${s}`)));
                    setSelectedCategories(all);
                  }}
                >
                  Select All Classes
                </Button>
                {selectedCategories.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 text-destructive"
                    onClick={() => setSelectedCategories([])}
                  >
                    Clear All
                  </Button>
                )}
              </div>

              <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
                {CLASSES.map(cls => {
                  const classCats = SECTIONS.map(s => `${cls}-${s}`);
                  const selectedInClass = classCats.filter(c => selectedCategories.includes(c)).length;
                  return (
                    <div key={cls} className="border rounded-lg p-2 space-y-1">
                      <button
                        type="button"
                        onClick={() => toggleAllForClass(cls)}
                        className="flex items-center justify-between w-full text-sm font-medium px-1 hover:text-primary"
                      >
                        <span>Class {cls}</span>
                        {selectedInClass > 0 && (
                          <span className="text-xs text-primary">{selectedInClass}/{SECTIONS.length}</span>
                        )}
                      </button>
                      <div className="grid grid-cols-4 gap-1">
                        {SECTIONS.map(sec => {
                          const cat = `${cls}-${sec}`;
                          const isSelected = selectedCategories.includes(cat);
                          return (
                            <label
                              key={cat}
                              className={`flex items-center gap-1.5 p-1.5 rounded text-xs cursor-pointer transition-colors ${
                                isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                              }`}
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleCategory(cat)}
                              />
                              <span>{sec}</span>
                            </label>
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
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UserAccessManager;
