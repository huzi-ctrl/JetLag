-- Function to get Seekers with Clean GeoJSON
-- Run this in Supabase SQL Editor

CREATE OR REPLACE FUNCTION get_game_seekers(p_game_id UUID)
RETURNS TABLE (user_id UUID, location JSON)
LANGUAGE plpgsql
SECURITY DEFINER -- run as creator (admin) to bypass tight RLS if needed, although we have policies
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        gp.user_id, 
        ST_AsGeoJSON(gp.location)::json
    FROM game_players gp
    WHERE gp.game_id = p_game_id 
    AND gp.role = 'seeker'
    AND gp.location IS NOT NULL;
END;
$$;
