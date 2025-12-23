-- Campaigns Table: Stores high-level campaign info
CREATE TABLE IF NOT EXISTS public.campaigns (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    name text NOT NULL,
    subject text,
    total_recipients integer DEFAULT 0,
    status text DEFAULT 'queued', -- 'queued', 'processing', 'completed', 'failed'
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Email Logs Table: Stores individual email status and open tracking
CREATE TABLE IF NOT EXISTS public.email_logs (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
    recipient_email text NOT NULL,
    status text DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    error_message text,
    tracking_id uuid DEFAULT uuid_generate_v4(), -- Unique ID for the tracking pixel
    opened_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast lookup by tracking_id (for open tracking)
CREATE INDEX IF NOT EXISTS idx_email_logs_tracking_id ON public.email_logs(tracking_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_campaign_id ON public.email_logs(campaign_id);
