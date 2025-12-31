-- 1. Add Round Columns to Games
alter table public.games 
add column if not exists round_number int default 1,
add column if not exists round_end_time timestamp with time zone;

-- 2. Create Game Rounds Table
create table if not exists public.game_rounds (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references public.games(id) on delete cascade not null,
  hider_id uuid references public.profiles(id) not null,
  duration_seconds int not null,
  found_by_user_id uuid references public.profiles(id),
  round_number int not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.game_rounds enable row level security;
create policy "Read rounds" on public.game_rounds for select to authenticated using (true);
create policy "Insert rounds" on public.game_rounds for insert to authenticated with check (true); 

-- 3. RPC: Record Found
create or replace function record_found(p_game_id uuid, p_seeker_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_game record;
  v_duration int;
begin
  select * into v_game from public.games where id = p_game_id;
  
  -- Calculate duration from release to now
  if v_game.head_start_released_at is null then
     v_duration := 0; -- Should not happen if game active
  else
     v_duration := extract(epoch from (now() - v_game.head_start_released_at));
  end if;

  -- Insert Round
  insert into public.game_rounds (game_id, hider_id, duration_seconds, found_by_user_id, round_number)
  values (p_game_id, v_game.hider_id, v_duration, p_seeker_id, coalesce(v_game.round_number, 1));

  -- Update Game to 'Ended' state (using round_end_time as flag)
  update public.games
  set round_end_time = now(),
      status = 'ended'
  where id = p_game_id;
end;
$$;

-- 4. RPC: Start Next Round (Switch Roles)
create or replace function start_next_round(p_game_id uuid, p_next_hider_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_current_hider uuid;
begin
  -- Get current hider
  select hider_id into v_current_hider from public.games where id = p_game_id;

  -- 1. Reset Game State (Immediate Restart)
  update public.games
  set status = 'active', -- Skip lobby, go straight to active (Head Start)
      round_number = coalesce(round_number, 1) + 1,
      hider_id = p_next_hider_id,
      start_time = now(), -- Restart timer for Head Start
      end_time = null,
      round_end_time = null,
      head_start_released_at = null,
      hiding_spot = null
  where id = p_game_id;
  
  -- 2. Clean up Round Data (Masks, Questions, Events)
  -- Preserve 'city_mask' if it exists in map_events (though usually client-side)
  delete from public.questions where game_id = p_game_id;
  delete from public.map_events where game_id = p_game_id and type != 'city_mask';
  delete from public.curse_events where game_id = p_game_id;

  -- 3. Swap Roles in game_players
  -- Set OLD Hider to Seeker
  update public.game_players
  set role = 'seeker'
  where game_id = p_game_id and user_id = v_current_hider;

  -- Set NEW Hider to Hider
  update public.game_players
  set role = 'hider'
  where game_id = p_game_id and user_id = p_next_hider_id;

  -- Ensure all others are seekers (redundant but safe)
  update public.game_players
  set role = 'seeker'
  where game_id = p_game_id and user_id not in (p_next_hider_id);

end;
$$;
