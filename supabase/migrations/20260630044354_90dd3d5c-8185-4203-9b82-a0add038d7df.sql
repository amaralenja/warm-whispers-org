
ALTER TABLE public.wa_channels ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'chat';

CREATE TABLE IF NOT EXISTS public.wa_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,
  descricao text,
  conteudo text NOT NULL,
  vars text[] NOT NULL DEFAULT '{}',
  categoria text NOT NULL DEFAULT 'notification',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_templates TO authenticated;
GRANT ALL ON public.wa_templates TO service_role;

ALTER TABLE public.wa_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_templates_all_authenticated" ON public.wa_templates;
CREATE POLICY "wa_templates_all_authenticated" ON public.wa_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER wa_templates_set_updated_at
  BEFORE UPDATE ON public.wa_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.wa_templates (slug, nome, descricao, conteudo, vars, categoria)
VALUES (
  'lembrete_call',
  'Lembrete de Call',
  'Aviso enviado 30 minutos antes da call agendada.',
  'Olá {{nome}}! 👋

Passando pra lembrar da nossa call marcada para as *{{hora}}*.

Vou te enviar o link daqui a pouco. Te espero!',
  ARRAY['nome','hora'],
  'notification'
)
ON CONFLICT (slug) DO NOTHING;
