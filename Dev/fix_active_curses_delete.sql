-- Allow users to DELETE active_curses if they are in the game
-- This is necessary for expired curses to be removed by the Hider client
create policy "Delete active curses"
    on public.active_curses for delete
    using (
        exists (
            select 1 from public.game_players
            where game_players.game_id = active_curses.game_id
            and game_players.user_id = auth.uid()
        )
    );

-- Allow UPDATE as well (for counters like Chalice)
create policy "Update active curses"
    on public.active_curses for update
    using (
        exists (
            select 1 from public.game_players
            where game_players.game_id = active_curses.game_id
            and game_players.user_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from public.game_players
            where game_players.game_id = active_curses.game_id
            and game_players.user_id = auth.uid()
        )
    );
