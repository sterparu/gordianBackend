
-- Add Stripe-related columns to user_settings
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS stripe_customer_id text,
ADD COLUMN IF NOT EXISTS subscription_id text,
ADD COLUMN IF NOT EXISTS plan_tier text DEFAULT 'free';

-- Create index for faster lookups by customer_id (used in webhooks)
CREATE INDEX IF NOT EXISTS idx_user_settings_stripe_customer_id ON public.user_settings(stripe_customer_id);
