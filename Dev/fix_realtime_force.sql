-- FORCE ENABLE REALTIME
-- 1. Remove from publication (ignore error if not present)
alter publication supabase_realtime drop table if exists active_curses;

-- 2. Set Replica Identity
alter table active_curses replica identity full;

-- 3. Re-add to publication
alter publication supabase_realtime add table active_curses;

-- 4. Verify RLS is OPEN
drop policy if exists "Enable read access for all users" on public.active_curses;
create policy "Enable read access for all users" on public.active_curses for select using (true);
