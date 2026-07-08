
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_boards TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_columns TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO anon;
GRANT SELECT ON public.team_members TO anon;
GRANT SELECT ON public.vendedores TO anon;

CREATE POLICY "task_boards anon access" ON public.task_boards FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "task_columns anon access" ON public.task_columns FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "tasks anon access" ON public.tasks FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "team_members anon select" ON public.team_members FOR SELECT TO anon USING (true);
CREATE POLICY "vendedores anon select" ON public.vendedores FOR SELECT TO anon USING (true);
