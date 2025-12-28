-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Contact Groups Table
create table if not exists public.contact_groups (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Contacts Table
create table if not exists public.contacts (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references public.contact_groups(id) on delete cascade not null,
  email text not null,
  name text,
  data jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Email Templates Table
create table if not exists public.email_templates (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  subject text,
  body text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. User Settings Table
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
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4.1 Marketing Columns (Credits, Stripe)
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS monthly_limit INTEGER DEFAULT 3000,
ADD COLUMN IF NOT EXISTS remaining_credits INTEGER DEFAULT 3000,
ADD COLUMN IF NOT EXISTS last_renewed TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS subscription_id TEXT,
ADD COLUMN IF NOT EXISTS plan_tier TEXT DEFAULT 'free';

-- 5. Campaigns Table
CREATE TABLE IF NOT EXISTS public.campaigns (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    name text NOT NULL,
    subject text,
    total_recipients integer DEFAULT 0,
    status text DEFAULT 'queued',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Email Logs Table
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

-- 7. Blacklist Table
CREATE TABLE IF NOT EXISTS public.blacklist (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes
create index if not exists idx_contacts_group_id on public.contacts(group_id);
create index if not exists idx_contacts_email on public.contacts(email);
CREATE INDEX IF NOT EXISTS idx_email_logs_tracking_id ON public.email_logs(tracking_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_campaign_id ON public.email_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_blacklist_email ON public.blacklist(email);
CREATE INDEX IF NOT EXISTS idx_user_settings_stripe_customer_id ON public.user_settings(stripe_customer_id);

-- Insert default settings if not exists
insert into public.user_settings (provider, from_email, from_name)
select 'shared-ses', 'notification@vasteris.com', 'ToolMail User'
where not exists (select 1 from public.user_settings);

-- Disable RLS on ALL tables to ensure Backend Access
ALTER TABLE public.contact_groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacklist DISABLE ROW LEVEL SECURITY;
