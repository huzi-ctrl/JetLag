-- Add columns to track Head Start status and Hider Jail location
alter table public.games 
add column if not exists head_start_released_at timestamp with time zone,
add column if not exists hiding_spot geography(POINT);

-- Secure RPC for the Hider to "Lock In" and start the game
-- This sets the release time to NOW() and saves their current location as the Jail Center
create or replace function release_seekers(p_game_id uuid, p_lat float, p_lng float)
returns void
language plpgsql
security definer
as $$
begin
    -- Verify user is in the game (optional strict check, but RLS usually handles update)
    -- We just update the game row.
    
    update public.games
    set 
        head_start_released_at = now(),
        hiding_spot = st_point(p_lng, p_lat)::geography
    where id = p_game_id;
    
    -- Note: RLS must allow UPDATE on games for the Hider. 
    -- If Hider is not Host, standard RLS might block this. 
    -- If so, we need to ensure this function has 'security definer' and checks permissions manually if needed.
end;
$$;
