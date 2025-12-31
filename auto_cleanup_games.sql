-- Create a function to check for empty games and delete them
create or replace function public.delete_empty_game()
returns trigger as $$
begin
  -- Check if there are any players left for this game
  if not exists (select 1 from public.game_players where game_id = OLD.game_id) then
    -- No players left, delete the game
    delete from public.games where id = OLD.game_id;
  end if;
  return OLD;
end;
$$ language plpgsql security definer;

-- Create the trigger on game_players
drop trigger if exists on_player_leave_delete_game on public.game_players;

create trigger on_player_leave_delete_game
after delete on public.game_players
for each row
execute function public.delete_empty_game();
