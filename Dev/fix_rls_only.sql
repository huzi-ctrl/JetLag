-- RLS FIX ONLY

-- 1. Drop existing policies to ensure clean slate
drop policy if exists "Allow all read" on questions;
drop policy if exists "Allow auth insert" on questions;
drop policy if exists "Enable read access for all users" on questions;
drop policy if exists "Enable insert for authenticated users only" on questions;
drop policy if exists "Enable update for users based on game_id" on questions;
drop policy if exists "Questions Policy" on questions;
drop policy if exists "Allow all select" on questions;
drop policy if exists "Allow authenticated insert" on questions;
drop policy if exists "Allow authenticated update" on questions;

-- 2. Enable RLS
alter table questions enable row level security;

-- 3. MAX PERMISSIVE POLICIES FOR DEBUGGING

-- SELECT: Allow everyone to read everything
create policy "Allow all select" on questions for select using (true);

-- INSERT: Allow authenticated users to insert (Seeker)
create policy "Allow authenticated insert" on questions for insert to authenticated with check (true);

-- UPDATE: Allow authenticated users to update (Hider answering)
create policy "Allow authenticated update" on questions for update to authenticated using (true);

-- VALIDATION QUERY (Run this separately to check)
-- select * from questions;
