-- Create storage bucket for game uploads
insert into storage.buckets (id, name, public)
values ('game_uploads', 'game_uploads', true)
on conflict (id) do nothing;

-- Policies for public access (Simple MVP)
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'game_uploads' );

create policy "Auth Upload"
  on storage.objects for insert
  with check ( bucket_id = 'game_uploads' and auth.role() = 'authenticated' );
