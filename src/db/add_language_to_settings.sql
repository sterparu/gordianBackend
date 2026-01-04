-- Add language preference to user_settings
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'ro'; -- Default to Romanian as per user's sample text
