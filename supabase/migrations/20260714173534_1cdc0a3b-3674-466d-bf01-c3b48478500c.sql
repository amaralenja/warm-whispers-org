-- Permitir leitura de ht_team para anon (SDR/Closer logam via código, não via auth.users)
-- Sem isso, o SDR não vê a lista de closers para agendar call, e o Kanban do closer
-- não consegue resolver a lista de membros do time.

CREATE POLICY "Public read ht_team"
ON public.ht_team
FOR SELECT
TO anon
USING (true);

GRANT SELECT ON public.ht_team TO anon;