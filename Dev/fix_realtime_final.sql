-- Comprehensive Fix for Realtime Curses
-- Run this in the Supabase SQL Editor

-- 1. Ensure the table exists (it should, as the app works)
-- If it doesn't, this part won't hurt existing data if checking existence carefully, 
-- but given the app uses it, we assume it's there.

-- 2. ENABLE REALTIME
-- Add 'active_curses' to the publication. 
-- 'curse_events' was in the master schema, but the code uses 'active_curses'.
alter publication supabase_realtime add table active_curses;

-- 3. ENABLE FULL REPLICA IDENTITY
-- This ensures 'DELETE' events send the full old record, needed for updates.
alter table active_curses replica identity full;

-- 4. FIX POLICIES (Allow Seekers to READ)
alter table active_curses enable row level security;

-- Drop existing restrictive policies if any
drop policy if exists "Enable read access for all users" on public.active_curses;
drop policy if exists "Select Active Curses" on public.active_curses;
drop policy if exists "Insert Active Curses" on public.active_curses;
drop policy if exists "Delete Active Curses" on public.active_curses;

-- Create broad policies for game flow
create policy "Read Active Curses" on public.active_curses for select using (true);
create policy "Insert Active Curses" on public.active_curses for insert with check (true);
create policy "Update Active Curses" on public.active_curses for update using (true);
create policy "Delete Active Curses" on public.active_curses for delete using (true);

-- 5. VERIFY
-- You should see 'active_curses' in the output of:
-- select * from pg_publication_tables where pubname = 'supabase_realtime';
