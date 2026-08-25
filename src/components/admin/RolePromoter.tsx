import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  UserPlus, 
  User, 
  Shield, 
  GraduationCap,
  ChevronRight,
  Search,
  X,
  Check
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Category = 'A' | 'B' | 'C' | 'D';

interface RegisteredUser {
  id: string;
  user_id: string | null;
  name: string;
  employee_id: string;
  category: string;
  image_url: string;
  isTeacher: boolean;
}

const CATEGORIES: Category[] = ['A', 'B', 'C', 'D'];

const RolePromoter: React.FC = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<RegisteredUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<RegisteredUser | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      setFilteredUsers(users.filter(u => 
        u.name.toLowerCase().includes(query) || 
        u.employee_id.toLowerCase().includes(query)
      ));
    } else {
      setFilteredUsers(users);
    }
  }, [searchQuery, users]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      // Fetch all registered users (excluding teachers for now)
      const { data: records, error } = await supabase
        .from('attendance_records')
        .select('id, user_id, device_info, image_url, category')
        .eq('status', 'registered');

      if (error) throw error;

      // Fetch existing teacher permissions
      const { data: permissions } = await supabase
        .from('teacher_permissions')
        .select('user_id');

      const teacherUserIds = new Set((permissions || []).map(p => p.user_id));

      const processedUsers: RegisteredUser[] = (records || [])
        .map(record => {
          const deviceInfo = record.device_info as any;
          const metadata = deviceInfo?.metadata || {};
          return {
            id: record.id,
            user_id: record.user_id,
            name: metadata.name || 'Unknown',
            employee_id: metadata.employee_id || 'N/A',
            category: record.category || 'A',
            image_url: record.image_url || metadata.firebase_image_url || '',
            isTeacher: record.category === 'Teacher' || (record.user_id ? teacherUserIds.has(record.user_id) : false),
          };
        })
        .filter(u => u.name !== 'Unknown')
        .sort((a, b) => {
          // Teachers first, then by name
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

  const openPromoteDialog = async (user: RegisteredUser) => {
    setSelectedUser(user);
    
    // Fetch current permissions if user has any
    if (user.user_id) {
      const { data: existingPerms } = await supabase
        .from('teacher_permissions')
        .select('category')
        .eq('user_id', user.user_id);

      setSelectedCategories((existingPerms || []).map(p => p.category as Category));
    } else {
      setSelectedCategories([]);
    }
    
    setDialogOpen(true);
  };

  const toggleCategory = (category: Category) => {
    setSelectedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const handlePromote = async () => {
    if (!selectedUser) return;
    
    setIsSaving(true);
    try {
      // For users without user_id, we'll use the record id
      const userId = selectedUser.user_id || selectedUser.id;

      // First, update the user's category to Teacher if not already
      if (selectedUser.category !== 'Teacher') {
        await supabase
          .from('attendance_records')
          .update({ category: 'Teacher' })
          .eq('id', selectedUser.id);
      }

      // Delete existing permissions
      await supabase
        .from('teacher_permissions')
        .delete()
        .eq('user_id', userId);

      // Insert new permissions
      if (selectedCategories.length > 0) {
        const permissionsToInsert = selectedCategories.map(cat => ({
          user_id: userId,
          category: cat,
          can_take_attendance: true,
          can_view_reports: true,
        }));

        const { error: insertError } = await supabase
          .from('teacher_permissions')
          .insert(permissionsToInsert);

        if (insertError) throw insertError;
      }

      toast({
        title: 'Success',
        description: `${selectedUser.name} has been ${selectedCategories.length > 0 ? 'promoted to teacher' : 'updated'}`,
      });

      setDialogOpen(false);
      fetchUsers();
    } catch (error) {
      console.error('Error promoting user:', error);
      toast({
        title: 'Error',
        description: 'Failed to update user permissions',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveTeacher = async (user: RegisteredUser) => {
    if (!user.user_id && !user.id) return;

    try {
      const userId = user.user_id || user.id;

      // Remove teacher permissions
      await supabase
        .from('teacher_permissions')
        .delete()
        .eq('user_id', userId);

      // Update category back to A (or original)
      await supabase
        .from('attendance_records')
        .update({ category: 'A' })
        .eq('id', user.id);

      toast({
        title: 'Teacher Removed',
        description: `${user.name} is no longer a teacher`,
      });

      fetchUsers();
    } catch (error) {
      console.error('Error removing teacher:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove teacher status',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Promote to Teacher
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Promote Users to Teachers
          </CardTitle>
          <CardDescription>
            Select users to give them teacher permissions for specific categories
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Users List */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No users found</p>
              </div>
            ) : (
              filteredUsers.map(user => (
                <div 
                  key={user.id} 
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    user.isTeacher ? 'bg-purple-500/5 border-purple-500/20' : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage 
                        src={user.image_url?.startsWith('data:') 
                          ? user.image_url 
                          : user.image_url 
                            ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/face-images/${user.image_url}` 
                            : ''
                        } 
                        alt={user.name}
                      />
                      <AvatarFallback>
                        <User className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{user.name}</p>
                        {user.isTeacher && (
                          <Badge variant="secondary" className="gap-1 bg-purple-500/20 text-purple-500">
                            <GraduationCap className="h-3 w-3" />
                            Teacher
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {user.employee_id} • Category {user.category}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {user.isTeacher ? (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => openPromoteDialog(user)}
                        >
                          <Shield className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                          onClick={() => handleRemoveTeacher(user)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => openPromoteDialog(user)}
                      >
                        <UserPlus className="h-4 w-4 mr-1" />
                        Promote
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Promote Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-purple-500" />
              {selectedUser?.isTeacher ? 'Edit Teacher Permissions' : 'Promote to Teacher'}
            </DialogTitle>
            <DialogDescription>
              {selectedUser?.name} - Select categories this teacher can manage
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Avatar className="h-12 w-12">
                <AvatarImage 
                  src={selectedUser?.image_url?.startsWith('data:') 
                    ? selectedUser?.image_url 
                    : selectedUser?.image_url 
                      ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/face-images/${selectedUser?.image_url}` 
                      : ''
                  } 
                  alt={selectedUser?.name}
                />
                <AvatarFallback>
                  <User className="h-6 w-6" />
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{selectedUser?.name}</p>
                <p className="text-sm text-muted-foreground">{selectedUser?.employee_id}</p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Assign Categories:</p>
              {CATEGORIES.map(cat => (
                <label 
                  key={cat} 
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedCategories.includes(cat) 
                      ? 'bg-primary/5 border-primary' 
                      : 'hover:bg-muted/50'
                  }`}
                >
                  <Checkbox
                    checked={selectedCategories.includes(cat)}
                    onCheckedChange={() => toggleCategory(cat)}
                  />
                  <span className="flex-1">Category {cat}</span>
                  {selectedCategories.includes(cat) && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePromote} disabled={isSaving}>
              {isSaving ? 'Saving...' : selectedUser?.isTeacher ? 'Update Permissions' : 'Promote to Teacher'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RolePromoter;
