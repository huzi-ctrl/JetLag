-- Add columns for persisted scoring
alter table public.game_rounds add column if not exists final_score int;
alter table public.game_rounds add column if not exists score_breakdown jsonb;

-- Notify via comment
comment on column public.game_rounds.final_score is 'Calculated score (in seconds) including penalties and bonuses';

-- FIX: Add RLS Policy to allow updating scores
create policy "Update Rounds" on public.game_rounds for update to authenticated using (true);

