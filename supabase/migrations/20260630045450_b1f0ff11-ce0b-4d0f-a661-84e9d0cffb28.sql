
ALTER TABLE public.wa_templates ADD COLUMN IF NOT EXISTS buttons jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.wa_templates
SET 
  conteudo = 'Olá {{nome}}! 👋

Passando pra confirmar nossa call marcada para as *{{hora}}*.

Convidados: {{convidados}}

Por favor, me confirma abaixo:',
  vars = ARRAY['nome','hora','convidados'],
  buttons = '[
    {"id":"showup","label":"✅ Estarei presente","type":"reply"},
    {"id":"noshow","label":"❌ Não vou conseguir","type":"reply"}
  ]'::jsonb
WHERE slug = 'lembrete_call';

CREATE TABLE IF NOT EXISTS public.wa_call_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  channel_id text,
  contact_wa text NOT NULL,
  lead_email text,
  lead_nome text,
  lead_externalid text,
  lead_fbp text,
  lead_fbc text,
  hora text,
  convidados text,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  replied_at timestamptz,
  wa_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_call_reminders_event_idx ON public.wa_call_reminders (event_id);
CREATE INDEX IF NOT EXISTS wa_call_reminders_status_idx ON public.wa_call_reminders (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_call_reminders TO authenticated;
GRANT ALL ON public.wa_call_reminders TO service_role;

ALTER TABLE public.wa_call_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_call_reminders_all_authenticated" ON public.wa_call_reminders;
CREATE POLICY "wa_call_reminders_all_authenticated" ON public.wa_call_reminders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS wa_call_reminders_set_updated_at ON public.wa_call_reminders;
CREATE TRIGGER wa_call_reminders_set_updated_at
  BEFORE UPDATE ON public.wa_call_reminders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
