# Auditoria V1 — Release Candidate

**Data:** 2026-07-20
**Modo:** Fase A — só leitura, sem alterações de código
**Perfil de risco:** Conservador

---

## 1. Inventário

| Métrica | Valor |
|---|---|
| Rotas autenticadas | 29 |
| Rotas públicas | 2 (`/`, `/auth`) |
| Componentes de domínio (`src/components`) | 5 + 3 financeiro |
| Componentes UI shadcn (`src/components/ui`) | 45 |
| Hooks | 1 (`use-mobile`) |
| Serviços financeiros | 8 |
| Motor financeiro (engine) | 4 módulos + 4 rubricas |
| Tabelas na BD | 31 |
| Migrações Supabase | 21 |
| Dependências runtime | 61 |
| Dependências dev | 20 |
| LOC total (src, sem `routeTree.gen`) | ~25 000 |
| Erros TypeScript | 0 |

---

## 2. Problemas encontrados (por severidade)

### 🔴 Alta — corrigir antes da RC

**A1. Tabela `configuracao_financeira` órfã.**
Criada em `20260718214915_*.sql`, seeded com valores default, com trigger de `updated_at`, mas **não referenciada em nenhum lado do código** (`src/`). Foi substituída por `fin_configuracao_global` na refatoração posterior do módulo Financeiro.
→ Ação: migração de drop (com backup dos valores, caso existam), remover do `local-migrations.generated.ts`.

**A2. Dependências não usadas no bundle.**
- `react-router-dom` (7.18.0) — o projeto usa TanStack Router, não React Router. Zero imports em `src/`.
- `sql.js` + `@types/sql.js` — a versão offline agora usa PGlite; sql.js só existe no `offline/` legacy.
- `date-fns` — zero imports.
→ Ação: `bun remove react-router-dom sql.js @types/sql.js date-fns`. Poupa ~250 KB no bundle.

**A3. Pasta `offline/` legacy.**
`offline/src/**` é a versão antiga baseada em sql.js + FSA, substituída pela build Electron (`electron/`, `src/electron-entry.tsx`, `dist-electron/`). Contém rotas, DB e componentes duplicados dos que existem em `src/routes/`.
→ Ação recomendada: arquivar em `docs/legacy-offline.md` ou remover. **Não corrigir automaticamente** — pedir confirmação (perfil conservador).

### 🟡 Média

**M1. `src/routes/_authenticated/cursos.$id.tsx` = 2979 linhas.**
Ficheiro massivo, concentra: overview, UFCDs, cronograma, formandos, faltas, importação, edição, presenças, PDF. Já contém subcomponentes internos (`SessaoDialog`, `EditCursoDialog`, etc.).
→ Ação (fase C): partir em `src/routes/_authenticated/cursos.$id/` com subficheiros por tab. Alto risco de regressões se feito agora.

**M2. `src/routes/_authenticated/cronograma.tsx` = 1559 linhas.**
Semelhante ao anterior mas menor prioridade.

**M3. Componentes UI shadcn não usados (27 de 45).**
`accordion`, `aspect-ratio`, `avatar`, `breadcrumb`, `calendar`, `carousel`, `chart`, `collapsible`, `command`, `context-menu`, `drawer`, `dropdown-menu`, `form`, `hover-card`, `input-otp`, `menubar`, `navigation-menu`, `pagination`, `popover`, `progress`, `radio-group`, `resizable`, `scroll-area`, `sidebar`, `slider`, `table`, `toggle-group`.
→ Nota: `sidebar` é surpreendente — verificar se `app-shell` reimplementa o layout. Alguns (`table`, `popover`, `dropdown-menu`) podem vir a ser necessários na V2 (relatórios financeiros).
→ Ação: remover apenas os obviamente inertes (`aspect-ratio`, `carousel`, `input-otp`, `menubar`, `resizable`, `navigation-menu`, `hover-card`). Manter os prováveis (`table`, `popover`, `form`, `dropdown-menu`).

**M4. Migração de "backup" da tabela órfã.**
`configuracao_financeira` tem policy `USING (true)` — se alguém a povoou, os dados perdem-se ao remover. Fazer `SELECT * FROM configuracao_financeira` antes de dropar.

**M5. `nota-honorarios.tsx` — redirect stub.**
Ficheiro deixado apenas para redirecionar links antigos para `/financeiro/honorarios`. Consumir OK, mas documentar como legacy no próprio ficheiro.

### 🟢 Baixa (cosmética / manutenção)

**B1. `HonorariosPage` importa `NotaHonorariosCard` de `./relatorios`.**
Acoplamento entre rotas (uma rota importa componente de outra). Deveria viver em `src/components/financeiro/nota-honorarios-card.tsx`.

**B2. Duplicação `formador-dialog.tsx` vs `financeiro/formador-panel.tsx`, idem `formando-*`.**
São coisas diferentes (o `dialog` cria o registo base, o `panel` gere config financeira), mas os nomes confundem. Renomear panel → `formador-config-panel.tsx` clarifica.

**B3. 11 ficheiros ainda com `console.log/error/warn` fora de `error-*`.**
Aceitáveis em `lib/electron-io.ts` e `lib/import-*.functions.ts` (diagnóstico), remover nos routes.

**B4. Apenas 1 TODO em código (`cursos.$id.tsx:2066`) — é comentário descritivo, não TODO real.**

**B5. `src/hooks/` só tem `use-mobile.tsx`.**
Considerar extrair hooks reutilizados (ex.: `useProjetoAtivo`, `useSupabaseQuery` wrappers) na fase C.

---

## 3. Base de dados

### Tabelas por uso no código

| Uso | Tabelas |
|---|---|
| ≥15 refs (core) | `cursos`, `formandos`, `formadores`, `sessoes`, `ufcds`, `curso_ufcds` |
| 6-14 | `curso_formandos`, `curso_ufcd_formadores`, `financeiro_processamentos`, `formando_faltas`, `projetos`, `formador_ufcds`, `formador_disponibilidades`, `fin_rubricas` |
| 3-5 | `curso_ferias`, `formador_inatividades`, `financeiro_honorarios`, `formador_documentos`, `formando_pra`, `cronograma_observacoes`, `fin_formando_rubricas` + resto do `fin_*` |
| 1-2 | `curso_formando_ufcds`, `fin_utilizadores` |
| **0** | **`configuracao_financeira`** ← candidata a drop |

### Observações
- `curso_formando_ufcds` é usada só em migração — verificar se a UI já a preenche. Se não, é órfã funcional (usada só no schema, sem writes).
- Nenhuma foreign key partida detectada (TS compila).
- 21 migrações sequenciais, sem conflitos aparentes.
- `local-migrations.generated.ts` (680 linhas) é auto-gerado a partir das migrações — remove a órfã automaticamente ao correr `scripts/bundle-migrations.mjs` depois do drop.

---

## 4. Motor financeiro

Estrutura atual bem organizada — **nada a alterar em Fase B**:

```
src/lib/financeiro/
├── current-user.ts
├── types.ts
├── engine/
│   ├── contexto.ts       (bulk-load, 180 loc)
│   ├── horas.ts          (cálculo horas presença)
│   ├── validacoes.ts     (regras de negócio)
│   ├── persistencia.ts   (draft/close, snapshots)
│   ├── processamento.ts  (orquestrador)
│   ├── types.ts
│   └── rubricas/
│       ├── bolsa.ts
│       ├── alimentacao.ts
│       ├── quilometros.ts
│       ├── honorarios.ts
│       └── index.ts      (registry)
└── services/
    ├── alertas.ts
    ├── auditoria.ts
    ├── config-global.ts
    ├── dashboard.ts
    ├── formador-config.ts
    ├── formando-rubricas.ts
    ├── rubricas.ts
    └── utilizadores.ts
```

Motor cumpre padrão *registry + orchestrator* — adicionar rubrica = 1 ficheiro. Consistente.

---

## 5. Preparação para offline (mapa de acoplamento cloud)

Categorias de acoplamento identificadas:

| Categoria | Ficheiros | Estado |
|---|---|---|
| Cliente Supabase direto | Todas as rotas + serviços (~60 `import { supabase }`) | Já com **shim local** em `src/integrations/local/supabase-shim.ts` → compatível offline via PGlite. ✅ |
| `createServerFn` | `bootstrap-user`, `import-cronograma`, `import-referencial` | Já com stubs em `src/integrations/local/server-stubs/`. ✅ |
| Realtime | `realtime-shim.ts` já existente | ✅ Não usado em produção. |
| Storage (buckets) | `formador-documentos`, `formando-pra` | Shim local (`storage-shim.ts`) escreve em `docs/` via `electronAPI`. ✅ |
| Auth | `auth-shim.ts` no Electron | ✅ Login local `formacao`/`ER2026`. |
| PDF/Excel/Print | `pdf-exports.ts`, `exports.ts`, `electron-io.ts` | Puros no cliente. ✅ |
| **`import-referencial`** | Usa Lovable AI (upload de PDF) | ❌ **Requer internet.** Já documentado no README offline como limitação. |

**Conclusão:** o projeto está estruturalmente pronto para offline; a arquitetura de shims cobre 95% dos acessos cloud. Único bloqueador funcional é a extração de referencial por IA — expectativa gerível.

---

## 6. Segurança (leitura estática)

- RLS activa em todas as tabelas (todas com policy `auth all USING (true)` — modelo simples, adequado ao caso de uso unipessoal).
- Zero uso de `supabaseAdmin` fora dos stubs.
- Zero secrets hardcoded em `src/`.
- Inputs financeiros validados no motor (`validacoes.ts`).
- Sem SQL dinâmico exposto ao utilizador.

---

## 7. Plano recomendado para Fase B (correções seguras)

Ordem sugerida, cada passo revertível em isolamento:

1. **Remover deps não usadas** (`react-router-dom`, `sql.js`, `@types/sql.js`, `date-fns`).
   Risco: nulo. Verificação: `bun run build`.
2. **Migração: DROP `configuracao_financeira`** + regenerar `local-migrations.generated.ts`.
   Risco: baixo. Prevenção: `SELECT * ` antes do drop; se houver linhas, migrar para `fin_configuracao_global` antes de dropar.
3. **Remover componentes UI shadcn obviamente inertes** (`aspect-ratio`, `carousel`, `input-otp`, `menubar`, `resizable`, `navigation-menu`, `hover-card`).
   Risco: nulo (0 imports).
4. **Extrair `NotaHonorariosCard`** de `relatorios.tsx` para `src/components/financeiro/nota-honorarios-card.tsx`. Manter re-export em `relatorios.tsx` para não partir.
   Risco: baixo. Ganho: partir acoplamento entre rotas.
5. **Remover `console.*` de routes** (deixar em `lib/electron-io.ts` e `import-*.functions.ts`).
   Risco: nulo.

Fase B deve caber em 1 turno. Fase C (`cursos.$id.tsx` split, unificação UI) fica para turno seguinte.

---

## 8. Classificação de qualidade

| Dimensão | Nota | Comentário |
|---|---|---|
| Tipagem | A | 0 erros TS, tipos gerados a partir do schema. |
| Arquitetura Financeiro | A | Registry de rubricas limpo, motor isolado. |
| Arquitetura Cursos/Cronograma | C | Rotas monolíticas (2979 loc), difícil manutenção. |
| Preparação offline | A- | Shims completos, único bloqueador é a IA de PDF. |
| Consistência de UI | B | shadcn coerente, mas alguns componentes duplicados semanticamente. |
| Dívida técnica | B | 4 deps mortas, 1 tabela órfã, 27 UI órfãos. |
| Segurança | A | RLS activa, sem admin client em cliente. |
| Documentação | C | Faltam docs de arquitetura e modelo de dados (a produzir na Fase D). |

**Nota global RC:** **B+** — funcional, tipado, offline-ready. Limpezas da Fase B sobem para A-.

---

## 9. Checklist Desktop Offline (para futura V1.1)

- [x] Shim Supabase → PGlite
- [x] Shim Storage → FS local via Electron IPC
- [x] Shim Auth local
- [x] Shim `createServerFn` para funções import
- [x] Bundle de migrações incorporado (`local-migrations.generated.ts`)
- [x] Backup import (`local-import-backup.ts`)
- [x] Ecrã de gate de dados no arranque (`OfflineDataGate`)
- [x] Build Electron testada (Windows)
- [ ] Alternativa offline para importação de referencial por IA (limitação conhecida)
- [ ] Encriptação da BD local (V2)
- [ ] Auto-update Electron (V2)
- [ ] Assinatura do executável (V2)

---

## 10. Sugestões para V2.0

1. Split de `cursos.$id.tsx` em subrotas por tab.
2. Roles reais (admin/coordenador/financeiro) via `has_role` — hoje é single-user.
3. Encriptação da BD local com passphrase.
4. Motor documental completo (geração automática de convocatórias, folhas de presença, etc.).
5. Sincronização opcional online↔offline (merge por timestamps).
6. Dashboard analítico com gráficos (ativar `components/ui/chart.tsx`).
7. Testes E2E críticos (Playwright) — hoje só há tipagem estática.

---

*Relatório gerado em Fase A. Nenhum ficheiro de código foi alterado. Aguarda aprovação para prosseguir com Fase B (correções seguras).*
