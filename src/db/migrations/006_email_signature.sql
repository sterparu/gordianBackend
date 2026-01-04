-- Add email_signature column to user_settings
alter table public.user_settings
add column if not exists email_signature text;
