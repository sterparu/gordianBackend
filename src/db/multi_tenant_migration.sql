
-- 1. Contact Groups
ALTER TABLE public.contact_groups 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_contact_groups_user_id ON public.contact_groups(user_id);

-- 2. Email Templates
ALTER TABLE public.email_templates 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_email_templates_user_id ON public.email_templates(user_id);

-- 3. Campaigns
ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON public.campaigns(user_id);

-- 4. Blacklist
-- Blacklist might default to global, but for multi-tenancy we usually want user-specific blacklists.
-- If we want global + user specific, it's complex. Assuming user-specific for now based on request.
ALTER TABLE public.blacklist 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update unique constraint to be composite (email + user_id) instead of just email
ALTER TABLE public.blacklist DROP CONSTRAINT IF EXISTS blacklist_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_blacklist_user_email ON public.blacklist(user_id, email);

-- 5. Backfill (Optional - assigns orphan data to a specific user if needed, or leaves null)
-- For now, we leave NULL. The app logic must handle NULLs or we can delete them.
-- DELETE FROM public.contact_groups WHERE user_id IS NULL; -- SAFE option for strict multi-tenancy?
-- For now, let's just leave them. Future queries will strictly look for user_id = X, so NULLs are hidden.
