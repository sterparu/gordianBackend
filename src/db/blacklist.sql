-- Create Blacklist Table
CREATE TABLE IF NOT EXISTS public.blacklist (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Index for fast lookups during email sending
CREATE INDEX IF NOT EXISTS idx_blacklist_email ON public.blacklist(email);

-- Enable RLS (Optional, but good practice if exposed directly, though we use backend service role mostly)
ALTER TABLE public.blacklist ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users (or service role) to read/write
CREATE POLICY "Allow authenticated read access" ON public.blacklist
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated insert access" ON public.blacklist
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated delete access" ON public.blacklist
    FOR DELETE USING (auth.role() = 'authenticated');
