DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'school_gates'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.school_gates;
  END IF;
END
$$;