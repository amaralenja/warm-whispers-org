CREATE INDEX IF NOT EXISTS wa_messages_created_id_not_deleted_idx
ON public.wa_messages (created_at, id)
INCLUDE (conversation_id, channel_id, direction, sent_by)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS wa_messages_channel_created_id_not_deleted_idx
ON public.wa_messages (channel_id, created_at, id)
INCLUDE (conversation_id, direction, sent_by)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS wa_conversations_channel_last_created_idx
ON public.wa_conversations (channel_id, last_message_at DESC, created_at DESC)
INCLUDE (contact_wa_id, operacao_id, assigned_vendor_id);

CREATE INDEX IF NOT EXISTS wa_conversations_channel_created_idx
ON public.wa_conversations (channel_id, created_at DESC)
INCLUDE (contact_wa_id, operacao_id, assigned_vendor_id, last_message_at);

CREATE INDEX IF NOT EXISTS vendas_evento_data_utm_idx
ON public.vendas ("Evento", "Data", "UTM")
INCLUDE ("Ticket", "Produto", nome_expert, tipo_produto);