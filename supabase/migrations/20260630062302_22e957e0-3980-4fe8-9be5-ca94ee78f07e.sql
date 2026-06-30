
INSERT INTO public.wa_templates (slug, nome, conteudo, grupo)
VALUES (
  'analytics_ads',
  'Relatório Facebook Ads',
  E'📊 *Relatório Ads — {{periodo}}*\n\n💸 Investido: {{investido}}\n💰 Faturamento: {{faturamento}}\n📈 Lucro: {{lucro}}\n🎯 ROAS: {{roas}}\n\n🛒 Compras: {{compras}} | CPA: {{cpa}}\n🧲 Leads: {{leads}} | CPL: {{cpl}}\n\n👆 Cliques: {{cliques}} | CTR: {{ctr}}\n💵 CPC: {{cpc}} | CPM: {{cpm}}\n👀 Impressões: {{impressoes}} | Alcance: {{alcance}}\n\n🛍️ Add to cart: {{add_to_cart}} | Checkout: {{initiate_checkout}} | LPV: {{lpv}}\n\n📣 Campanhas ativas: {{campanhas_ativas}}/{{campanhas_total}}\n\n🏆 *Top campanhas*\n{{top_campanhas}}\n\n⚠️ *Atenção (CPA alto)*\n{{alertas_cpa}}\n\n🧠 *Diagnóstico*\n{{diagnostico}}',
  'analytics'
)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  conteudo = EXCLUDED.conteudo,
  grupo = EXCLUDED.grupo;
