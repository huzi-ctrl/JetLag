-- CLEANUP SCRIPT
-- Run this to purge stuck games and old data

-- 1. Delete games older than 24 hours (Stuck sessions)
delete from public.games 
where created_at < (now() - interval '24 hours');

-- 2. Delete games with NO players that are older than 10 minutes (Abandoned Lobbies)
-- (We give 10 mins grace period for creators to join their own game)
delete from public.games
where id in (
    select g.id from public.games g
    left join public.game_players gp on g.id = gp.game_id
    where gp.id is null
    and g.created_at < (now() - interval '10 minutes')
);

-- 3. Delete questions that somehow became orphaned (Safety net, though cascade should handle this)
delete from public.questions
where game_id not in (select id from public.games);

-- 4. Delete active curses blocked (Safety net)
delete from public.active_curses
where game_id not in (select id from public.games);

-- 5. Re-verify the Auto-Cleanup Trigger
create or replace function public.delete_empty_game()
returns trigger as $$
begin
  if not exists (select 1 from public.game_players where game_id = OLD.game_id) then
    delete from public.games where id = OLD.game_id;
  end if;
  return OLD;
end;
$$ language plpgsql security definer;

drop trigger if exists on_player_leave_delete_game on public.game_players;
create trigger on_player_leave_delete_game
after delete on public.game_players
for each row
execute function public.delete_empty_game();

-- 6. Clean Storage (Optional - requires more complex logic/extensions usually, skipping for now)

select 'Cleanup Complete. Deleted Orphaned Data.' as status;
