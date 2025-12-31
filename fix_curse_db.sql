-- Comprehensive Fix for Jetlag Curse Mechanics
-- Run this in the Supabase SQL Editor

-- 1. Fix Enum (Safe Add)
DO $$
BEGIN
    ALTER TYPE question_category ADD VALUE IF NOT EXISTS 'travel_agent';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Relax Questions Table RLS (Nuclear Option for Debugging/Beta)
-- We need Hiders (who are just auth users) to be able to insert 'deduction' questions.
-- The previous logic might have been too strict or checking the wrong role table.

DROP POLICY IF EXISTS "Allow auth insert" ON questions;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON questions;
DROP POLICY IF EXISTS "policy_allow_insert_if_hider" ON questions;

-- Create a blanket "Allow Answer/Insert" policy for any logged in player
CREATE POLICY "Allow All Insert" ON questions 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Ensure Update is also allowed (for answering)
DROP POLICY IF EXISTS "Allow auth update" ON questions;
CREATE POLICY "Allow All Update" ON questions 
FOR UPDATE
TO authenticated
USING (true);

-- 3. Ensure Permissions
GRANT ALL ON TABLE questions TO authenticated;
-- questions table uses UUID (gen_random_uuid) so no sequence grant needed


-- 4. Verify Active Curses Table exists (Just in case)
CREATE TABLE IF NOT EXISTS active_curses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    curse_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    metadata JSONB DEFAULT '{}',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on active_curses but keep it open for now
ALTER TABLE active_curses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all active_curses" ON active_curses;
CREATE POLICY "Allow all active_curses" ON active_curses
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

GRANT ALL ON TABLE active_curses TO authenticated;
