
-- 1) Processamentos: novo estado + colunas de totais e snapshot
ALTER TABLE public.financeiro_processamentos
  DROP CONSTRAINT IF EXISTS financeiro_processamentos_estado_check;
ALTER TABLE public.financeiro_processamentos
  ADD CONSTRAINT financeiro_processamentos_estado_check
  CHECK (estado IN ('aberto','calculado','fechado'));

ALTER TABLE public.financeiro_processamentos
  ADD COLUMN IF NOT EXISTS fechado_por text,
  ADD COLUMN IF NOT EXISTS total_bolsas numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_subsidios numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_km numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_honorarios numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_geral numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS snapshot jsonb;

-- 2) Linhas: valor aprovado + memória de cálculo (+ teto na bolsa)
ALTER TABLE public.financeiro_bolsas
  ADD COLUMN IF NOT EXISTS valor_aprovado numeric(12,2),
  ADD COLUMN IF NOT EXISTS teto_aplicado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS memoria_calculo jsonb;

ALTER TABLE public.financeiro_subsidios
  ADD COLUMN IF NOT EXISTS valor_aprovado numeric(12,2),
  ADD COLUMN IF NOT EXISTS memoria_calculo jsonb;

ALTER TABLE public.financeiro_quilometros
  ADD COLUMN IF NOT EXISTS valor_aprovado numeric(12,2),
  ADD COLUMN IF NOT EXISTS memoria_calculo jsonb;

ALTER TABLE public.financeiro_honorarios
  ADD COLUMN IF NOT EXISTS valor_aprovado numeric(12,2),
  ADD COLUMN IF NOT EXISTS horas numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_hora numeric(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencao_irs numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seguranca_social numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS memoria_calculo jsonb;

-- 3) Trigger de bloqueio: impede alterações em linhas de processamento fechado
CREATE OR REPLACE FUNCTION public.fin_bloqueio_fechado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_estado text;
  v_proc_id uuid;
BEGIN
  v_proc_id := COALESCE(NEW.processamento_id, OLD.processamento_id);
  SELECT estado INTO v_estado FROM public.financeiro_processamentos WHERE id = v_proc_id;
  IF v_estado = 'fechado' THEN
    RAISE EXCEPTION 'Processamento fechado — alteracoes bloqueadas (%).', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_fb_bloqueio ON public.financeiro_bolsas;
CREATE TRIGGER trg_fb_bloqueio BEFORE UPDATE OR DELETE ON public.financeiro_bolsas
  FOR EACH ROW EXECUTE FUNCTION public.fin_bloqueio_fechado();

DROP TRIGGER IF EXISTS trg_fs_bloqueio ON public.financeiro_subsidios;
CREATE TRIGGER trg_fs_bloqueio BEFORE UPDATE OR DELETE ON public.financeiro_subsidios
  FOR EACH ROW EXECUTE FUNCTION public.fin_bloqueio_fechado();

DROP TRIGGER IF EXISTS trg_fq_bloqueio ON public.financeiro_quilometros;
CREATE TRIGGER trg_fq_bloqueio BEFORE UPDATE OR DELETE ON public.financeiro_quilometros
  FOR EACH ROW EXECUTE FUNCTION public.fin_bloqueio_fechado();

DROP TRIGGER IF EXISTS trg_fh_bloqueio ON public.financeiro_honorarios;
CREATE TRIGGER trg_fh_bloqueio BEFORE UPDATE OR DELETE ON public.financeiro_honorarios
  FOR EACH ROW EXECUTE FUNCTION public.fin_bloqueio_fechado();

-- 4) Seed condicional
DO $$
DECLARE
  v_bf1 uuid; v_bf2 uuid; v_bfm uuid; v_sa uuid; v_km uuid; v_hon uuid;
BEGIN
  IF (SELECT count(*) FROM public.fin_rubricas) = 0 THEN
    INSERT INTO public.fin_rubricas (codigo, descricao, categoria, ordem, gera_documento, gera_exportacao)
      VALUES ('BF1','Bolsa Formacao Tipo 1','Bolsa',10,false,true) RETURNING id INTO v_bf1;
    INSERT INTO public.fin_rubricas (codigo, descricao, categoria, ordem, gera_documento, gera_exportacao)
      VALUES ('BF2','Bolsa Formacao Tipo 2','Bolsa',20,false,true) RETURNING id INTO v_bf2;
    INSERT INTO public.fin_rubricas (codigo, descricao, categoria, ordem, gera_documento, gera_exportacao)
      VALUES ('BFM','Bolsa Formacao Majorada','Bolsa',30,false,true) RETURNING id INTO v_bfm;
    INSERT INTO public.fin_rubricas (codigo, descricao, categoria, ordem, gera_documento, gera_exportacao)
      VALUES ('SA','Subsidio de Alimentacao','Subsídio',40,false,true) RETURNING id INTO v_sa;
    INSERT INTO public.fin_rubricas (codigo, descricao, categoria, ordem, gera_documento, gera_exportacao)
      VALUES ('KM','Quilometros','Deslocação',50,false,true) RETURNING id INTO v_km;
    INSERT INTO public.fin_rubricas (codigo, descricao, categoria, ordem, gera_documento, gera_exportacao, permite_edicao_manual)
      VALUES ('HON','Honorarios','Honorários',60,true,true,true) RETURNING id INTO v_hon;

    -- Regras exemplo (valores parametrizáveis via /financeiro/regras)
    INSERT INTO public.fin_rubrica_regras (rubrica_id, valor_unitario, valor_maximo, horas_referencia, permite_limite, observacoes)
      VALUES
      (v_bf1, 2.00, 200.00, 175, true, 'Seed exemplo. Editar em Regras.'),
      (v_bf2, 2.50, 250.00, 175, true, 'Seed exemplo. Editar em Regras.'),
      (v_bfm, 3.00, 300.00, 175, true, 'Seed exemplo. Editar em Regras.'),
      (v_sa,  6.00, NULL,   NULL, false, 'Valor diario. Dias minimos por dia definidos na regra.'),
      (v_km,  0.36, 150.00, NULL, true, 'Valor por Km (ida e volta). Teto mensal.'),
      (v_hon, 25.00, NULL,  NULL, false, 'Valor/hora base para honorarios avulsos.');

    -- dias_minimos por presença diária para o subsídio de alimentação
    UPDATE public.fin_rubrica_regras SET dias_minimos = 3 WHERE rubrica_id = v_sa;
  END IF;
END $$;
