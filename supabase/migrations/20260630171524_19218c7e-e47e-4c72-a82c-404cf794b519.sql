ALTER TABLE public.wa_call_reminders ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.wa_messages ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.wa_task_notifications ADD COLUMN IF NOT EXISTS error_message text;