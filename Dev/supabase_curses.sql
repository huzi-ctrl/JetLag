
-- Create curse_events table to track active curses
create table if not exists public.curse_events (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references public.games(id) on delete cascade not null,
  player_id uuid references public.profiles(id) on delete cascade not null,
  card_def_id text not null,
  input_data jsonb, -- Stores user input (text, number, photo URL)
  status text default 'active', -- active, resolved, failed
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS
alter table public.curse_events enable row level security;

create policy "Players can view curses in their game"
on public.curse_events for select
to authenticated
using (
  exists (
    select 1 from public.game_players gp
    where gp.game_id = curse_events.game_id
    and gp.user_id = auth.uid()
  )
);

create policy "Players can cast curses"
on public.curse_events for insert
to authenticated
with check (
   exists (
    select 1 from public.game_players gp
    where gp.game_id = curse_events.game_id
    and gp.user_id = auth.uid()
  )
);

create policy "Players can update their own curses (or any player in game?)"
on public.curse_events for update
to authenticated
using (
    exists (
    select 1 from public.game_players gp
    where gp.game_id = curse_events.game_id
    and gp.user_id = auth.uid()
  )
);
