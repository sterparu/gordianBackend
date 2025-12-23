-- Add Stripe-related columns to user_settings
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS subscription_id TEXT,
ADD COLUMN IF NOT EXISTS plan_tier TEXT DEFAULT 'free';

-- Create an index for fast lookups by stripe customer id during webhooks
CREATE INDEX IF NOT EXISTS idx_user_settings_stripe_customer_id ON public.user_settings(stripe_customer_id);
