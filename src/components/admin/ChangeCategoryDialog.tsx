import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FolderInput } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CLASSES, SECTIONS, getCategoryLabel, type Category } from '@/constants/schoolConfig';

interface ChangeCategoryDialogProps {
  userId: string;
  userName: string;
  currentCategory: string;
  onCategoryChanged?: () => void;
  trigger?: React.ReactNode;
}

const ChangeCategoryDialog: React.FC<ChangeCategoryDialogProps> = ({
  userId, userName, currentCategory, onCategoryChanged, trigger,
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isTeacher, setIsTeacher] = useState(currentCategory === 'Teacher');
  const [selectedClass, setSelectedClass] = useState(() => {
    const match = currentCategory.match(/^(\d+)-/);
    return match ? match[1] : '6';
  });
  const [selectedSection, setSelectedSection] = useState(() => {
    const match = currentCategory.match(/-([A-D])$/);
    return match ? match[1] : 'A';
  });
  const [isUpdating, setIsUpdating] = useState(false);

  const newCategory = isTeacher ? 'Teacher' : `${selectedClass}-${selectedSection}`;

  const handleUpdate = async () => {
    if (newCategory === currentCategory) { setOpen(false); return; }
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('attendance_records')
        .update({ category: newCategory })
        .eq('id', userId);
      if (error) throw error;
      toast({ title: 'Category Updated', description: `${userName} moved to ${getCategoryLabel(newCategory)}` });
      onCategoryChanged?.();
      setOpen(false);
    } catch (error) {
      console.error('Error updating category:', error);
      toast({ title: 'Error', description: 'Failed to update category', variant: 'destructive' });
    } finally { setIsUpdating(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1">
            <FolderInput className="h-3 w-3" />Change
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change Class / Section</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-muted-foreground">Student</Label>
            <p className="font-medium">{userName}</p>
          </div>
          <div>
            <Label className="text-muted-foreground">Current</Label>
            <p className="font-medium">{getCategoryLabel(currentCategory)}</p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isTeacher} onChange={(e) => setIsTeacher(e.target.checked)} className="rounded" />
            <span className="text-sm font-medium">Teacher</span>
          </label>

          {!isTeacher && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Class</Label>
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CLASSES.map(cls => (
                      <SelectItem key={cls} value={String(cls)}>Class {cls}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Section</Label>
                <Select value={selectedSection} onValueChange={setSelectedSection}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SECTIONS.map(sec => (
                      <SelectItem key={sec} value={sec}>Section {sec}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={isUpdating || newCategory === currentCategory}>
              {isUpdating ? 'Updating...' : 'Update'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ChangeCategoryDialog;
