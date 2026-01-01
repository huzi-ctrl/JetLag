-- COMPREHENSIVE RLS FIX
-- Run this to unblock "Read" access for Seekers

-- 1. ACTIVE CURSES
alter table active_curses enable row level security;
drop policy if exists "Enable read access for all users" on active_curses;
drop policy if exists "Read Active Curses" on active_curses;
drop policy if exists "Select Active Curses" on active_curses;

create policy "Universal Read Curses" on active_curses for select using (true);
create policy "Universal Insert Curses" on active_curses for insert with check (true);
create policy "Universal Delete Curses" on active_curses for delete using (true);

-- 2. GAME BANS (Fixing Drained Brain)
alter table game_bans enable row level security;
drop policy if exists "Enable read access for all users" on game_bans;
drop policy if exists "Ban Read" on game_bans;

create policy "Universal Read Bans" on game_bans for select using (true);
create policy "Universal Insert Bans" on game_bans for insert with check (true);
create policy "Universal Delete Bans" on game_bans for delete using (true);

-- 3. REPLICA IDENTITY (Ensure Realtime works for both)
alter table active_curses replica identity full;
alter table game_bans replica identity full;

-- 4. REALTIME PUBLICATION
-- Ensure both are in the publication
alter publication supabase_realtime add table active_curses;
alter publication supabase_realtime add table game_bans;
