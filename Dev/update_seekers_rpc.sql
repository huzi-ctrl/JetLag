-- Function to get Seekers with Clean GeoJSON and Profile Data
-- Run this in Supabase SQL Editor

DROP FUNCTION IF EXISTS get_game_seekers(UUID);

CREATE OR REPLACE FUNCTION get_game_seekers(p_game_id UUID)
RETURNS TABLE (
  user_id UUID, 
  location JSON,
  username TEXT,
  avatar_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        gp.user_id, 
        ST_AsGeoJSON(gp.location)::json,
        p.username,
        p.avatar_url
    FROM game_players gp
    JOIN profiles p ON gp.user_id = p.id
    WHERE gp.game_id = p_game_id 
    AND gp.role = 'seeker'
    AND gp.location IS NOT NULL;
END;
$$;
