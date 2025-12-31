-- ==========================================
-- JETLAG APP - MASTER DATABASE SETUP SCRIPT
-- ==========================================
-- Run this script in the Supabase SQL Editor to fully initialize or update your database.
-- It works idempotently (safe to run multiple times).

-- 1. EXTENSIONS
create extension if not exists postgis;

-- 2. TABLES

-- PROFILES
create table if not exists public.profiles (
  id uuid references auth.users not null primary key,
  username text unique not null,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- GAMES
-- Create types safely
do $$ begin
    create type game_status as enum ('lobby', 'active', 'paused', 'ended');
exception
    when duplicate_object then null;
end $$;

create table if not exists public.games (
  id uuid default gen_random_uuid() primary key,
  status game_status default 'lobby'::game_status not null,
  hider_id uuid references public.profiles(id),
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  game_code text unique,
  config jsonb default '{}'::jsonb -- Added Config
);

-- Ensure config column exists if table already valid
do $$ 
begin 
  alter table public.games add column if not exists config jsonb default '{}'::jsonb; 
exception 
  when duplicate_column then null; 
end $$;

-- GAME_PLAYERS
do $$ begin
    create type player_role as enum ('hider', 'seeker', 'spectator');
exception
    when duplicate_object then null;
end $$;

create table if not exists public.game_players (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references public.games(id) on delete cascade not null,
  user_id uuid references public.profiles(id) not null,
  role player_role default 'spectator'::player_role not null,
  location geography(POINT, 4326), 
  last_seen timestamp with time zone default now(),
  battery_level int,
  transport_mode text default 'walking',
  unique(game_id, user_id)
);

-- QUESTIONS
do $$ begin
    create type question_category as enum ('matching', 'measuring', 'thermometer', 'radar', 'tentacles', 'photos');
exception
    when duplicate_object then null;
end $$;

do $$ begin
    create type question_status as enum ('draft', 'pending_veto', 'open', 'answered', 'vetoed');
exception
    when duplicate_object then null;
end $$;

create table if not exists public.questions (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references public.games(id) on delete cascade not null,
  seeker_id uuid references public.profiles(id) not null, 
  category question_category not null,
  question_text text not null,
  params jsonb default '{}'::jsonb,
  status question_status default 'draft'::question_status not null,
  answer_text text,
  answer_blob_url text, 
  answered_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

-- MAP_EVENTS
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

-- CURSE_EVENTS (Added Feature)
create table if not exists public.curse_events (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references public.games(id) on delete cascade not null,
  player_id uuid references public.profiles(id) on delete cascade not null,
  card_def_id text not null,
  input_data jsonb,
  status text default 'active',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. ROW LEVEL SECURITY (RLS)
alter table profiles enable row level security;
alter table games enable row level security;
alter table game_players enable row level security;
alter table questions enable row level security;
alter table map_events enable row level security;
alter table curse_events enable row level security;

-- Wipe existing policies to ensure clean state (optional but safer for updates)
-- We wrap in DO block to ignore errors if they don't exist
do $$ begin
  drop policy if exists "Allow all read" on profiles;
  drop policy if exists "Allow auth insert" on profiles;
  drop policy if exists "Allow auth update" on profiles;
  drop policy if exists "Allow all read" on games;
  drop policy if exists "Allow auth insert" on games;
  drop policy if exists "Allow auth update" on games;
  drop policy if exists "Allow all read" on game_players;
  drop policy if exists "Allow auth insert" on game_players;
  drop policy if exists "Allow auth update" on game_players;
  drop policy if exists "Allow all read" on map_events;
  drop policy if exists "Allow all read" on questions;
  drop policy if exists "Allow auth insert" on questions;
  drop policy if exists "Allow auth update on questions" on questions;
  drop policy if exists "Players can view curses in their game" on curse_events;
  drop policy if exists "Players can cast curses" on curse_events;
  drop policy if exists "Players can update their own curses" on curse_events;
end $$;

-- Create Policies

-- Profiles
create policy "Allow all read" on profiles for select using (true);
create policy "Allow auth insert" on profiles for insert with check (auth.uid() = id);
create policy "Allow auth update" on profiles for update using (auth.uid() = id);

-- Games
create policy "Allow all read" on games for select using (true);
create policy "Allow auth insert" on games for insert with check (auth.uid() = hider_id);
-- CORRECTED Update Policy: Any player in the game can update it
create policy "Allow auth update" on games for update using (
  exists (
    select 1 from game_players 
    where game_players.game_id = games.id 
    and game_players.user_id = auth.uid()
  )
);

-- Game Players
create policy "Allow all read" on game_players for select using (true);
create policy "Allow auth insert" on game_players for insert with check (auth.uid() = user_id);
create policy "Allow auth update" on game_players for update using (auth.uid() = user_id); 

-- Questions / Map Events
create policy "Allow all read" on map_events for select using (true);
create policy "Allow all read" on questions for select using (true);
create policy "Allow auth insert" on questions for insert with check (auth.uid() = seeker_id);
-- Note: Questions update policy was missing in original schema, adding basic one for Hider answering
create policy "Allow auth update on questions" on questions for update using (
   exists (
    select 1 from game_players
    where game_players.game_id = questions.game_id
    and game_players.user_id = auth.uid()
  )
);

-- Curses (With CORRECTED 'user_id' check)
create policy "Players can view curses in their game" on curse_events for select to authenticated using (
  exists (
    select 1 from public.game_players gp
    where gp.game_id = curse_events.game_id
    and gp.user_id = auth.uid() -- FIXED from player_id
  )
);

create policy "Players can cast curses" on curse_events for insert to authenticated with check (
   exists (
    select 1 from public.game_players gp
    where gp.game_id = curse_events.game_id
    and gp.user_id = auth.uid() -- FIXED from player_id
  )
);

create policy "Players can update their own curses" on curse_events for update to authenticated using (
    exists (
    select 1 from public.game_players gp
    where gp.game_id = curse_events.game_id
    and gp.user_id = auth.uid() -- FIXED from player_id
  )
);


-- 4. REALTIME ENABLEMENT
-- Add tables to publication, ignoring errors if already added
do $$ begin
  alter publication supabase_realtime add table questions;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table curse_events;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table game_players;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table games;
exception when others then null; end $$;

-- FINISHED
