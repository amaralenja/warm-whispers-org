UPDATE public.wa_channels
SET kind = 'notification',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('kind','notification')
WHERE operacao_id = '__notificador__' AND COALESCE(kind,'chat') <> 'notification';