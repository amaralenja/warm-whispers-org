-- Flow execution logs for debugging
CREATE TABLE IF NOT EXISTS public.wa_flow_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_run_id uuid NOT NULL REFERENCES public.wa_flow_runs(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.wa_conversations(id) ON DELETE SET NULL,
  event text NOT NULL, -- 'started', 'node_sent', 'node_failed', 'paused', 'resumed', 'completed', 'failed', 'cancelled'
  node_id text,
  node_type text,
  detail text, -- message preview or error detail
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_flow_logs_run_idx ON public.wa_flow_logs(flow_run_id);
CREATE INDEX IF NOT EXISTS wa_flow_logs_conv_idx ON public.wa_flow_logs(conversation_id);
