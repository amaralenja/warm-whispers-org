
-- Permite ao worker do fluxo (que roda com chave publishable = role anon no sandbox)
-- gerenciar leads e ler tags, igual já é feito para wa_flow_runs/executions/conversations.
GRANT SELECT, INSERT, UPDATE ON public.crm_leads TO anon;
GRANT SELECT ON public.crm_tags TO anon;
GRANT SELECT ON public.wa_channels TO anon;
GRANT SELECT ON public.wa_conversations TO anon;

CREATE POLICY "Worker can select crm_leads"
  ON public.crm_leads FOR SELECT TO anon USING (true);

CREATE POLICY "Worker can insert crm_leads"
  ON public.crm_leads FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Worker can update crm_leads"
  ON public.crm_leads FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Worker can select crm_tags"
  ON public.crm_tags FOR SELECT TO anon USING (true);

CREATE POLICY "Worker can select wa_channels"
  ON public.wa_channels FOR SELECT TO anon USING (true);

CREATE POLICY "Worker can select wa_conversations"
  ON public.wa_conversations FOR SELECT TO anon USING (true);
