-- 1. Add 'travel_agent' to the question_category enum
-- checks if it exists to avoid error, otherwise adds it.
DO $$
BEGIN
    ALTER TYPE question_category ADD VALUE IF NOT EXISTS 'travel_agent';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Ensure RLS allows Hiders to insert (re-applying to be safe)
DROP POLICY IF EXISTS "Allow auth insert" ON questions;

CREATE POLICY "Allow auth insert" ON questions FOR INSERT WITH CHECK (
  auth.uid() = seeker_id OR 
  EXISTS (
    SELECT 1 FROM game_players 
    WHERE game_players.game_id = questions.game_id 
    AND game_players.user_id = auth.uid() 
    AND game_players.role = 'hider'
  )
);
