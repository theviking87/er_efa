# Modelo de Dados — Formação ER v1.0

31 tabelas em 22 migrações sequenciais (`supabase/migrations/`). RLS ativa em todas com policy `auth all USING (true)` (modelo unipessoal).

## Diagrama de domínios

```
┌──────────────────────────────────────────────────────────┐
│                       PROJETOS                           │
│  projetos (id, codigo, nome, ano, estado)                │
└─────────────┬────────────────────────────────────────────┘
              │ 1:N
┌─────────────▼─────────────────────────────────────────────┐
│                        CURSOS                             │
│  cursos → curso_ufcds → curso_ufcd_formadores            │
│         ↘ curso_formandos → curso_formando_ufcds         │
│         ↘ sessoes → formando_faltas                      │
│         ↘ curso_ferias, cronograma_observacoes           │
└───────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────┐
│  RECURSOS HUMANOS                                         │
│  formadores → formador_ufcds, formador_disponibilidades,  │
│               formador_inatividades, formador_documentos  │
│  formandos  → formando_pra                                │
│  ufcds      (catálogo global de UFCDs)                    │
└───────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────┐
│  FINANCEIRO                                               │
│  fin_configuracao_global      (singleton)                 │
│  fin_rubricas → fin_rubrica_regras (por vigência)         │
│  fin_formador_config                                      │
│  fin_formando_rubricas       (opt-in por rubrica)         │
│  financeiro_processamentos → snapshot JSONB               │
│  financeiro_honorarios       (linhas emitidas)            │
│  fin_alertas, fin_auditoria                               │
│  fin_utilizadores            (bootstrap do login)         │
└───────────────────────────────────────────────────────────┘
```

## Núcleo — Projetos e Cursos

| Tabela | PK | Colunas-chave |
|---|---|---|
| `projetos` | id | codigo, nome, ano, estado, orcamento |
| `cursos` | id | projeto_id → projetos, codigo, nome, estado, data_inicio, data_fim |
| `curso_ufcds` | id | curso_id, ufcd_id, ordem, horas |
| `curso_ufcd_formadores` | id | curso_ufcd_id, formador_id (>1 registo = múltiplos formadores, aciona alerta) |
| `curso_formandos` | id | curso_id, formando_id, situacao |
| `curso_formando_ufcds` | id | curso_formando_id, curso_ufcd_id (opt-out granular) |
| `sessoes` | id | curso_ufcd_id, formador_id, data, hora_inicio, hora_fim, horas |
| `formando_faltas` | id | curso_formando_id, sessao_id, data, horas, justificada |
| `curso_ferias` | id | curso_id, data_inicio, data_fim |
| `cronograma_observacoes` | id | curso_id, data, texto |

## Catálogos

| Tabela | Notas |
|---|---|
| `ufcds` | catálogo global (codigo, nome, horas, area) |
| `formadores` | dados base (nome, nif, email, iban) |
| `formandos` | dados base (nome, nif, email, iban, contactos) |
| `formador_ufcds` | competências (formador × ufcd) |
| `formador_disponibilidades` | por dia/hora |
| `formador_inatividades` | períodos indisponíveis |
| `formador_documentos` | anexos (bucket `formador-documentos`) |
| `formando_pra` | plano recuperação aprendizagem (bucket `formando-pra`) |

## Financeiro

### Configuração
- **`fin_configuracao_global`** — singleton com valores default (bolsa/hora BF1/BF2/BFM, SA/dia, km/km, dias mínimos SA, retenção IRS, IVA).
- **`fin_rubricas`** — catálogo de rubricas (BF1, BF2, BFM, SA, KM, HON, …). Codigo único.
- **`fin_rubrica_regras`** — valores por vigência (`data_inicio`, `data_fim`, `valor`, `dias_minimos`). Motor escolhe a regra mais recente ativa no mês processado.

### Por entidade
- **`fin_formando_rubricas`** — opt-in por formando (tem direito a Bolsa? qual escalão? SA? KM?).
- **`fin_formador_config`** — valor/hora, regime (recibo verde vs contrato), retenção IRS, IVA aplicável.

### Processamento
- **`financeiro_processamentos`** — 1 linha por (ano, mês, curso, projeto). Estados: `rascunho`, `fechado`. Guarda `snapshot JSONB` com o `ResultadoCalculo` completo (bolsas, subsidios, quilometros, honorarios, totais).
- **`financeiro_honorarios`** — linhas de nota de honorários emitidas (formador, mês/UFCD, valor, IRS, IVA, SS, total).

### Governance
- **`fin_alertas`** — validações do motor (nivel: `bloqueante`/`aviso`, codigo, mensagem, ref).
- **`fin_auditoria`** — trilha de escritas críticas (utilizador, ação, entidade, payload).
- **`fin_utilizadores`** — mapeia `auth.users.id` → nome/role interno.

## Regras de integridade

- `ON DELETE CASCADE` em toda a cadeia curso → ufcd/formando/sessão.
- `formando_faltas.sessao_id` é nullable (falta pode ser lançada sem sessão associada, para dias justificados).
- Todas as datas em `date`/`timestamptz` (nunca strings).
- IBANs, NIFs e emails são `text` livre (validação client-side no dialog).

## Migrações

- Numeração ISO: `YYYYMMDDHHMMSS_descricao.sql`.
- Correr `npm run migrations:bundle` após criar nova migração → regenera `src/lib/local-migrations.generated.ts` (bundle usado pelo PGlite offline).
- Nunca editar migrações antigas — criar nova.

## Notas RC v1.0

- Tabela `configuracao_financeira` (legada) foi eliminada na Fase B — substituída por `fin_configuracao_global`.
- Não usar `supabaseAdmin` em código de cliente. Zero secrets em `src/`.
