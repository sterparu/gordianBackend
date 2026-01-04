-- Add body column to campaigns table
ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS body TEXT;
