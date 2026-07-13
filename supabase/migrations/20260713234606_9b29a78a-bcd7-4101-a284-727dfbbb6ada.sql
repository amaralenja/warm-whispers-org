-- Allow authenticated users (SDRs/closers) to insert leads manually via kanban
CREATE POLICY "authenticated insert ht_quiz_submissions"
ON public.ht_quiz_submissions
FOR INSERT
TO authenticated
WITH CHECK (true);

GRANT INSERT ON public.ht_quiz_submissions TO authenticated;