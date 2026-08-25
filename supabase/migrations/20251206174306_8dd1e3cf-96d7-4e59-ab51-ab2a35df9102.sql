-- Create table for teacher permissions (which categories a teacher can manage)
CREATE TABLE IF NOT EXISTS public.teacher_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category TEXT NOT NULL,
  can_take_attendance BOOLEAN DEFAULT true,
  can_view_reports BOOLEAN DEFAULT true,
  granted_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, category)
);

-- Enable RLS
ALTER TABLE public.teacher_permissions ENABLE ROW LEVEL SECURITY;

-- Admins can manage all teacher permissions
CREATE POLICY "Admins can manage teacher permissions"
ON public.teacher_permissions
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Users can view their own permissions
CREATE POLICY "Users can view own permissions"
ON public.teacher_permissions
FOR SELECT
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_teacher_permissions_updated_at
BEFORE UPDATE ON public.teacher_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_teacher_permissions_user_id ON public.teacher_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_teacher_permissions_category ON public.teacher_permissions(category);