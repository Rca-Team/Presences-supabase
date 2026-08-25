import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
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
  User, 
  Shield, 
  GraduationCap,
  Search,
  Crown,
  ShieldCheck,
  UserCog,
  Edit,
  Loader2,
  Mail,
  Zap
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CLASSES, SECTIONS } from '@/constants/schoolConfig';
import { fetchTeacherCategories, saveTeacherCategories } from '@/utils/teacherAccess';

type Role = 'user' | 'principal' | 'admin';

interface RegisteredUser {
  id: string;
  user_id: string;
  name: string;
  email: string;
  avatar_url: string;
  role: Role;
  isTeacher: boolean;
  teacherCategories: string[];
  lastSignIn?: string | null;
  signedUpAt?: string | null;
}

const ROLE_CONFIG: Record<Role, { label: string; icon: React.ElementType; color: string }> = {
  admin: { label: 'Admin', icon: Crown, color: 'text-yellow-500 bg-yellow-500/10' },
  principal: { label: 'Principal', icon: ShieldCheck, color: 'text-purple-500 bg-purple-500/10' },
  user: { label: 'User', icon: User, color: 'text-muted-foreground bg-muted' },
};

const UserAccessManager: React.FC = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<RegisteredUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  
  const [selectedUser, setSelectedUser] = useState<RegisteredUser | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newRole, setNewRole] = useState<Role>('user');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Create-teacher form state
  const [tEmail, setTEmail] = useState('');
  const [tPass, setTPass] = useState('');
  const [tName, setTName] = useState('');
  const [tClass, setTClass] = useState<string>(String(CLASSES[0] ?? '6'));
  const [tSection, setTSection] = useState<string>(String(SECTIONS[0] ?? 'A'));
  const [tCreating, setTCreating] = useState(false);

  const handleCreateTeacher = async () => {
    if (!tEmail || !tPass) {
      toast({ title: 'Missing fields', description: 'Email and password required', variant: 'destructive' });
      return;
    }
    setTCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-teacher', {
        body: {
          email: tEmail.trim().toLowerCase(),
          password: tPass,
          name: tName.trim() || tEmail.split('@')[0],
          classes: [`${tClass}-${tSection}`],
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: 'Teacher created', description: `${tEmail} → Class ${tClass}-${tSection}` });
      setTEmail(''); setTPass(''); setTName('');
      fetchUsers();
    } catch (e: any) {
      toast({ title: 'Failed to create teacher', description: e.message || 'Server error', variant: 'destructive' });
    } finally {
      setTCreating(false);
    }
  };

  useEffect(() => {
    fetchUsers();

    // Realtime: refetch when roles change
    const channel = supabase
      .channel('user-access-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, () => {
        fetchUsers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchUsers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let filtered = users;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(u => 
        u.name.toLowerCase().includes(query) || 
        u.email.toLowerCase().includes(query)
      );
    }
    
    if (roleFilter !== 'all') {
      filtered = filtered.filter(u => u.role === roleFilter || (roleFilter === 'principal' && u.isTeacher));
    }
    
    setFilteredUsers(filtered);
  }, [searchQuery, roleFilter, users]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      // Fetch ALL signed-in auth users via secure RPC (admin only)
      const { data: authUsers, error: authError } = await supabase
        .rpc('get_all_auth_users');

      if (authError) throw authError;

      // Fetch profiles for display info
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, avatar_url, parent_email, username');

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

      // Fetch user roles
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role');

      const roleMap = new Map((roles || []).map(r => [r.user_id, r.role]));

      const teacherPermsMap = new Map<string, string[]>();
      for (const au of authUsers || []) {
        const userId = au.user_id;
        if (!userId) continue;
        const categories = await fetchTeacherCategories(userId);
        if (categories.length > 0) {
          teacherPermsMap.set(userId, categories);
        }
      }

      const processedUsers: RegisteredUser[] = (authUsers || [])
        .map((au: any) => {
          const userId = au.user_id;
          const profile: any = profileMap.get(userId) || {};
          return {
            id: profile.id || userId,
            user_id: userId,
            name: profile.display_name || profile.username || (au.email ? au.email.split('@')[0] : 'Unnamed User'),
            email: au.email || profile.parent_email || profile.username || '',
            avatar_url: profile.avatar_url || '',
            role: (roleMap.get(userId) as Role) || 'user',
            isTeacher: teacherPermsMap.has(userId),
            teacherCategories: teacherPermsMap.get(userId) || [],
            lastSignIn: au.last_sign_in_at,
            signedUpAt: au.created_at,
          };
        })
        .sort((a, b) => {
          const roleOrder: Record<string, number> = { admin: 0, principal: 1, user: 2 };
          const aOrder = roleOrder[a.role] ?? 2;
          const bOrder = roleOrder[b.role] ?? 2;
          if (aOrder !== bOrder) return aOrder - bOrder;
          if (a.isTeacher && !b.isTeacher) return -1;
          if (!a.isTeacher && b.isTeacher) return 1;
          return a.name.localeCompare(b.name);
        });

      setUsers(processedUsers);
      setFilteredUsers(processedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openEditDialog = (user: RegisteredUser) => {
    setSelectedUser(user);
    setNewRole(user.role);
    setSelectedCategories(user.teacherCategories);
    setDialogOpen(true);
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const toggleAllForClass = (cls: number) => {
    const classCats = SECTIONS.map(s => `${cls}-${s}`);
    const allSelected = classCats.every(c => selectedCategories.includes(c));
    if (allSelected) {
      setSelectedCategories(prev => prev.filter(c => !classCats.includes(c)));
    } else {
      setSelectedCategories(prev => [...new Set([...prev, ...classCats])]);
    }
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    
    setIsSaving(true);
    try {
      const userId = selectedUser.user_id;

      // Delete existing role then insert new one
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: newRole });

      if (roleError) throw roleError;

      // Handle teacher permissions
      await saveTeacherCategories(userId, selectedCategories);

      toast({
        title: 'Success',
        description: `${selectedUser.name}'s access has been updated`,
      });

      setDialogOpen(false);
      fetchUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      toast({
        title: 'Error',
        description: 'Failed to update user access',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const quickPromote = async (user: RegisteredUser, role: Role) => {
    try {
      await supabase.from('user_roles').delete().eq('user_id', user.user_id);
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: user.user_id, role });
      if (error) throw error;
      toast({
        title: role === 'admin' ? 'Admin granted' : 'Role updated',
        description: `${user.name} is now ${role === 'admin' ? 'an Admin' : role}`,
      });
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            User Access Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Quick: Create Teacher Account */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            Create Teacher Account
          </CardTitle>
          <CardDescription>
            Provisions login + assigns class access + adds them as class teacher
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-6">
            <Input className="md:col-span-2" placeholder="teacher@school.com" value={tEmail} onChange={(e) => setTEmail(e.target.value)} />
            <Input placeholder="Password" type="text" value={tPass} onChange={(e) => setTPass(e.target.value)} />
            <Input placeholder="Display name (optional)" value={tName} onChange={(e) => setTName(e.target.value)} />
            <Select value={tClass} onValueChange={setTClass}>
              <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
              <SelectContent>
                {CLASSES.map((c) => (<SelectItem key={String(c)} value={String(c)}>Class {c}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={tSection} onValueChange={setTSection}>
              <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
              <SelectContent>
                {SECTIONS.map((s) => (<SelectItem key={String(s)} value={String(s)}>Section {s}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3 flex justify-end">
            <Button onClick={handleCreateTeacher} disabled={tCreating}>
              {tCreating ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</>) : (<>Create Teacher</>)}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            User Access Management
          </CardTitle>
          <CardDescription>
            Manage roles for all signed-up users
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as 'all' | Role)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Admins</SelectItem>
                <SelectItem value="principal">Principals</SelectItem>
                <SelectItem value="user">Users</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Stats */}
          <div className="flex gap-3 flex-wrap">
            <Badge variant="outline" className="gap-1">
              <Users className="h-3 w-3" />
              {users.length} Total Users
            </Badge>
            <Badge className={ROLE_CONFIG.admin.color}>
              <Crown className="h-3 w-3 mr-1" />
              {users.filter(u => u.role === 'admin').length} Admins
            </Badge>
            <Badge className={ROLE_CONFIG.principal.color}>
              <ShieldCheck className="h-3 w-3 mr-1" />
              {users.filter(u => u.role === 'principal').length} Principals
            </Badge>
            <Badge className="gap-1 bg-blue-500/10 text-blue-500">
              <GraduationCap className="h-3 w-3" />
              {users.filter(u => u.isTeacher).length} Teachers
            </Badge>
          </div>

          {/* Users List */}
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No users found</p>
              </div>
            ) : (
              filteredUsers.map(user => {
                const RoleIcon = ROLE_CONFIG[user.role].icon;
                
                return (
                  <div 
                    key={user.id} 
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        {user.avatar_url ? (
                          <AvatarImage src={user.avatar_url} alt={user.name} />
                        ) : null}
                        <AvatarFallback>
                          <User className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{user.name}</p>
                          <Badge variant="outline" className={ROLE_CONFIG[user.role].color}>
                            <RoleIcon className="h-3 w-3 mr-1" />
                            {ROLE_CONFIG[user.role].label}
                          </Badge>
                          {user.isTeacher && user.role !== 'principal' && (
                            <Badge variant="secondary" className="gap-1 bg-blue-500/10 text-blue-500">
                              <GraduationCap className="h-3 w-3" />
                              Teacher
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {user.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {user.email}
                            </span>
                          )}
                          {user.teacherCategories.length > 0 && (
                            <span>• Classes: {user.teacherCategories.join(', ')}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {user.role !== 'admin' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => quickPromote(user, 'admin')}
                          className="text-yellow-600 border-yellow-500/30 hover:bg-yellow-500/10"
                        >
                          <Crown className="h-4 w-4 mr-1" />
                          Make Admin
                        </Button>
                      )}
                      {user.role === 'admin' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => quickPromote(user, 'user')}
                        >
                          <Zap className="h-4 w-4 mr-1" />
                          Revoke
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(user)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Edit User Access
            </DialogTitle>
            <DialogDescription>
              Update {selectedUser?.name}'s role and permissions
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* User Info */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Avatar className="h-12 w-12">
                {selectedUser?.avatar_url ? (
                  <AvatarImage src={selectedUser.avatar_url} alt={selectedUser?.name} />
                ) : null}
                <AvatarFallback>
                  <User className="h-6 w-6" />
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{selectedUser?.name}</p>
                <p className="text-sm text-muted-foreground">{selectedUser?.email}</p>
              </div>
            </div>

            {/* Role Selection */}
            <div className="space-y-3">
              <p className="text-sm font-medium">System Role:</p>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      User (Default)
                    </div>
                  </SelectItem>
                  <SelectItem value="principal">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-purple-500" />
                      Principal
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4 text-yellow-500" />
                      Admin
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Teacher Categories */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Teacher Permissions (Optional):</p>
              <p className="text-xs text-muted-foreground">
                Assign class-sections this user can manage as a teacher
              </p>
              <div className="max-h-[250px] overflow-y-auto space-y-2">
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
