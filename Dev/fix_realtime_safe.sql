-- Safe Fix for Realtime Curses
-- This script skips adding the table to the publication since it's already there (Error 42710).

-- 1. ENABLE FULL REPLICA IDENTITY (Critical for Realtime Deletes)
-- Ensures all columns are available in the payload, preventing blank updates.
alter table active_curses replica identity full;

-- 2. RESET POLICIES (Critical for Visibility)
-- We ensure Row Level Security is enabled but PERMISSIVE for the game.
alter table active_curses enable row level security;

-- Drop any existing policies to avoid conflicts
drop policy if exists "Enable read access for all users" on public.active_curses;
drop policy if exists "Select Active Curses" on public.active_curses;
drop policy if exists "Insert Active Curses" on public.active_curses;
drop policy if exists "Delete Active Curses" on public.active_curses;
drop policy if exists "Read Active Curses" on public.active_curses;
drop policy if exists "Update Active Curses" on public.active_curses;
drop policy if exists "Curse Read" on public.active_curses;
drop policy if exists "Curse Insert" on public.active_curses;
drop policy if exists "Curse Update" on public.active_curses;
drop policy if exists "Curse Delete" on public.active_curses;

-- Re-create permissive policies for Game Flow
-- "using (true)" allows EVERYONE (Seekers/Hiders) to read/write.
-- Ideally we restrict writes to Hider, but for now we prioritize function.
create policy "Read Active Curses" on public.active_curses for select using (true);
create policy "Insert Active Curses" on public.active_curses for insert with check (true);
create policy "Update Active Curses" on public.active_curses for update using (true);
create policy "Delete Active Curses" on public.active_curses for delete using (true);
