ALTER TABLE public.vendas REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vendas;
GRANT SELECT ON public.vendas TO anon;