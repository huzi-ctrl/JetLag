-- Ensure all Seekers have a location (Prevent NULL errors)
UPDATE game_players
SET location = 'POINT(-2.24 53.48)' -- Default to Manchester/Londonish if null
WHERE role = 'seeker' AND location IS NULL;
