GRANT INSERT ON public.ht_quiz_submissions TO anon;

CREATE POLICY "anon insert ht_quiz_submissions"
ON public.ht_quiz_submissions FOR INSERT TO anon
WITH CHECK (true);
