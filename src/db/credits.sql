-- Add credit system columns to user_settings table
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS monthly_limit INTEGER DEFAULT 3000,
ADD COLUMN IF NOT EXISTS remaining_credits INTEGER DEFAULT 3000,
ADD COLUMN IF NOT EXISTS last_renewed TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
