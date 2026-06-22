-- Create app_logs table for client/server error monitoring
CREATE TABLE IF NOT EXISTS public.app_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  slug TEXT,
  path TEXT,
  error TEXT,
  user_agent TEXT
);

-- Enable RLS and grant INSERT to anon, authenticated, and service_role
ALTER TABLE public.app_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert logs" ON public.app_logs FOR INSERT TO anon, authenticated WITH CHECK (true);

GRANT INSERT ON public.app_logs TO anon, authenticated, service_role;
