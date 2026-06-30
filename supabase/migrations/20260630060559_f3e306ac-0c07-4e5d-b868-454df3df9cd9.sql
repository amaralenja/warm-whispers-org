-- Task notification dedupe table
CREATE TABLE IF NOT EXISTS public.wa_task_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  member_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('created','due_soon','overdue')),
  channel_id text,
  contact_wa text NOT NULL,
  wa_message_id text,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wa_task_notifications_uniq
  ON public.wa_task_notifications(task_id, member_id, kind);
CREATE INDEX IF NOT EXISTS wa_task_notifications_task_idx
  ON public.wa_task_notifications(task_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_task_notifications TO authenticated;
GRANT ALL ON public.wa_task_notifications TO service_role;

ALTER TABLE public.wa_task_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full access task notifs" ON public.wa_task_notifications
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed task templates
INSERT INTO public.wa_templates (slug, nome, grupo, conteudo, buttons, meta_status)
VALUES
  (
    'task_created',
    'Tarefa criada',
    'task',
    E'🎯 Nova tarefa pra você: *{{titulo}}*\n\nPrioridade: {{prioridade}}\nCriada em: {{criada}}\nPrazo: {{prazo}}\n\nBora entregar.',
    '[]'::jsonb,
    'PENDING'
  ),
  (
    'task_due_soon',
    'Tarefa perto de vencer',
    'task',
    E'⏰ Atenção! A tarefa *{{titulo}}* vence em 1 dia ({{prazo}}). Não esquece de fechar essa.',
    '[]'::jsonb,
    'PENDING'
  ),
  (
    'task_overdue',
    'Tarefa vencida',
    'task',
    E'🚨 Tarefa atrasada: *{{titulo}}* venceu em {{prazo}}. Atualiza aí pra gente saber como tá.',
    '[]'::jsonb,
    'PENDING'
  )
ON CONFLICT (slug) DO NOTHING;
