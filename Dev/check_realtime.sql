-- CHECK REALTIME STATUS
select * from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'active_curses';

-- Also check Replica Identity
select relname, relreplident from pg_class where relname = 'active_curses';
