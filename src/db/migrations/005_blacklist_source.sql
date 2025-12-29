-- Add source column to blacklist table
ALTER TABLE public.blacklist 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'; 

-- Update existing records to manual (if needed, default handles new ones)
-- UPDATE public.blacklist SET source = 'manual' WHERE source IS NULL;

-- 'manual' = Added by user
-- 'unsubscribe' = Added via Unsubscribe Link
-- 'bounce' = Added via Auto-Bounce detection
