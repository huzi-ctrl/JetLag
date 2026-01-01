-- Enable Realtime for active_curses
alter publication supabase_realtime add table active_curses;

-- Set Replica Identity to FULL to ensure we get all data on updates/deletes (optional but good for debugging)
alter table active_curses replica identity full;

-- Verify Policies (Ensure Seekers can SELECT)
-- (Dropping existing policy first to be safe/idempotent)
drop policy if exists "Enable read access for all users" on public.active_curses;
create policy "Enable read access for all users" on public.active_curses for select using (true);

-- Ensure Insert/Update/Delete is restricted if needed, but for now we focus on READ for Realtime.
