
-- 1) Tabela projetos
CREATE TYPE public.projeto_estado AS ENUM ('planeado','ativo','concluido','arquivado');

CREATE TABLE public.projetos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  descricao text,
  entidade_promotora text,
  programa_financiamento text,
  data_inicio date,
  data_fim date,
  estado public.projeto_estado NOT NULL DEFAULT 'ativo',
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projetos TO authenticated;
GRANT ALL ON public.projetos TO service_role;
ALTER TABLE public.projetos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projetos leitura autenticada" ON public.projetos FOR SELECT TO authenticated USING (true);
CREATE POLICY "projetos escrita autenticada" ON public.projetos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_projetos_updated_at BEFORE UPDATE ON public.projetos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Projeto por defeito para migração
INSERT INTO public.projetos (codigo, nome, descricao, estado)
VALUES ('DEFAULT', 'Projeto principal', 'Projeto criado automaticamente para dados existentes.', 'ativo');

-- 3) cursos.projeto_id
ALTER TABLE public.cursos ADD COLUMN projeto_id uuid REFERENCES public.projetos(id) ON DELETE RESTRICT;
UPDATE public.cursos SET projeto_id = (SELECT id FROM public.projetos WHERE codigo='DEFAULT') WHERE projeto_id IS NULL;
CREATE INDEX idx_cursos_projeto_id ON public.cursos(projeto_id);

-- 4) financeiro_processamentos.projeto_id
ALTER TABLE public.financeiro_processamentos ADD COLUMN projeto_id uuid REFERENCES public.projetos(id) ON DELETE RESTRICT;
UPDATE public.financeiro_processamentos p
SET projeto_id = COALESCE(
  (SELECT c.projeto_id FROM public.cursos c WHERE c.id = p.curso_id),
  (SELECT id FROM public.projetos WHERE codigo='DEFAULT')
) WHERE projeto_id IS NULL;
CREATE INDEX idx_fin_proc_projeto_id ON public.financeiro_processamentos(projeto_id);
