
-- SQL function to create the attendance_settings table if it doesn't exist
CREATE OR REPLACE FUNCTION create_attendance_settings_table()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  table_exists BOOLEAN;
BEGIN
  -- Check if table already exists
  SELECT EXISTS (
    SELECT FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'attendance_settings'
  ) INTO table_exists;
  
  IF NOT table_exists THEN
    -- Create the table
    CREATE TABLE public.attendance_settings (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      key text NOT NULL UNIQUE,
      value jsonb NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    );

    -- Add RLS policies for security
    ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;
    
    -- Grant necessary permissions
    GRANT ALL ON TABLE public.attendance_settings TO authenticated;
    GRANT ALL ON TABLE public.attendance_settings TO service_role;
    
    -- Create RLS policies for authenticated users
    CREATE POLICY "Enable read access for authenticated users"
      ON public.attendance_settings
      FOR SELECT
      TO authenticated
      USING (true);
      
    CREATE POLICY "Enable write access for authenticated users"
      ON public.attendance_settings
      FOR ALL
      TO authenticated
      USING (true);
      
    -- Insert default cutoff time
    INSERT INTO public.attendance_settings (key, value)
    VALUES ('cutoff_time', '{"hour":9,"minute":0}');
    
    RAISE NOTICE 'Created attendance_settings table with default cutoff time.';
  ELSE
    RAISE NOTICE 'attendance_settings table already exists.';
  END IF;
END;
$$;

-- Execute the function to ensure the table exists
SELECT create_attendance_settings_table();
