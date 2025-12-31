-- Computed Column for PostgREST to expose hiding_spot as GeoJSON
-- Usage: select=*,hiding_spot_json

create or replace function hiding_spot_json(g games)
returns json
language sql
stable
as $$
  select st_asgeojson(g.hiding_spot)::json;
$$;
