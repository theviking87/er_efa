# Plano — Notas de honorários integradas + Módulo Despesas

## 1. Notas de honorários no processamento

### Base de dados
- Nova tabela `despesa_categorias` (id, nome, ordem, ativo) — seed com: Alimentação, Material, Roupa/EPI, Deslocações, Outros.

### UI processamento (`financeiro.processamentos.$id.tsx`)
- Nova secção **"Notas de honorários"** entre "Formandos" e "Formadores".
- Uma linha por formador do processamento com: nome, horas, €/h, valor bruto, **Retenção IRS** (badge "Não tem" se `sem_retencao=true`, senão `X%`), **IVA** (badge "Não tem" se `!aplica_iva`, senão `X%`), valor líquido, botão **"Emitir nota"** (gera PDF com dados do formador + curso + mês, reutilizando `exportNotaHonorariosPdf`).
- Listagem existente de formadores (HN) **mantém-se** por baixo.

### Menu lateral `/nota-honorarios`
- Remover selector de formadores registados.
- Fica apenas para **formador externo/avulso** (mantém modos: valor/hora, valor total/avença).

### Exportação de rubricas no processamento
- Passa a exportar **apenas formandos** (formadores saem via nota de honorários).
- "Exportar todas as rubricas": gera **um Excel por cada combinação rubrica × formando** (ficheiros individuais, download sequencial ou zip).
- Ajustar `src/lib/financeiro/excel.ts` para filtrar `formador_id IS NULL` no export granular.

## 2. Módulo Despesas (autónomo)

### Base de dados
- Tabela `despesa_categorias` (acima).
- Tabela `despesas`:
  - projeto_id (FK, obrigatório)
  - curso_id (FK, opcional)
  - data (date)
  - categoria_id (FK)
  - descricao (text)
  - valor (numeric)
  - fornecedor (text, opcional)
  - nif (text, opcional)
  - anexo_storage_path (text, opcional)
  - observacoes (text)
  - timestamps + RLS `authenticated`
- Novo bucket storage `despesas-anexos` (privado).

### UI
- Nova rota `src/routes/_authenticated/financeiro.despesas.tsx` no grupo Financeiro do sidebar.
- Listagem com filtros: projeto (respeita seletor global), curso, categoria, mês, pesquisa livre.
- Totais por categoria e por curso no cabeçalho.
- Dialog CRUD com upload de anexo (fatura/recibo).
- Nas **Configurações Financeiras** (`financeiro.configuracoes.tsx`): novo separador "Categorias de Despesas" — CRUD (adicionar, renomear, reordenar, ativar/inativar).

### Exportação Excel profissional
- Novo `src/lib/financeiro/despesas-excel.ts`.
- Cabeçalho com logos (empresa + DGERT + Pessoas 2030) igual aos processamentos.
- **Duas opções** no botão de exportar:
  1. **Consolidado** — folha única com todas as despesas filtradas, totais por categoria e por curso no fim.
  2. **Por curso** — uma folha por curso + folha "Resumo" com totais.
- Colunas: Data, Categoria, Descrição, Fornecedor, NIF, Valor, Curso, Observações.

## Ordem de execução

1. Migração DB (`despesa_categorias`, `despesas`, bucket, seed categorias).
2. Refactor notas honorários no processamento + remoção do selector no menu avulso.
3. Ajuste exportação rubricas (só formandos, um por rubrica×formando).
4. Módulo Despesas: rota, CRUD, filtros, sidebar.
5. Configurações: separador categorias.
6. Exportação Excel despesas (consolidado + por curso).

## Notas técnicas
- Reutilizar `NotaHonorariosCard` / `exportNotaHonorariosPdf` para o botão "Emitir nota" no processamento — passar dados pré-preenchidos do formador + linhas HN do mês.
- `data_emissao` no PDF assume data atual por defeito.
- Numeração automática do documento mantém padrão existente.
