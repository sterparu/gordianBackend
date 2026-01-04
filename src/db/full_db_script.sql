-- Full Database Schema Script
-- Run this in the Supabase SQL Editor to replicate the database structure.

-- 1. Enable Extensions
create extension if not exists "uuid-ossp";

-- 2. Base Tables (from setup_complete_db.sql)

-- Contact Groups Table
create table if not exists public.contact_groups (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Contacts Table
create table if not exists public.contacts (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references public.contact_groups(id) on delete cascade not null,
  email text not null,
  name text,
  data jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Email Templates Table
create table if not exists public.email_templates (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  subject text,
  body text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- User Settings Table
create table if not exists public.user_settings (
  id uuid default uuid_generate_v4() primary key,
  provider text not null default 'shared-ses',
  aws_access_key text,
  aws_secret_key text,
  aws_region text,
  smtp_host text,
  smtp_port int,
  smtp_user text,
  smtp_pass text,
  from_email text,
  from_name text,
  reply_to_email text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  -- Marketing / Stripe Columns
  monthly_limit INTEGER DEFAULT 3000,
  remaining_credits INTEGER DEFAULT 3000,
  last_renewed TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  stripe_customer_id TEXT,
  subscription_id TEXT,
  plan_tier TEXT DEFAULT 'free'
);

-- Campaigns Table
CREATE TABLE IF NOT EXISTS public.campaigns (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    name text NOT NULL,
    subject text,
    total_recipients integer DEFAULT 0,
    status text DEFAULT 'queued',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Email Logs Table
CREATE TABLE IF NOT EXISTS public.email_logs (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
    recipient_email text NOT NULL,
    status text DEFAULT 'pending',
    error_message text,
    tracking_id uuid DEFAULT uuid_generate_v4(),
    opened_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Blacklist Table
CREATE TABLE IF NOT EXISTS public.blacklist (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Indexes (from setup_complete_db.sql)
create index if not exists idx_contacts_group_id on public.contacts(group_id);
create index if not exists idx_contacts_email on public.contacts(email);
CREATE INDEX IF NOT EXISTS idx_email_logs_tracking_id ON public.email_logs(tracking_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_campaign_id ON public.email_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_blacklist_email ON public.blacklist(email);
CREATE INDEX IF NOT EXISTS idx_user_settings_stripe_customer_id ON public.user_settings(stripe_customer_id);

-- 4. Multi-Tenancy (from multi_tenant_migration.sql)

-- Contact Groups
ALTER TABLE public.contact_groups 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_contact_groups_user_id ON public.contact_groups(user_id);

-- Email Templates
ALTER TABLE public.email_templates 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_email_templates_user_id ON public.email_templates(user_id);

-- Campaigns
ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON public.campaigns(user_id);

-- Blacklist
ALTER TABLE public.blacklist 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
-- Update unique constraint to be composite (email + user_id)
ALTER TABLE public.blacklist DROP CONSTRAINT IF EXISTS blacklist_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_blacklist_user_email ON public.blacklist(user_id, email);

-- 5. Additional Columns (from migrations)

-- 005_blacklist_source.sql
ALTER TABLE public.blacklist 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'; 

-- 006_email_signature.sql
alter table public.user_settings
add column if not exists email_signature text;

-- 6. Storage (from storage.sql)
insert into storage.buckets (id, name, public)
values ('campaign-attachments', 'campaign-attachments', true)
on conflict (id) do nothing;

create policy "Allow Public Uploads"
on storage.objects for insert
with check ( bucket_id = 'campaign-attachments' );

create policy "Allow Public Downloads"
on storage.objects for select
using ( bucket_id = 'campaign-attachments' );

-- 7. Disable RLS (Backend Access)
ALTER TABLE public.contact_groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacklist DISABLE ROW LEVEL SECURITY;

-- 8. Default Settings (Optional - removed because Trigger handles this for new users)
-- insert into public.user_settings ... 

-- 9. Procedures & Triggers (Auth Linking)

-- Alter user_settings to use auth.users(id) as primary key (One-to-One relationship)
-- Note: schema.sql created it with default uuid generation. We change it here to link strict to auth.users.
ALTER TABLE public.user_settings
    ALTER COLUMN id DROP DEFAULT,
    ADD CONSTRAINT user_settings_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create Trigger Function to auto-create settings for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_settings (id, provider, from_email, from_name)
  VALUES (
    NEW.id,
    'shared-ses',
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach Trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
