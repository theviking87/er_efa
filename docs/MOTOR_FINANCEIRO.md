# Motor Financeiro — Formação ER v1.0

O motor calcula bolsas, subsídios, quilómetros e honorários para um `(ano, mês, curso, projeto)`, produz validações e persiste um snapshot imutável.

## Pipeline

```
Chave (ano, mês, cursoId, projetoId)
        │
        ▼
┌───────────────┐
│  contexto.ts  │  bulk-load: curso, config global, formandos,
└───────┬───────┘  sessões, faltas, formadores, rubricas,
        │          regras ativas no mês, atribuições opt-in
        ▼
┌───────────────┐
│   horas.ts    │  para cada formando: horas previstas × frequentadas
└───────┬───────┘  descontando faltas; conta dias com ≥ N horas
        │
        ▼
┌───────────────┐
│ validacoes.ts │  regras de negócio → Validacao[]
└───────┬───────┘  (bloqueante vs aviso)
        │
        ▼
┌───────────────────────────────────────────┐
│  rubricas/  registry + orquestrador       │
│  ├─ bolsa.ts        BF1 / BF2 / BFM       │
│  ├─ alimentacao.ts  SA por dia elegível   │
│  ├─ quilometros.ts  KM por sessão         │
│  └─ honorarios.ts   valor/hora × horas    │
└───────┬───────────────────────────────────┘
        │
        ▼
┌────────────────┐
│ ResultadoCalc. │  linhas + totais + memoria_calculo por linha
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ persistencia.ts│  UPSERT em financeiro_processamentos
└────────────────┘  (rascunho ou snapshot fechado)
```

Entry-point único: `executarProcessamento(chave)` em `src/lib/financeiro/engine/processamento.ts`.

## Contexto

`carregarContexto(chave)` executa em paralelo (~10 queries):
- Curso + projeto
- `fin_configuracao_global` (singleton)
- Formandos ativos do curso + `fin_formando_rubricas`
- Sessões do mês (com ufcd + formador)
- Faltas do mês
- Formadores envolvidos + `fin_formador_config`
- Rubricas + regras vigentes no mês

Devolve um objeto único `ContextoProcessamento` — a partir daqui **nenhuma rubrica faz mais queries à BD**. Isto garante determinismo e performance.

## Cálculo de horas

`calcularHoras(ctx, diasMinimos)`:
- Horas previstas: soma das sessões do mês onde o formando está inscrito.
- Horas frequentadas: previstas − faltas (justificadas ou não).
- Dias elegíveis para SA: dias distintos com ≥ `diasMinimos` horas frequentadas (default 3, configurável por regra da rubrica SA).

## Validações

`validar(ctx, horas)` produz `Validacao[]` com `nivel: "bloqueante" | "aviso"`:
- Formando sem IBAN mas com direito a bolsa → **bloqueante**.
- Sessão sem formador atribuído no mês → **aviso**.
- Múltiplos formadores na mesma UFCD → **aviso**.
- Formador sem `fin_formador_config` → **aviso**.

Bloqueantes impedem o fecho (`persistencia.ts` rejeita); avisos aparecem no wizard e no snapshot.

## Rubricas

Cada rubrica é 1 ficheiro em `engine/rubricas/` exportando uma função pura `(ctx, horas) → Linha[]`. O registry (`rubricas/index.ts`) reexporta:

```ts
export { calcularBolsas } from "./bolsa";
export { calcularSubsidios } from "./alimentacao";
export { calcularQuilometros } from "./quilometros";
export { calcularHonorarios } from "./honorarios";
```

Cada linha inclui **`memoria_calculo`** — fórmula + parcelas + notas, mostrada no wizard e no PDF de processamento. É a auditoria linha-a-linha.

### Adicionar uma nova rubrica

1. Criar `src/lib/financeiro/engine/rubricas/nova.ts`:
   ```ts
   import type { ContextoProcessamento, LinhaBolsa } from "../types";
   import type { HorasFormando } from "../horas";

   export function calcularNova(
     ctx: ContextoProcessamento,
     horas: Map<string, HorasFormando>,
   ): LinhaNova[] {
     const regra = ctx.rubricas.find((r) => r.codigo === "NOVA");
     if (!regra) return [];
     // … cálculo puro, sem I/O
     return linhas;
   }
   ```
2. Definir `LinhaNova` em `engine/types.ts` e acrescentar ao `ResultadoCalculo`.
3. Reexportar em `rubricas/index.ts`.
4. Chamar em `processamento.ts` e somar ao total geral.
5. Inserir a rubrica em `fin_rubricas` (migração) + regras iniciais em `fin_rubrica_regras`.
6. Se for opt-in por formando, adicionar coluna a `fin_formando_rubricas` ou usar linha genérica (`rubrica_id`).

Nada mais é preciso — a UI do wizard lê o `ResultadoCalculo` genericamente.

## Persistência

`persistencia.ts`:
- **Rascunho:** UPSERT do snapshot, `estado = 'rascunho'`. Recalculável.
- **Fechar:** valida ausência de bloqueantes, escreve `estado = 'fechado'`, grava linhas em `financeiro_honorarios` para a rubrica HON, escreve entrada em `fin_auditoria`.

Um processamento fechado é imutável — para corrigir, reabrir (novo rascunho) e refechar.

## UI

- **`/financeiro/processamentos`** — lista por projeto/mês, estado, totais.
- **`/financeiro/processamentos/novo`** — wizard 4 passos: chave → contexto → validações → resultado. Todos os cálculos são preview até "Fechar".
- **`/financeiro/bolsas | subsidios | quilometros | honorarios`** — vistas transversais lendo snapshots já fechados.
- **`/financeiro/auditoria`** — trilha (`fin_auditoria`).
- **`/financeiro/alertas`** — validações agregadas.
- **`/financeiro/configuracao | rubricas | regras | utilizadores`** — administração.
- **`/nota-honorarios`** — emissão avulsa (formador da BD ou externo), independente do wizard.

## Convenções

- Arredondamento: `round2` (2 casas, half-away-from-zero via `Math.round`).
- Datas: ISO `YYYY-MM-DD` em strings, comparadas lexicograficamente.
- Zero I/O nas rubricas — só o contexto toca na BD.
- Zero `console.*` no motor.
