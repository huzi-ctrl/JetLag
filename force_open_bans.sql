-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Enable read access for all users" ON "game_bans";
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON "game_bans";
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON "game_bans";
DROP POLICY IF EXISTS "Enable all access for all users" ON "game_bans";

-- Enable RLS
ALTER TABLE game_bans ENABLE ROW LEVEL SECURITY;

-- Create a blanket "allow all" policy for debugging
CREATE POLICY "Enable all access for all users" ON "game_bans"
FOR ALL USING (true) WITH CHECK (true);
