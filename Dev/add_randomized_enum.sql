-- Add 'randomized' to the question_status enum
-- This must be done inside a transaction block in some tools, but ALTER TYPE cannot run in a transaction block appropriately in all contexts.
-- However, Supabase SQL editor handles it.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type JOIN pg_enum ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'question_status' AND enumlabel = 'randomized') THEN
        ALTER TYPE question_status ADD VALUE 'randomized';
    END IF;
END$$;
