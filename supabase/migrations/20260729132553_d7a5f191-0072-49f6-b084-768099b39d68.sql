
CREATE TABLE public.despesa_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.despesa_categorias TO authenticated;
GRANT ALL ON public.despesa_categorias TO service_role;
ALTER TABLE public.despesa_categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full despesa_categorias" ON public.despesa_categorias FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_despesa_categorias_updated_at BEFORE UPDATE ON public.despesa_categorias FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.despesa_categorias (nome, ordem) VALUES
  ('Alimentação', 1),
  ('Material', 2),
  ('Roupa/EPI', 3),
  ('Deslocações', 4),
  ('Outros', 5);

CREATE TABLE public.despesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  curso_id uuid REFERENCES public.cursos(id) ON DELETE SET NULL,
  categoria_id uuid NOT NULL REFERENCES public.despesa_categorias(id) ON DELETE RESTRICT,
  data date NOT NULL DEFAULT CURRENT_DATE,
  descricao text NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  fornecedor text,
  nif text,
  anexo_storage_path text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.despesas TO authenticated;
GRANT ALL ON public.despesas TO service_role;
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full despesas" ON public.despesas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_despesas_updated_at BEFORE UPDATE ON public.despesas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_despesas_projeto ON public.despesas(projeto_id);
CREATE INDEX idx_despesas_curso ON public.despesas(curso_id);
CREATE INDEX idx_despesas_data ON public.despesas(data);
