import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, User, GraduationCap, Eye, ClipboardCheck, Save, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CLASSES, SECTIONS, getCategoryLabel } from '@/constants/schoolConfig';
import { fetchTeacherCategories, saveTeacherCategories } from '@/utils/teacherAccess';

interface Teacher {
  id: string;
  user_id?: string;
  name: string;
  employee_id: string;
  image_url: string;
}

interface Permission {
  teacherId: string;
  category: string;
  can_take_attendance: boolean;
  can_view_reports: boolean;
}

const TeacherPermissionsManager: React.FC = () => {
  const { toast } = useToast();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<Permission[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => { fetchTeachersAndPermissions(); }, []);

  const fetchTeachersAndPermissions = async () => {
    setIsLoading(true);
    try {
      const { data: teacherRecords, error } = await supabase
        .from('attendance_records')
        .select('id, user_id, device_info, image_url')
        .eq('status', 'registered')
        .eq('category', 'Teacher');
      if (error) throw error;

      const processedTeachers: Teacher[] = (teacherRecords || [])
        .map(r => {
          const meta = (r.device_info as any)?.metadata || {};
          return { id: r.id, user_id: r.user_id || undefined, name: meta.name || 'Unknown', employee_id: meta.employee_id || 'N/A', image_url: r.image_url || meta.firebase_image_url || '' };
        })
        .filter(t => t.name !== 'Unknown');
      setTeachers(processedTeachers);

      const permissionRows: Permission[] = [];
      for (const teacher of processedTeachers) {
        const teacherId = teacher.user_id || teacher.id;
        const categories = await fetchTeacherCategories(teacherId);
        categories.forEach(category => {
          permissionRows.push({ teacherId, category, can_take_attendance: true, can_view_reports: true });
        });
      }
      setPermissions(permissionRows);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load teachers', variant: 'destructive' });
    } finally { setIsLoading(false); }
  };

  // Generate all class-section categories for permission assignment
  const allCategories = CLASSES.flatMap(cls => SECTIONS.map(sec => `${cls}-${sec}`));

  const openPermissionEditor = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    const teacherId = teacher.user_id || teacher.id;
    const existingPerms = permissions.filter(p => p.teacherId === teacherId);
    const allPerms: Permission[] = allCategories.map(cat => {
      const existing = existingPerms.find(p => p.category === cat);
      return existing || { teacherId, category: cat, can_take_attendance: false, can_view_reports: false };
    });
    setEditingPermissions(allPerms);
    setDialogOpen(true);
  };

  const togglePermission = (category: string, field: 'can_take_attendance' | 'can_view_reports') => {
    setEditingPermissions(prev => prev.map(p => p.category === category ? { ...p, [field]: !p[field] } : p));
  };

  const toggleAllForClass = (cls: number) => {
    const classCats = SECTIONS.map(s => `${cls}-${s}`);
    const allEnabled = classCats.every(cat => {
      const perm = editingPermissions.find(p => p.category === cat);
      return perm?.can_take_attendance && perm?.can_view_reports;
    });
    setEditingPermissions(prev => prev.map(p => 
      classCats.includes(p.category) ? { ...p, can_take_attendance: !allEnabled, can_view_reports: !allEnabled } : p
    ));
  };

  const savePermissions = async () => {
    if (!selectedTeacher) return;
    setIsSaving(true);
    try {
      const userId = selectedTeacher.user_id || selectedTeacher.id;
      const categories = editingPermissions
        .filter(p => p.can_take_attendance || p.can_view_reports)
        .map(p => p.category);
      await saveTeacherCategories(userId, categories);
      toast({ title: 'Permissions Saved', description: `Updated permissions for ${selectedTeacher.name}` });
      await fetchTeachersAndPermissions();
      setDialogOpen(false);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save permissions', variant: 'destructive' });
    } finally { setIsSaving(false); }
  };

  const getTeacherPermissionSummary = (teacher: Teacher) => {
    const teacherId = teacher.user_id || teacher.id;
    const perms = permissions.filter(p => p.teacherId === teacherId);
    if (perms.length === 0) return 'No classes assigned';
    // Group by class
    const classes = new Set(perms.map(p => p.category.split('-')[0]));
    return `${perms.length} sections across Class ${[...classes].join(', ')}`;
  };

  if (isLoading) {
    return (
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Teacher Permissions</CardTitle></CardHeader>
        <CardContent className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Teacher Permissions Manager</CardTitle>
      </CardHeader>
      <CardContent>
        {teachers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <GraduationCap className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No teachers registered yet</p>
            <p className="text-sm">Register teachers to assign class permissions</p>
          </div>
        ) : (
          <div className="space-y-3">
            {teachers.map(teacher => (
              <div key={teacher.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={teacher.image_url?.startsWith('data:') ? teacher.image_url : teacher.image_url ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/face-images/${teacher.image_url}` : ''} alt={teacher.name} />
                    <AvatarFallback><User className="h-5 w-5" /></AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{teacher.name}</p>
                    <p className="text-xs text-muted-foreground">{getTeacherPermissionSummary(teacher)}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => openPermissionEditor(teacher)}>
                  <Shield className="h-4 w-4 mr-1" />Manage
                </Button>
              </div>
            ))}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />Permissions — {selectedTeacher?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Select classes and sections this teacher can manage:</p>
              
              {CLASSES.map(cls => {
                const classCats = SECTIONS.map(s => `${cls}-${s}`);
                const enabledCount = classCats.filter(cat => {
                  const p = editingPermissions.find(ep => ep.category === cat);
                  return p?.can_take_attendance || p?.can_view_reports;
                }).length;

                return (
                  <div key={cls} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <button onClick={() => toggleAllForClass(cls)} className="flex items-center gap-2 font-medium text-sm hover:text-primary transition-colors">
                        <span>Class {cls}</span>
                        {enabledCount > 0 && <Badge variant="secondary" className="text-xs">{enabledCount}/{SECTIONS.length}</Badge>}
                      </button>
                      <Button variant="ghost" size="sm" onClick={() => toggleAllForClass(cls)} className="text-xs">
                        Toggle All
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {SECTIONS.map(sec => {
                        const cat = `${cls}-${sec}`;
                        const perm = editingPermissions.find(p => p.category === cat);
                        const isEnabled = perm?.can_take_attendance || perm?.can_view_reports;
                        return (
                          <div key={cat} className={`flex flex-col gap-1 p-2 rounded border text-xs ${isEnabled ? 'border-primary bg-primary/5' : 'border-border'}`}>
                            <span className="font-medium text-center">Sec {sec}</span>
                            <label className="flex items-center gap-1 cursor-pointer">
                              <Checkbox checked={perm?.can_take_attendance || false} onCheckedChange={() => togglePermission(cat, 'can_take_attendance')} />
                              <ClipboardCheck className="h-3 w-3" /><span>Attend</span>
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer">
                              <Checkbox checked={perm?.can_view_reports || false} onCheckedChange={() => togglePermission(cat, 'can_view_reports')} />
                              <Eye className="h-3 w-3" /><span>Reports</span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setDialogOpen(false)}><X className="h-4 w-4 mr-1" />Cancel</Button>
                <Button onClick={savePermissions} disabled={isSaving}><Save className="h-4 w-4 mr-1" />{isSaving ? 'Saving...' : 'Save'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default TeacherPermissionsManager;
