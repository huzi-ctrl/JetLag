-- Computed Column for game_players location
-- Usage: select=*,location_json

create or replace function location_json(gp game_players)
returns json
language sql
stable
as $$
  select st_asgeojson(gp.location)::json;
$$;
