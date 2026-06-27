-- Add cancellation_reason to subscriptions
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
