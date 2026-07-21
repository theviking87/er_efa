# Release Notes — v1.0

**Data:** 2026-07-21
**Estado:** Release Candidate

## Novidades v1.0

### Projetos (nova entidade raiz)
- Tabela `projetos` — todo o resto (cursos, processamentos) vive dentro de um projeto.
- Seletor global de projeto na sidebar; dashboard e listagens filtram automaticamente.
- Dashboard por projeto com tabs: Cursos, UFCD, Formadores, Formandos, Financeiro.

### Módulo Financeiro (novo)
- 11 rotas: Configuração, Rubricas, Regras, Utilizadores, Alertas, Auditoria, Processamentos, Bolsas, Subsídios, Quilómetros, Honorários.
- **Motor financeiro** extensível (contexto → horas → validações → rubricas → snapshot). Ver `MOTOR_FINANCEIRO.md`.
- Rubricas base: Bolsa (BF1/BF2/BFM), Subsídio de Alimentação, Quilómetros, Honorários.
- Wizard de processamento 4 passos com preview e memória de cálculo linha-a-linha.
- Snapshots imutáveis por (ano, mês, curso, projeto).
- Painéis por formando/formador para opt-in de rubricas.
- Trilha de auditoria completa.

### Notas de Honorários
- Rota dedicada `/nota-honorarios` com preview verde em tempo real.
- Modos: por mês, por UFCD ministrada, formador externo (avulso), avença.
- IRS/IVA configuráveis (default 23%, `0` = regime de isenção).
- Numeração automática, data de emissão editável, export PDF.

### Cursos
- Nova lista "UFCD com formador atribuído" + alerta de múltiplos formadores na mesma UFCD.
- Pesquisa dentro do curso agora inclui formador (nome/abreviatura).
- Diálogo de nova sessão permite escolher formador e UFCD **sem** verificar disponibilidade.
- Diálogo de edição de curso.
- Export PDF "UFCD com formador".

### Cronograma / Sessões
- Alerta ao lançar sessão ou disponibilidade em **sábado/domingo** (aplicado em toda a app).

### Desktop offline
- Build Electron portable Windows/macOS.
- BD local com **PGlite** (Postgres em WASM) — mesmo schema que cloud.
- Ficheiros locais via IPC (FS).
- Backup/Restore em ZIP.
- Login local (`formacao / ER2026`).
- Ver `OFFLINE.md`.

## Correções e melhorias (Fase B da RC)

- Removidas dependências mortas: `react-router-dom`, `sql.js`, `@types/sql.js`, `date-fns`.
- Removidos 7 componentes shadcn não utilizados.
- Eliminada tabela órfã `configuracao_financeira` (substituída por `fin_configuracao_global`).
- `NotaHonorariosCard` extraído de `relatorios.tsx` (772 → 192 loc) para `src/components/financeiro/`.
- Simplificado painel financeiro do formando: só opt-in, configuração vem do Financeiro global.

## Documentação (Fase D)

Novos documentos em `docs/`:
- `ARQUITETURA.md` — stack, providers, camada de dados.
- `MODELO_DADOS.md` — 31 tabelas, relações, RLS.
- `MOTOR_FINANCEIRO.md` — pipeline, como adicionar rubrica.
- `OFFLINE.md` — build Electron, shims, backup, limitações.
- `AUDITORIA_V1.md` — relatório de auditoria RC.
- `RELEASE_NOTES_V1.md` — este ficheiro.

## Limitações conhecidas

- Extração de referencial por IA requer internet (Lovable AI).
- Modelo single-user (roles reais em V2).
- Executável Electron não assinado — SmartScreen avisa no Windows.
- Sem encriptação da BD local.
- Sem auto-update.
- Sem sync online↔offline.

## Roadmap V2 (não incluído)

- Split de `cursos.$id.tsx` (2979 loc) em subrotas por tab.
- Roles reais (admin/coordenador/financeiro) via `has_role`.
- Encriptação da BD local com passphrase.
- Motor documental (convocatórias, folhas de presença).
- Sync online↔offline por timestamps.
- Dashboard analítico (charts).
- Testes E2E críticos (Playwright).
- Auto-update + assinatura do executável.

## Nota de qualidade

- 0 erros TypeScript (`tsgo --noEmit`).
- RLS ativa em todas as tabelas.
- Zero secrets em `src/`.
- Motor financeiro isolado, testável, extensível por 1 ficheiro.
- **Nota global RC: A-**
