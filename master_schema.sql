-- ==========================================
-- JETLAG MASTER SCHEMA
-- Combined from dev scripts for Production
-- ==========================================

-- 1. EXTENSIONS
create extension if not exists postgis;

-- 2. ENUMS
do $$ begin
    create type public.game_status as enum ('lobby', 'active', 'paused', 'ended');
    create type public.player_role as enum ('hider', 'seeker', 'spectator');
    create type public.question_category as enum ('matching', 'measuring', 'thermometer', 'radar', 'tentacles', 'photos');
    create type public.question_status as enum ('draft', 'pending_veto', 'open', 'answered', 'vetoed');
exception
    when duplicate_object then null;
end $$;

-- 3. TABLES

-- PROFILES
create table if not exists public.profiles (
  id uuid references auth.users not null primary key,
  username text unique not null,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- GAMES
create table if not exists public.games (
  id uuid default gen_random_uuid() primary key,
  status public.game_status default 'lobby'::public.game_status not null,
  hider_id uuid references public.profiles(id),
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  game_code text unique,
  config jsonb default '{}'::jsonb,
  -- Round support
  round_number int default 1,
  round_end_time timestamp with time zone,
  head_start_released_at timestamp with time zone,
  hiding_spot jsonb -- { type: 'CITY'|'Exact', coordinates: [lng, lat] }
);

-- GAME_PLAYERS
create table if not exists public.game_players (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references public.games(id) on delete cascade not null,
  user_id uuid references public.profiles(id) not null,
  role public.player_role default 'spectator'::public.player_role not null,
  location geography(POINT, 4326), 
  last_seen timestamp with time zone default now(),
  battery_level int,
  transport_mode text default 'walking',
  unique(game_id, user_id)
);

-- QUESTIONS
create table if not exists public.questions (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references public.games(id) on delete cascade not null,
  seeker_id uuid references public.profiles(id) not null, 
  category public.question_category not null,
  question_text text not null,
  params jsonb default '{}'::jsonb,
  status public.question_status default 'draft'::public.question_status not null,
  answer_text text,
  answer_blob_url text, 
  answered_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

-- MAP_EVENTS (Deduction & Masks)
create table if not exists public.map_events (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references public.games(id) on delete cascade not null,
  created_by uuid references public.profiles(id),
  type text not null, 
  geometry geometry(GEOMETRY, 4326), 
  label text,
  color text default '#ff0000',
  is_fog_of_war boolean default false 
);

-- GAME_ROUNDS (History)
create table if not exists public.game_rounds (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references public.games(id) on delete cascade not null,
  hider_id uuid references public.profiles(id) not null,
  duration_seconds int not null,
  found_by_user_id uuid references public.profiles(id),
  round_number int not null,
  final_score int, -- Calculated score
  score_breakdown jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- CURSE_EVENTS (Active Curses)
create table if not exists public.curse_events (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references public.games(id) on delete cascade not null,
  player_id uuid references public.profiles(id) on delete cascade not null,
  card_def_id text not null,
  input_data jsonb,
  status text default 'active',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- GAME_BANS (For Brain Freeze)
create table if not exists public.game_bans (
    id uuid default gen_random_uuid() primary key,
    game_id uuid references public.games(id) on delete cascade not null,
    hider_id uuid references public.profiles(id) not null,
    question_id text not null,  -- e.g. "Q_MATCHING_1"
    category text not null,     -- e.g. "MATCHING"
    created_at timestamp with time zone default now(),
    expires_at timestamp with time zone
);

-- 4. RLS POLICIES
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.questions enable row level security;
alter table public.map_events enable row level security;
alter table public.game_rounds enable row level security;
alter table public.curse_events enable row level security;
alter table public.game_bans enable row level security;

-- Basic Read Policies (Open for now, can be tightened to 'in game')
create policy "Read Profiles" on public.profiles for select using (true);
create policy "Read Games" on public.games for select using (true);
create policy "Read Players" on public.game_players for select using (true);
create policy "Read Questions" on public.questions for select using (true);
create policy "Read Map Events" on public.map_events for select using (true);
create policy "Read Rounds" on public.game_rounds for select using (true);
create policy "Update Rounds" on public.game_rounds for update to authenticated using (true);

-- Curse Policies
create policy "Curse Read" on public.curse_events for select to authenticated using (true);
create policy "Curse Insert" on public.curse_events for insert to authenticated with check (true); 
create policy "Curse Update" on public.curse_events for update to authenticated using (true);
create policy "Curse Delete" on public.curse_events for delete to authenticated using (true);

-- Map Event Policies (Seeker Manual Masks)
create policy "Manual Mask Insert" on public.map_events for insert to authenticated 
with check (auth.uid() = created_by and type = 'manual_mask');

-- Ban Policies
create policy "Ban Read" on public.game_bans for select to authenticated using (true);
create policy "Ban Insert" on public.game_bans for insert to authenticated with check (true);


-- 5. REALTIME PUBLICATION
alter publication supabase_realtime add table questions;
alter publication supabase_realtime add table curse_events;
alter publication supabase_realtime add table game_players;
alter publication supabase_realtime add table games;
alter publication supabase_realtime add table map_events;
alter publication supabase_realtime add table game_bans;

-- 6. FUNCTIONS (RPC)

-- RECORD FOUND (Ends Round)
create or replace function record_found(p_game_id uuid, p_seeker_id uuid)
returns void
language plpgsql security definer
as $$
declare
  v_game record;
  v_duration int;
begin
  select * into v_game from public.games where id = p_game_id;
  
  if v_game.head_start_released_at is null then
     v_duration := 0; 
  else
     v_duration := extract(epoch from (now() - v_game.head_start_released_at));
  end if;

  insert into public.game_rounds (game_id, hider_id, duration_seconds, found_by_user_id, round_number)
  values (p_game_id, v_game.hider_id, v_duration, p_seeker_id, coalesce(v_game.round_number, 1));

  update public.games
  set round_end_time = now(),
      status = 'ended'
  where id = p_game_id;
end;
$$;

-- START NEXT ROUND (Swaps Roles, Resets Board)
create or replace function start_next_round(p_game_id uuid, p_next_hider_id uuid)
returns void
language plpgsql security definer
as $$
declare
  v_current_hider uuid;
begin
  select hider_id into v_current_hider from public.games where id = p_game_id;

  -- Reset Game
  update public.games
  set status = 'active', 
      round_number = coalesce(round_number, 1) + 1,
      hider_id = p_next_hider_id,
      start_time = now(), 
      end_time = null,
      round_end_time = null,
      head_start_released_at = null,
      hiding_spot = null
  where id = p_game_id;
  
  -- Clean up
  delete from public.questions where game_id = p_game_id;
  delete from public.map_events where game_id = p_game_id and type != 'city_mask';
  delete from public.curse_events where game_id = p_game_id;
  delete from public.game_bans where game_id = p_game_id;

  -- Swap Roles
  update public.game_players
  set role = 'seeker'
  where game_id = p_game_id; -- Reset all to seeker first

  update public.game_players
  set role = 'hider'
  where game_id = p_game_id and user_id = p_next_hider_id;
end;
$$;

-- GET SEEKERS (Clean GeoJSON + Profiles)
drop function if exists get_game_seekers(uuid);
create or replace function get_game_seekers(p_game_id uuid)
returns table (
  user_id uuid, 
  location json,
  username text,
  avatar_url text
)
language plpgsql
security definer
as $$
begin
    return query
    select 
        gp.user_id, 
        st_asgeojson(gp.location)::json,
        p.username,
        p.avatar_url
    from public.game_players gp
    join public.profiles p on gp.user_id = p.id
    where gp.game_id = p_game_id 
    and gp.role = 'seeker'
    and gp.location is not null;
end;
$$;
