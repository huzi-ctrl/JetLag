-- Enable RLS on map_events (redundant if already on, but safe)
ALTER TABLE public.map_events ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert 'manual_mask' events
-- They can only insert rows where they are the Creator
CREATE POLICY "Enable insert for manual masks"
ON public.map_events
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = created_by 
    AND type = 'manual_mask'
);

-- Ensure they can DELETE their own masks too (optional but good for cleanup later)
CREATE POLICY "Enable delete for own manual masks"
ON public.map_events
FOR DELETE
TO authenticated
USING (
    auth.uid() = created_by 
    AND type = 'manual_mask'
);
