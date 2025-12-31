-- Allow Hiders to insert questions (necessary for Curse of the Mediocre Travel Agent deduction mask)
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
