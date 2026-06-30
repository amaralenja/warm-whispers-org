
-- Adiciona coluna 'buttons' se não existir
ALTER TABLE public.wa_templates ADD COLUMN IF NOT EXISTS buttons jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Atualiza o lembrete: texto simples, sem botões, sem variável de convidados
UPDATE public.wa_templates
SET
  nome = 'Lembrete de Call',
  descricao = 'Aviso enviado 30 minutos antes da call agendada.',
  conteudo = 'Ó, só pra avisar, chefe! 👋

Você tem uma call com {{nome}} daqui a 30 minutos, às {{hora}}.

Tô passando só pra lembrar. Te vejo lá!',
  vars = ARRAY['nome','hora'],
  buttons = '[]'::jsonb
WHERE slug = 'lembrete_call';

-- Novo template de comparecimento, enviado no exato momento da call
INSERT INTO public.wa_templates (slug, nome, descricao, conteudo, vars, categoria, buttons)
VALUES (
  'comparecimento_call',
  'Comparecimento de Call',
  'Enviado no horário exato da call para registrar o comparecimento.',
  'E aí, chefe! 🎯

Sua call com {{nome}} tá começando agora ({{hora}}).

Me conta: a pessoa apareceu?',
  ARRAY['nome','hora'],
  'notification',
  '[
    {"id":"showup","label":"✅ Show up"},
    {"id":"noshow","label":"❌ No show"},
    {"id":"remarcada","label":"🔄 Call remarcada"}
  ]'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  conteudo = EXCLUDED.conteudo,
  vars = EXCLUDED.vars,
  buttons = EXCLUDED.buttons;
