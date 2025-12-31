
-- Add bonus_time and start_time to games table if they don't exist
ALTER TABLE games ADD COLUMN IF NOT EXISTS bonus_time INTEGER DEFAULT 0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create game_bans table
CREATE TABLE IF NOT EXISTS game_bans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('QUESTION_ID', 'CATEGORY')),
    value TEXT NOT NULL, -- The Question ID or Category ID
    reason TEXT NOT NULL, -- 'ASKED', 'VETO', 'RANDOMIZE', 'BRAIN_CURSE', 'MEMORY_CURSE'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS
ALTER TABLE game_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all players" ON game_bans
    FOR SELECT USING (
        auth.uid() IN (
            SELECT user_id FROM game_players WHERE game_id = game_bans.game_id
        )
    );

CREATE POLICY "Enable insert for all players" ON game_bans
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT user_id FROM game_players WHERE game_id = game_bans.game_id
        )
    );

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE game_bans; 
ALTER PUBLICATION supabase_realtime ADD TABLE games; -- Ensure games is realtime for bonus_time updates
