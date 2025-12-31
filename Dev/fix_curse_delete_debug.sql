-- Secure RPC to delete a curse with DEBUG output
create or replace function delete_active_curse_debug(p_curse_row_id uuid)
returns text
language plpgsql
security definer
as $$
declare
    v_game_id uuid;
    v_auth_uid uuid;
begin
    v_auth_uid := auth.uid();
    
    -- Check if curse exists
    select game_id into v_game_id from active_curses where id = p_curse_row_id;
    
    if v_game_id is null then
        return 'CURSE_NOT_FOUND (ID=' || p_curse_row_id || ')';
    end if;

    -- Check if user in game
    if exists (
        select 1 from game_players 
        where game_id = v_game_id 
        and user_id = v_auth_uid
    ) then
        delete from active_curses where id = p_curse_row_id;
        if found then
            return 'DELETED';
        else
            return 'DELETE_FAILED_UNKNOWN';
        end if;
    else
        return 'ACCESS_DENIED (User=' || coalesce(v_auth_uid::text, 'NULL') || ' Game=' || v_game_id || ')';
    end if;
end;
$$;
