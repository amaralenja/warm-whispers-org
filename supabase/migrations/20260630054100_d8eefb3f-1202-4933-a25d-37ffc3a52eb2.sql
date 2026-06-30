DELETE FROM public.wa_templates WHERE slug = 'lembrete_call';

INSERT INTO public.wa_templates (slug, nome, categoria, conteudo, descricao, vars, buttons, ativo)
VALUES (
  'lembrete_call_v2',
  'Lembrete de Call',
  'UTILITY',
  E'Opa, chefe! 🔔\n\nSó passando pra te lembrar: você tem uma call marcada com *{{nome}}* daqui a 30 minutos, às *{{hora}}*.\n\nJá deixa tudo pronto que tô torcendo aqui pra fechar mais essa! 🚀',
  'Lembrete enviado 30 minutos antes da call agendada.',
  ARRAY['nome','hora']::text[],
  '[]'::jsonb,
  true
);