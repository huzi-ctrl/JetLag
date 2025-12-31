-- Enable Realtime for questions table explicitly
alter publication supabase_realtime add table questions;
alter publication supabase_realtime add table curse_events;
alter publication supabase_realtime add table game_players;
alter publication supabase_realtime add table games;

-- Just in case
commit;
