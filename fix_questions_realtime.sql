-- Enable Realtime for questions table
alter publication supabase_realtime add table questions;

-- Drop existing policies to ensure clean slate
drop policy if exists "Allow all read" on questions;
drop policy if exists "Allow auth insert" on questions;
drop policy if exists "Enable read access for all users" on questions;
drop policy if exists "Enable insert for authenticated users only" on questions;
drop policy if exists "Enable update for users based on game_id" on questions;
drop policy if exists "Questions Policy" on questions;

-- Enable RLS
alter table questions enable row level security;

-- MAX PERMISSIVE POLICIES FOR DEBUGGING
-- 1. SELECT: Allow everyone to read everything (Simplest for Realtime)
create policy "Allow all select"
on questions for select
using (true);

-- 2. INSERT: Allow authenticated users to insert (Seeker asking)
create policy "Allow authenticated insert"
on questions for insert
to authenticated
with check (true);

-- 3. UPDATE: Allow authenticated users to update (Hider answering)
create policy "Allow authenticated update"
on questions for update
to authenticated
using (true);
