GRANT SELECT ON public.ht_quiz_submissions TO anon;

CREATE POLICY "anon read ht_quiz_submissions"
ON public.ht_quiz_submissions
FOR SELECT
TO anon
USING (true);