-- Secure RPC to delete a curse (Bypasses RLS issues)
-- Checks if user is in the game before deleting
create or replace function delete_active_curse(p_curse_row_id uuid)
returns void
language plpgsql
security definer
as $$
declare
    v_game_id uuid;
begin
    -- Get game_id of the curse
    select game_id into v_game_id from active_curses where id = p_curse_row_id;
    
    if v_game_id is null then
        return; -- Curse already gone
    end if;

    -- Verify user is a player in that game
    if exists (
        select 1 from game_players 
        where game_id = v_game_id 
        and user_id = auth.uid()
    ) then
        delete from active_curses where id = p_curse_row_id;
    else
        raise exception 'Access Denied: You are not in this game.';
    end if;
end;
$$;
