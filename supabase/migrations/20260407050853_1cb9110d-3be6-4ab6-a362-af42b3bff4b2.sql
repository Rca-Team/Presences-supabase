-- Ensure emergency_events columns exist
ALTER TABLE public.emergency_events ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE public.emergency_events ADD COLUMN IF NOT EXISTS trigger_method TEXT;
ALTER TABLE public.emergency_events ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.emergency_events ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.emergency_events ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.emergency_events ADD COLUMN IF NOT EXISTS triggered_by UUID;

-- Expand event_type constraint
ALTER TABLE public.emergency_events DROP CONSTRAINT IF EXISTS emergency_events_event_type_check;
DO $$ BEGIN
  ALTER TABLE public.emergency_events ADD CONSTRAINT emergency_events_event_type_check 
    CHECK (event_type = ANY (ARRAY['lockdown','evacuation','medical','fire','earthquake','intruder','allclear','custom','other']));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Expand trigger_method constraint
ALTER TABLE public.emergency_events DROP CONSTRAINT IF EXISTS emergency_events_trigger_method_check;
DO $$ BEGIN
  ALTER TABLE public.emergency_events ADD CONSTRAINT emergency_events_trigger_method_check 
    CHECK (trigger_method = ANY (ARRAY['voice','button','auto','admin_panel']));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Create push_subscriptions table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own subscription" ON public.push_subscriptions;
CREATE POLICY "Users can manage their own subscription" ON public.push_subscriptions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);