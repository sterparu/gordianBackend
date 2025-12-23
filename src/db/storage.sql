-- Create the storage bucket for campaign attachments
insert into storage.buckets (id, name, public)
values ('campaign-attachments', 'campaign-attachments', true)
on conflict (id) do nothing;

-- Policy to allow anyone (anon) to upload files
-- WARNING: In a real production app, you might want to restrict this to authenticated users.
create policy "Allow Public Uploads"
on storage.objects for insert
with check ( bucket_id = 'campaign-attachments' );

-- Policy to allow anyone to view/download files
create policy "Allow Public Downloads"
on storage.objects for select
using ( bucket_id = 'campaign-attachments' );

-- Policy to allow anyone to delete their own files (optional, risky if no auth)
-- create policy "Allow Public Delete" ...
