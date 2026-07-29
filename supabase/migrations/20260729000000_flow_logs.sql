-- Flow execution logs for debugging
CREATE TABLE IF NOT EXISTS public.wa_flow_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_run_id uuid NOT NULL,
  conversation_id uuid,
  event text NOT NULL,
  node_id text,
  node_type text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_flow_logs_run_idx ON public.wa_flow_logs(flow_run_id);
CREATE INDEX IF NOT EXISTS wa_flow_logs_conv_idx ON public.wa_flow_logs(conversation_id);

ALTER TABLE public.wa_flow_logs DROP CONSTRAINT IF EXISTS wa_flow_logs_flow_run_id_fkey;
ALTER TABLE public.wa_flow_logs DROP CONSTRAINT IF EXISTS wa_flow_logs_conversation_id_fkey;

