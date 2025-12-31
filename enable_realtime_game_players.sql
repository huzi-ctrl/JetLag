-- Enable Realtime for game_players
begin;
  -- Add to publication if not already present (idempotent-ish)
  drop publication if exists supabase_realtime;
  create publication supabase_realtime for table public.games, public.game_players, public.questions, public.map_events, public.curse_events;
commit;

-- Set Replica Identity
alter table public.game_players replica identity full;
