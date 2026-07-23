# Refatoração v2.0 — Módulo Financeiro + Limpeza Total

## 1. Eliminação (irreversível)

**Pastas/ficheiros removidos por completo:**
- `offline/` (subprojeto inteiro)
- `electron/`, `dist-electron/`, `index.electron.html`, `vite.config.electron.ts`, `src/electron-entry.tsx`
- `src/integrations/local/` (todos os shims: supabase-shim, auth-shim, storage-shim, realtime-shim, query-builder, select-parser, relationships, tanstack-start-shim, server-stubs/)
- `src/lib/pglite.worker.ts`, `src/lib/local-db.ts`, `src/lib/local-migrations.generated.ts`, `src/lib/local-import-backup.ts`, `src/lib/offline-sql.ts`
- `scripts/bundle-migrations.mjs`
- `docs/OFFLINE.md`

**Dependências npm removidas:**
- `@electric-sql/pglite`, `electron`, `@electron/packager`, `jszip` (se só usado por import-backup)

**Código morto identificado no scan:**
- Serviços/hooks nunca importados
- Componentes shadcn órfãos remanescentes
- `src/lib/error-page.ts`, `error-capture.ts` se não referenciados fora do offline
- Referências a `paintBeforeHeavyWork` (do offline-sql)

## 2. Base de dados — Reset do Financeiro

**Drop:** `fin_rubrica_regras`, `fin_formando_rubricas`, `fin_formador_config`, `fin_configuracao_global`, `fin_rubricas`, `fin_auditoria`, `fin_utilizadores`, `financeiro_bolsas`, `financeiro_subsidios`, `financeiro_quilometros`, `financeiro_honorarios`, `financeiro_processamentos`.

**Criar (schema simplificado):**

```
fin_config (linha única global)
  horas_mes_referencia, valor_sa, valor_km, limite_km_dia,
  percentagem_irs, percentagem_ss, percentagem_iva,
  empresa_nome, empresa_nif, empresa_morada, empresa_email, empresa_telefone,
  logo_empresa_url, logo_dgert_url, logo_pessoas2030_url

fin_bolsa_config (por formando+projeto)
  formando_id, projeto_id, tipo ('BF'|'BFM'), valor_mensal

formando_ufcds (novo, na ficha do formando)
  formando_id, ufcd_id  — UCs que o formando frequenta

fin_processamento
  projeto_id, curso_id, ano, mes, estado ('rascunho'|'fechado'), totais, created_at

fin_processamento_linha (uma linha por formando+rubrica)
  processamento_id, formando_id, rubrica ('BF'|'BFM'|'SA'|'TR'|'HN'),
  horas_previstas, horas_frequentadas, horas_elegiveis, dias_elegiveis,
  valor_hora, valor_dia, km_total, valor, memoria_calculo (jsonb)
```

**Presenças:** adicionar `tipo` a `formando_faltas` com valores `falta`/`ausencia_uc`. Trigger auto-marca `ausencia_uc` quando a UFCD da sessão não está em `formando_ufcds`. Ausências não contam para cálculo.

## 3. Motor Financeiro (reescrito, simples)

`src/lib/financeiro/` limpo, com apenas:
- `config.ts` — get/update fin_config
- `engine.ts` — 1 função `calcularProcessamento(projetoId, cursoId, ano, mes, selecoes)` que devolve linhas
- `rubricas/{bolsa,alimentacao,transporte,honorarios}.ts` — cada uma expõe `calcular(ctx, formando)`

**Regras codificadas:**
- BF/BFM: `valor_hora = valor_mensal / horas_mes_referencia`; total = horas_frequentadas × valor_hora
- SA: dias com ≥ 3h frequentadas × valor_sa
- TR: min(km_dia × valor_km, limite_km_dia) somado por dia
- HN: horas × valor_hora × (1 + iva%) - retenção IRS/SS

## 4. UI Financeira

**Sidebar (reduzido):**
- Configuração (form único)
- Rubricas (só valores default por projeto, opcional)
- Processamentos (lista + wizard novo)
- Auditoria (mantida)

**Wizard novo processamento (1 ecrã):**
- Escolher projeto/curso/mês/ano
- Tabela: 1 linha por formando, 5 checkboxes (BF, BFM, SA, TR, HN) + input `valor_mensal` quando BF/BFM marcado
- Botão "Calcular" → preview totais → "Fechar processamento"

**Ficha formando:** adicionar tab "UFCDs frequentadas" (multi-select das UFCDs do curso).

## 5. Documentos (Excel + PDF)

Layout único em `src/lib/documentos/layout.ts`:
- Header: logo empresa (esq) + logo DGERT (dir) + título
- Footer: logo Pessoas 2030 + página X/Y

Exports por processamento:
- Individual por formando: `mapa-bolsa.xlsx`, `mapa-sa.xlsx`, `mapa-transporte.xlsx`, `mapa-honorarios.xlsx`, `mapa-geral.xlsx`
- Consolidado (todos os formandos): mesmos 5 tipos
- PDFs equivalentes (mesma estrutura)

Logos: 3 campos URL em fin_config + upload via storage bucket `empresa-logos`.

## 6. Ficheiros que MUDAM (fora do financeiro só o mínimo)

- `src/routes/__root.tsx`, `src/router.tsx`, `vite.config.ts`, `package.json` — limpeza
- `src/components/app-shell.tsx` — sidebar sem itens removidos
- `src/components/formando-dialog.tsx` / rota — adiciona tab UFCDs
- `src/components/presencas-dialog.tsx` — respeita `ausencia_uc`
- Nada mais em cursos/cronograma/formadores fora do financeiro

## 7. Verificações finais

- `tsgo --noEmit` sem erros
- `bun run build` (só web) sem erros
- ESLint clean
- Grep final: 0 ocorrências de `electron`, `pglite`, `offline`, `local-db`, `sql.js`

## Detalhes técnicos

**Tabela `formando_ufcds` vs `curso_formando_ufcds`:** já existe `curso_formando_ufcds` — reutilizo essa, adiciono coluna `frequenta boolean default true`. Se `false`, presenças dessa UFCD marcadas como ausência.

**Migração de dados históricos:** conforme decidido — RESET TOTAL. Aviso o utilizador que os processamentos atuais serão apagados antes de correr.

**Excel:** `exceljs` (já no bundle via alguma dep? senão adiciono). PDF: `jspdf` + `jspdf-autotable` (já usados).

**Ordem de execução:**
1. Migração DB (drop + create + coluna `frequenta`)
2. Remoção pastas offline/electron
3. Remoção deps do package.json
4. Reescrita `src/lib/financeiro/`
5. Reescrita rotas `_authenticated/financeiro.*`
6. Documentos
7. Cleanup imports órfãos + typecheck

## Riscos / avisos

- **Perda de dados financeiros existentes** (confirmado pelo utilizador)
- **Sem rollback fácil** para o offline — vai só ao histórico Git
- Terceiros que dependam de URL `/electron-entry` ou downloads do executável deixam de funcionar
- Logos ficam placeholder até serem enviados

Confirma para eu executar tudo de uma vez.