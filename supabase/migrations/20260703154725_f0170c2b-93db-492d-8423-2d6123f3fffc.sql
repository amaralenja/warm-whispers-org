CREATE POLICY "Worker can update flow runs"
ON public.wa_flow_runs
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

CREATE POLICY "Worker can insert flow executions"
ON public.wa_flow_executions
FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Worker can insert wa messages"
ON public.wa_messages
FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Worker can update wa conversations"
ON public.wa_conversations
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

GRANT UPDATE ON public.wa_flow_runs TO anon;
GRANT INSERT ON public.wa_flow_executions TO anon;
GRANT INSERT ON public.wa_messages TO anon;
GRANT UPDATE ON public.wa_conversations TO anon;