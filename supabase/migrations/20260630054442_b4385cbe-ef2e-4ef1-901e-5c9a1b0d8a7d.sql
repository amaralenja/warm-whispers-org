
-- 1. Categoria interna pra agrupar templates em blocos (call, vendas, etc.)
ALTER TABLE public.wa_templates
  ADD COLUMN IF NOT EXISTS grupo text NOT NULL DEFAULT 'geral';

UPDATE public.wa_templates
  SET grupo = 'call'
  WHERE slug IN ('lembrete_call_v2', 'comparecimento_call');

-- 2. Tabela de destinatários por template
CREATE TABLE IF NOT EXISTS public.wa_template_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.wa_templates(id) ON DELETE CASCADE,
  nome text,
  telefone text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, telefone)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_template_recipients TO authenticated;
GRANT ALL ON public.wa_template_recipients TO service_role;

ALTER TABLE public.wa_template_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_template_recipients_all_authenticated"
  ON public.wa_template_recipients FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_wa_template_recipients_updated_at
  BEFORE UPDATE ON public.wa_template_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_wa_template_recipients_template
  ON public.wa_template_recipients(template_id) WHERE ativo = true;

-- 3. Template novo: Analytics de Call (diário 22h)
INSERT INTO public.wa_templates (slug, nome, categoria, conteudo, descricao, vars, buttons, ativo, grupo)
VALUES (
  'analytics_call',
  'Analytics de Call',
  'UTILITY',
  E'📊 *Resumo do dia — {{data}}*\n\n✅ Show ups: *{{show_ups}}*\n❌ No shows: *{{no_shows}}*\n🔄 Remarcadas: *{{remarcadas}}*\n📞 Total de calls: *{{total_calls}}*\n💰 Faturamento: *{{faturamento}}*\n📈 Taxa de comparecimento: *{{taxa_show}}*\n\n🧠 *Diagnóstico do dia:*\n{{diagnostico}}',
  'Enviado todos os dias às 22h com o diagnóstico completo do dia (calls, comparecimento, faturamento e análise da IA).',
  ARRAY['data','show_ups','no_shows','remarcadas','total_calls','faturamento','taxa_show','diagnostico']::text[],
  '[]'::jsonb,
  true,
  'call'
);
