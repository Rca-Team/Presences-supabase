-- Fix function search path security issues

-- Update the get_user_role function to set search_path
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid UUID)
RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT role FROM public.users WHERE id = user_uuid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public;

-- Update other existing functions to set search_path for security
CREATE OR REPLACE FUNCTION public.increment_session_violations(session_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  UPDATE detection_sessions 
  SET violations_count = COALESCE(violations_count, 0) + 1,
      updated_at = now()
  WHERE id = session_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.test_camera_connection(camera_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  result JSONB;
BEGIN
  -- Simulate testing camera connection
  -- In a real implementation, this would test the RTSP stream
  result := jsonb_build_object(
    'success', true,
    'message', 'Camera connection successful',
    'latency', (random() * 100 + 50)::integer
  );
  
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_dashboard_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  today_violations INTEGER;
  week_violations INTEGER;
  month_violations INTEGER;
  active_cameras INTEGER;
  result JSONB;
BEGIN
  -- Get violations for today
  SELECT COUNT(*) INTO today_violations
  FROM public.violations
  WHERE DATE(timestamp) = CURRENT_DATE;
  
  -- Get violations for this week
  SELECT COUNT(*) INTO week_violations
  FROM public.violations
  WHERE timestamp >= date_trunc('week', CURRENT_DATE);
  
  -- Get violations for this month
  SELECT COUNT(*) INTO month_violations
  FROM public.violations
  WHERE timestamp >= date_trunc('month', CURRENT_DATE);
  
  -- Get active cameras count
  SELECT COUNT(*) INTO active_cameras
  FROM public.camera_sources
  WHERE is_active = true;
  
  result := jsonb_build_object(
    'today_violations', today_violations,
    'week_violations', week_violations,
    'month_violations', month_violations,
    'active_cameras', active_cameras
  );
  
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;