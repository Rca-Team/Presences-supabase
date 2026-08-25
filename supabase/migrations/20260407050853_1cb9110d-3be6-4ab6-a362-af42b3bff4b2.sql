-- Expand event_type constraint
ALTER TABLE public.emergency_events DROP CONSTRAINT emergency_events_event_type_check;
ALTER TABLE public.emergency_events ADD CONSTRAINT emergency_events_event_type_check 
  CHECK (event_type = ANY (ARRAY['lockdown','evacuation','medical','fire','earthquake','intruder','allclear','custom','other']));

-- Expand trigger_method constraint
ALTER TABLE public.emergency_events DROP CONSTRAINT emergency_events_trigger_method_check;
ALTER TABLE public.emergency_events ADD CONSTRAINT emergency_events_trigger_method_check 
  CHECK (trigger_method = ANY (ARRAY['voice','button','auto','admin_panel']));

-- Create push_subscriptions table
CREATE TABLE public.push_subscriptions (
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

CREATE POLICY "Users can manage their own subscription"
  ON public.push_subscriptions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);