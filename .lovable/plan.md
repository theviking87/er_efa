
# Motor Financeiro — Fase 1

Ligar todos os módulos existentes (Projetos → Cursos → UFCD → Sessões → Faltas → Formandos → Rubricas) a um **motor de processamento mensal** único. Nada é reinventado: aproveitamos `fin_rubricas`, `fin_rubrica_regras`, `fin_formando_rubricas`, `fin_formador_config`, `fin_configuracao_global`, `financeiro_processamentos` e as tabelas de linhas (`financeiro_bolsas`, `_subsidios`, `_quilometros`, `_honorarios`). O objetivo é que o utilizador abra o wizard, escolha Projeto/Curso/Mês, e o sistema calcule tudo automaticamente.

## O que o utilizador vai ver

**Nova rota** `/financeiro/processamentos/novo` — wizard em 4 passos:

1. **Contexto** — Projeto (pré‑preenchido do global), Curso, Ano, Mês.
2. **Dados carregados** — resumo automático: formandos inscritos, sessões do mês, horas previstas, horas frequentadas (= previstas − faltas), rubricas atribuídas a cada formando, config global e config dos formadores das sessões.
3. **Validações** — lista de avisos bloqueantes vs. não bloqueantes (IBAN em falta, rubrica sem regra ativa, curso encerrado, sessões sem faltas registadas, config incompleta, regras expiradas).
4. **Cálculo & revisão** — tabela por formando × rubrica com valor calculado, valor aprovado editável, memória de cálculo (tooltip explicando como foi obtido), e totais gerais (Bolsas / Alimentação / Km / Honorários / Total).

Botões: **Guardar rascunho** (estado `aberto`, recalculável), **Fechar processamento** (só se sem erros bloqueantes; passa a `fechado`, imutável).

**Página existente** `/financeiro/processamentos` — passa a listar todos os processamentos com estado, totais agregados e ligação para ver/editar/reabrir (quando `aberto`) ou apenas visualizar (quando `fechado`).

**Dashboard** `/financeiro` — cartões passam a mostrar totais reais dos processamentos abertos/fechados do projeto ativo, últimos alertas e últimas entradas de auditoria (já existe a infraestrutura).

## Arquitetura (camadas)

```text
src/lib/financeiro/
  types.ts                     (já existe — só acrescento tipos do motor)
  engine/
    horas.ts                   calcula horas previstas/frequentadas por formando/mês
    contexto.ts                carrega o "snapshot" do processamento (formandos, sessões, faltas, rubricas, regras, configs)
    validacoes.ts              regras de validação (bloqueantes vs avisos)
    rubricas/
      index.ts                 registry: mapa código → função de cálculo
      bolsa.ts                 BF1 / BF2 / BFM  (valor_hora × horas, com teto mensal)
      alimentacao.ts           SA  (dias com ≥3h × valor_dia)
      quilometros.ts           KM  (dias de formação × km × valor_km, com teto)
      honorarios.ts            HON (sessões × horas × valor_hora do formador, IVA/IRS/SS)
    processamento.ts           orquestra: contexto → validações → calcula todas as rubricas → devolve resultado tipado
    persistencia.ts            escreve linhas nas tabelas financeiro_* dentro de uma transação; auditoria por linha
  services/                    (já existe — reutilizado sem alterações)
```

Regras de ouro:
- Componentes React só chamam `engine/processamento.ts` e `engine/persistencia.ts`. Zero SQL/cálculo em JSX.
- Cada rubrica implementa a mesma assinatura `calcular(contexto, formando, regra, override?) → LinhaCalculada`. Adicionar uma nova rubrica no futuro = criar um ficheiro e registá‑lo no `registry`, sem tocar no motor.
- Todo o `insert/update/delete` financeiro passa pelo helper de auditoria existente (`services/auditoria.ts`).

## Base de dados (migração mínima)

Só ajustes cirúrgicos; **não são criadas tabelas duplicadas**:

1. `financeiro_processamentos`
   - `estado` passa a aceitar também `calculado` (aberto → calculado → fechado).
   - Colunas novas: `fechado_por` (texto/nome), `total_bolsas`, `total_subsidios`, `total_km`, `total_honorarios`, `total_geral` (numeric), `snapshot jsonb` (memória de cálculo imutável ao fechar).
2. `financeiro_bolsas`
   - Colunas: `valor_aprovado numeric` (fica editável até fechar), `teto_aplicado boolean`, `memoria_calculo jsonb`.
3. `financeiro_subsidios`, `financeiro_quilometros`, `financeiro_honorarios`
   - Cada uma ganha `memoria_calculo jsonb` e `valor_aprovado numeric`.
4. Trigger `fin_bloqueio_fechado` em cada tabela `financeiro_*`: se o processamento pai estiver `fechado`, `RAISE EXCEPTION` em UPDATE/DELETE. Garante imutabilidade a nível de BD.
5. `fin_rubrica_regras` — sem alterações estruturais; passa a ser usado a fundo pelo engine (procura pela regra ativa em `data_inicio ≤ mês ≤ COALESCE(data_fim, ∞)`).

## Seed condicional (só se vazio)

Executado **apenas** se `SELECT count(*) FROM fin_rubricas = 0`. Cria:
- `BF1` Bolsa Formação Tipo 1
- `BF2` Bolsa Formação Tipo 2
- `BFM` Bolsa Formação Majorada
- `SA`  Subsídio Alimentação
- `KM`  Quilómetros
- `HON` Honorários

E uma regra ativa por rubrica com valores exemplo parametrizáveis (`valor_unitario`, `valor_maximo`, `dias_minimos`, `horas_referencia`). Todos editáveis em `/financeiro/regras` (página já existe).

## Fórmulas parametrizadas

- **Bolsa**: `horas_frequentadas × valor_hora`, limitado a `valor_maximo` mensal. Se aplicado, `teto_aplicado=true` e explicação no `memoria_calculo`.
- **Alimentação**: dias distintos em que o formando esteve ≥ `dias_minimos` horas presente (default 3) × `valor_unitario`.
- **Km**: dias com sessão × `km` do formando (campo já existente ou 0) × 2 (ida/volta) × `valor_unitario`, limitado a `valor_maximo`.
- **Honorários**: por formador com sessões no mês, `Σ horas × valor_hora` (de `fin_formador_config` ou tabela HON) + IVA + retenção IRS + SS conforme regime; nunca hardcoded.

Horas frequentadas = `Σ sessoes_do_mes.horas − Σ faltas.horas`, por formando (via `curso_formandos` → `formando_faltas`). Correções manuais registam motivo, utilizador e timestamp em auditoria.

## Validações (Passo 3)

Bloqueantes: curso arquivado, config global em falta, formando sem IBAN quando rubrica exige, rubrica atribuída sem regra ativa no período, horas frequentadas negativas.
Avisos: sessões sem faltas registadas (assume 100%), formador sem `fin_formador_config` (usa defaults), regra a expirar durante o mês.

## Fecho e auditoria

- `Fechar processamento` só executa se validações bloqueantes = 0.
- Grava `snapshot` completo, muda estado para `fechado`, e o trigger bloqueia futuras alterações. Reabrir cria nova versão (novo `processamento_id` com referência) — não sobrescreve.
- Cada linha alterada (valor aprovado, observação, correção manual de horas) gera registo em `fin_auditoria` com campo, valor anterior, valor novo, motivo e utilizador ativo (via `current-user.ts`).

## Componentes reutilizados

- `Card`, `Tabs`, `Table`, `Dialog`, `Badge` do shadcn (já em uso).
- `useProjetoAtivo` para pré‑seleção do projeto.
- `services/auditoria.ts`, `services/formando-rubricas.ts`, `services/formador-config.ts`, `services/config-global.ts` — sem alterações.
- Componente existente `formando-panel.tsx` para o drill‑down por formando dentro do wizard.

## Fora do âmbito desta fase

- Geração de PDFs por rubrica (Nota de Honorários já existe; recibos de bolsa ficam para v2).
- Reabertura formal com versionamento imutável completo (grava snapshot mas reabertura simples nesta fase).
- Exportação bancária SEPA.
- Dashboard financeiro global multi‑projeto (mantém filtro por projeto ativo).

## Entregáveis finais (relatório)

1. Serviços novos: `engine/{horas,contexto,validacoes,processamento,persistencia}.ts` + 4 rubricas.
2. Componentes alterados: `financeiro.processamentos.tsx`, `financeiro.index.tsx`, nova rota do wizard.
3. Reutilizados: todos os `services/*`, `formando-panel.tsx`, `utilizadores-card.tsx`.
4. Migração única: colunas extra + triggers de bloqueio + seed condicional.
5. Performance: uma única query por bloco (formandos, sessões, faltas, rubricas) em vez de N+1.
6. Faltas para v1.0: reabertura versionada, PDFs por rubrica, exportação bancária, dashboard multi‑projeto, testes automáticos do engine.
