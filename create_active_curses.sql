-- Create active_curses table
create table if not exists public.active_curses (
    id uuid not null default gen_random_uuid() primary key,
    game_id uuid not null references public.games(id) on delete cascade,
    curse_id text not null,
    name text not null,
    description text not null,
    image_url text, -- For curses that require an image evidence
    expires_at timestamp with time zone, -- For curses with time duration
    created_at timestamp with time zone default now() not null,
    metadata jsonb default '{}'::jsonb
);

-- Enable RLS
alter table public.active_curses enable row level security;

-- Policies
-- 1. Everyone in the game can view active curses
create policy "View active curses"
    on public.active_curses for select
    using (
        exists (
            select 1 from public.game_players
            where game_players.game_id = active_curses.game_id
            and game_players.user_id = auth.uid()
        )
    );

-- 2. Hiders (or anyone in game really, logic handles permissions) can insert
create policy "Insert active curses"
    on public.active_curses for insert
    with check (
        exists (
            select 1 from public.game_players
            where game_players.game_id = active_curses.game_id
            and game_players.user_id = auth.uid()
        )
    );

-- 3. Hiders can delete/update? (Usually we delete when expired or manually removed)
create policy "Modify active curses"
    on public.active_curses for all
    using (
        exists (
            select 1 from public.game_players
            where game_players.game_id = active_curses.game_id
            and game_players.user_id = auth.uid()
        )
    );

-- Enable Realtime
alter publication supabase_realtime add table public.active_curses;
