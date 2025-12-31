-- 1. Realtime is already enabled (verified by error message)
-- alter publication supabase_realtime add table questions;

-- 2. Add UPDATE policy for Questions (Critical for answering)
create policy "Allow participants to update questions" on questions for update
to authenticated
using (
  exists (
    select 1 from games
    where games.id = questions.game_id
    and (games.hider_id = auth.uid() or questions.seeker_id = auth.uid())
  )
);

-- 3. Add DELETE policy (just in case)
create policy "Allow seeker to delete questions" on questions for delete
to authenticated
using (auth.uid() = seeker_id);
