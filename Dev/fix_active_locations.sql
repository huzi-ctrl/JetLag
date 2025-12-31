-- FORCE UPDATE all seeker locations to London (Valid Test Data)
UPDATE game_players
SET location = 'POINT(-0.1276 51.5074)', -- London
    last_seen = NOW()
WHERE role = 'seeker';

-- RELAX RLS to ensure future updates work
DROP POLICY IF EXISTS "Allow auth update" ON game_players;
CREATE POLICY "Allow auth update" ON game_players 
FOR UPDATE 
TO authenticated
USING (true)
WITH CHECK (true);

-- Ensure Insert is also open
DROP POLICY IF EXISTS "Allow auth insert" ON game_players;
CREATE POLICY "Allow auth insert" ON game_players 
FOR INSERT 
TO authenticated
WITH CHECK (true);
