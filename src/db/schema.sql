-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Contact Groups Table
create table public.contact_groups (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Contacts Table
create table public.contacts (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references public.contact_groups(id) on delete cascade not null,
  email text not null,
  name text,
  data jsonb default '{}'::jsonb, -- Store extra mapped columns here
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Email Templates Table
create table public.email_templates (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  subject text,
  body text not null, -- HTML content
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indexes for performance
create index idx_contacts_group_id on public.contacts(group_id);
create index idx_contacts_email on public.contacts(email);

-- User Settings Table
create table public.user_settings (
  id uuid default uuid_generate_v4() primary key,
  provider text not null default 'shared-ses', -- 'shared-ses', 'custom-ses', 'smtp'
  
  -- Custom AWS SES Config
  aws_access_key text,
  aws_secret_key text,
  aws_region text,
  
  -- SMTP Config
  smtp_host text,
  smtp_port int,
  smtp_user text,
  smtp_pass text,
  
  -- General
  from_email text,
  from_name text,
  reply_to_email text,
  
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Insert default row if not exists (handled in app logic usually, but here for init)
insert into public.user_settings (provider, from_email, from_name)
select 'shared-ses', 'notification@vasteris.com', 'ToolMail User'
where not exists (select 1 from public.user_settings);
