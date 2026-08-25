
-- Create a function to get the cutoff time
CREATE OR REPLACE FUNCTION public.get_cutoff_time()
RETURNS TABLE (key text, value jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT a.key, a.value
  FROM public.attendance_settings a
  WHERE a.key = 'cutoff_time';
END;
$$;

-- Create a function to update the cutoff time
CREATE OR REPLACE FUNCTION public.update_cutoff_time(hour_value int, minute_value int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate inputs
  IF hour_value < 0 OR hour_value > 23 OR minute_value < 0 OR minute_value > 59 THEN
    RAISE EXCEPTION 'Invalid cutoff time values';
  END IF;

  -- Update or insert the cutoff time
  INSERT INTO public.attendance_settings (key, value, updated_at)
  VALUES ('cutoff_time', jsonb_build_object('hour', hour_value, 'minute', minute_value), NOW())
  ON CONFLICT (key)
  DO UPDATE SET 
    value = jsonb_build_object('hour', hour_value, 'minute', minute_value),
    updated_at = NOW();
    
  RETURN true;
END;
$$;
