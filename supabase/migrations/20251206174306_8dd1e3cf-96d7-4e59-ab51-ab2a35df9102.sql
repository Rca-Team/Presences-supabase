-- CREATE TABLE IF NOT EXISTS for teacher permissions (which categories a teacher can manage)
CREATE TABLE IF NOT EXISTS public.teacher_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  category TEXT,
  can_take_attendance BOOLEAN DEFAULT true,
  can_view_reports BOOLEAN DEFAULT true,
  granted_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Ensure all columns exist if table was already created
ALTER TABLE public.teacher_permissions ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.teacher_permissions ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.teacher_permissions ADD COLUMN IF NOT EXISTS can_take_attendance BOOLEAN DEFAULT true;
ALTER TABLE public.teacher_permissions ADD COLUMN IF NOT EXISTS can_view_reports BOOLEAN DEFAULT true;
ALTER TABLE public.teacher_permissions ADD COLUMN IF NOT EXISTS granted_by UUID;

-- Enable RLS
ALTER TABLE public.teacher_permissions ENABLE ROW LEVEL SECURITY;

-- Helper has_role function if not exists
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
    AND role::text = _role
  );
END;
$$;

-- Admins can manage all teacher permissions
DROP POLICY IF EXISTS "Admins can manage teacher permissions" ON public.teacher_permissions;
CREATE POLICY "Admins can manage teacher permissions" ON public.teacher_permissions
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Users can view their own permissions
DROP POLICY IF EXISTS "Users can view own permissions" ON public.teacher_permissions;
CREATE POLICY "Users can view own permissions" ON public.teacher_permissions
FOR SELECT
USING (auth.uid() = user_id);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_teacher_permissions_updated_at ON public.teacher_permissions;
CREATE TRIGGER update_teacher_permissions_updated_at
BEFORE UPDATE ON public.teacher_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_teacher_permissions_user_id ON public.teacher_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_teacher_permissions_category ON public.teacher_permissions(category);