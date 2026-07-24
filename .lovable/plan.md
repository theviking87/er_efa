## O que muda

A desistência (e a conclusão) passa a ter **data** e o motor financeiro passa a **respeitar essa data**, deixando de contabilizar o formando a partir daí.

Fica registada ao nível da **inscrição** (`curso_formandos`), não do formando global — o mesmo formando pode desistir de um curso e continuar noutro.

## Alterações

**1. Base de dados** (migração)
- Adicionar a `curso_formandos`:
  - `data_desistencia date` (nullable)
  - `data_conclusao date` (nullable)
- Sem backfill: inscrições existentes ficam com data nula (comportamento atual mantém-se para elas).

**2. Motor financeiro** (`src/lib/financeiro/engine.ts`)
- Para cada inscrição, calcular a "data limite" = `min(data_desistencia, data_conclusao)` se existirem.
- Filtrar as sessões do mês para essa inscrição: só contam sessões com `data <= data_limite`.
- Se todas as sessões do mês forem depois da data limite → formando não gera linhas nesse processamento.
- Faltas posteriores à data limite também são ignoradas.

**3. UI — diálogo de inscrição de formando no curso** (`src/routes/_authenticated/cursos.$id.tsx`)
- No formulário de inscrição adicionar dois campos de data opcionais: "Data de desistência" e "Data de conclusão".
- Quando o utilizador muda o estado da inscrição para `desistente` ou `concluido` e a data respectiva estiver vazia, pré-preencher com a data de hoje (ainda editável).
- Mostrar a data ao lado do badge de estado na lista de formandos do curso.

**4. UI — ficha do formando** (`src/routes/_authenticated/formandos.$id.tsx`)
- Na lista de cursos do formando, mostrar a data de desistência/conclusão quando aplicável.

## Notas técnicas

- O estado `formandos.estado` (global) mantém-se como está e não afecta cálculos — a fonte de verdade para cada curso passa a ser a inscrição.
- Recálculos de meses passados continuam a funcionar: se marcares hoje uma desistência com data 15/03, e recalculares Março, o formando conta até 15/03 e deixa de contar a partir de 16/03.
- Não é preciso alterar exportações Excel/PDF — usam as linhas geradas pelo motor.
