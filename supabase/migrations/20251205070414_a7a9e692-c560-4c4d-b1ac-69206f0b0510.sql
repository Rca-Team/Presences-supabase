-- Add category column to attendance_records for user categorization
ALTER TABLE public.attendance_records 
ADD COLUMN IF NOT EXISTS category text DEFAULT 'A';

-- Add comment for documentation
COMMENT ON COLUMN public.attendance_records.category IS 'User category: A, B, C, D, or Teacher';

-- Create index for faster category-based queries
CREATE INDEX IF NOT EXISTS idx_attendance_records_category ON public.attendance_records(category);
