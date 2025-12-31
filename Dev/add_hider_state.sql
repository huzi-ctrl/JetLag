-- Add hider_state column to games table to persist deck/hand
ALTER TABLE games 
ADD COLUMN IF NOT EXISTS hider_state JSONB DEFAULT '{}'::jsonb;
