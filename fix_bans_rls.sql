-- Enable RLS on game_bans (if not already)
ALTER TABLE game_bans ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read game_bans (public game state)
CREATE POLICY "Enable read access for all users" ON "game_bans"
FOR SELECT USING (true);

-- Allow authenticated users (Hiders) to insert bans
CREATE POLICY "Enable insert access for authenticated users" ON "game_bans"
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to delete/update (optional, for cleanup)
CREATE POLICY "Enable delete access for authenticated users" ON "game_bans"
FOR DELETE USING (auth.role() = 'authenticated');
