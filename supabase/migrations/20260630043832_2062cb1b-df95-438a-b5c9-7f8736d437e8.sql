
-- Team members (funcionários internos da empresa)
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text,
  funcao text,
  foto_url text,
  cor text DEFAULT '#6366f1',
  ativo boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_members all auth" ON public.team_members FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Task boards
CREATE TABLE public.task_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  cor text DEFAULT '#6366f1',
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_boards TO authenticated;
GRANT ALL ON public.task_boards TO service_role;
ALTER TABLE public.task_boards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_boards all auth" ON public.task_boards FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Task columns (colunas customizáveis por board)
CREATE TABLE public.task_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.task_boards(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cor text DEFAULT '#64748b',
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_columns TO authenticated;
GRANT ALL ON public.task_columns TO service_role;
ALTER TABLE public.task_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_columns all auth" ON public.task_columns FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tasks
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.task_boards(id) ON DELETE CASCADE,
  column_id uuid NOT NULL REFERENCES public.task_columns(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descricao text,
  prioridade text DEFAULT 'media', -- baixa | media | alta | urgente
  prazo timestamptz,
  assignee_ids uuid[] DEFAULT '{}',
  labels text[] DEFAULT '{}',
  checklist jsonb DEFAULT '[]'::jsonb,
  anexos jsonb DEFAULT '[]'::jsonb,
  ordem int NOT NULL DEFAULT 0,
  concluida boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks all auth" ON public.tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_tasks_board ON public.tasks(board_id);
CREATE INDEX idx_tasks_column ON public.tasks(column_id);
CREATE INDEX idx_task_columns_board ON public.task_columns(board_id);

CREATE TRIGGER trg_team_members_updated BEFORE UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_task_boards_updated BEFORE UPDATE ON public.task_boards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed: board padrão com colunas padrão
DO $$
DECLARE
  v_board uuid;
BEGIN
  INSERT INTO public.task_boards (nome, descricao, cor)
  VALUES ('Tarefas da Equipe', 'Quadro principal de tarefas', '#6366f1')
  RETURNING id INTO v_board;

  INSERT INTO public.task_columns (board_id, nome, cor, ordem) VALUES
    (v_board, 'A Fazer', '#64748b', 0),
    (v_board, 'Em Andamento', '#3b82f6', 1),
    (v_board, 'Em Revisão', '#f59e0b', 2),
    (v_board, 'Concluído', '#10b981', 3);
END $$;
