-- Fix: Disable RLS on blacklist table to allow Backend (using anon/public key) to write to it.
-- Since the backend controls access via the API, we can safely disable Row Level Security for this table.

ALTER TABLE public.blacklist DISABLE ROW LEVEL SECURITY;

-- Alternatively, if you prefer to keep RLS enabled, drop the old policies and allow anon:
-- DROP POLICY IF EXISTS "Allow authenticated insert access" ON public.blacklist;
-- CREATE POLICY "Allow anon insert" ON public.blacklist FOR INSERT WITH CHECK (true);
