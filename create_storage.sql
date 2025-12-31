-- Create a new storage bucket for game uploads if it doesn't exist
insert into storage.buckets (id, name, public)
values ('game-uploads', 'game-uploads', true)
on conflict (id) do nothing;

-- Create policies with UNIQUE names to avoid "relation already exists" errors
-- 1. Public Read Access
create policy "Public Access game-uploads"
  on storage.objects for select
  using ( bucket_id = 'game-uploads' );

-- 2. Authenticated Uploads
create policy "Authenticated Uploads game-uploads"
  on storage.objects for insert
  with check ( bucket_id = 'game-uploads' and auth.role() = 'authenticated' );

-- 3. Owner Update
create policy "Owner Update game-uploads"
  on storage.objects for update
  using ( bucket_id = 'game-uploads' and auth.uid() = owner );

-- 4. Owner Delete
create policy "Owner Delete game-uploads"
  on storage.objects for delete
  using ( bucket_id = 'game-uploads' and auth.uid() = owner );
