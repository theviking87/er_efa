## Objetivo

Empacotar a app atual como aplicação desktop (Windows + macOS), mantendo a UI e funcionalidades 100% iguais, mas com **base de dados local em vez de Lovable Cloud**. Sem internet, sem créditos, sem dependências externas.

A versão online deixa de ser mantida — todo o trabalho passa a ser feito na versão desktop.

## Arquitetura

```text
┌──────────────────────────────────────────────┐
│ Electron (Chromium + Node)                   │
│                                              │
│  ┌────────────────┐    ┌──────────────────┐  │
│  │ Renderer (UI)  │◄──►│ Main (Node)      │  │
│  │ React + Tan-   │IPC │ - PGlite (BD)    │  │
│  │ Stack atual    │    │ - FS p/ docs     │  │
│  └────────────────┘    └──────────────────┘  │
│                                              │
└─────────┬──────────────────────┬─────────────┘
          │                      │
     userData/db.sqlite     userData/docs/
                            ├─ formadores/<id>/
                            └─ formandos/<id>/
```

**Escolha de BD: PGlite** (PostgreSQL em WASM, mesma SQL do Supabase). Vantagens:
- Migrações existentes funcionam como estão
- Queries com `.from().select().eq()` etc. mantêm-se via shim
- Sem reescrever esquema

**Shim Supabase**: criar `src/integrations/supabase/client.ts` (local) que expõe a mesma API (`from`, `select`, `insert`, `update`, `delete`, `upsert`, `eq`, `gte`, `lte`, `or`, `in`, `order`, `single`, `storage.from().upload()`, etc.) mas executa contra a BD local. Resultado: **zero alterações nos ficheiros de funcionalidades** (`cronograma.tsx`, `cursos.$id.tsx`, etc.).

**Storage de ficheiros**: substituir buckets (`formador-documentos`, `formando-pra`) por escrita direta em `userData/docs/<tipo>/<id>/<filename>`. O shim `supabase.storage.from(bucket).upload(path, file)` escreve no FS via IPC e devolve URL `file://` (ou `app://docs/...` via protocolo custom).

**Auth**: a app já usa username/pass simples. Continua local (hash em BD ou simplesmente "formacao/ER2026" hardcoded como já está).

## Fases

### Fase 1 — Fundação (esta entrega)
1. Criar `electron/main.cjs` + `electron/preload.cjs` com bridge IPC para BD e FS.
2. Instalar PGlite no processo main.
3. Aplicar todas as migrações existentes (`supabase/migrations/*.sql`) ao arrancar, em ordem, com tabela `_migrations` para idempotência.
4. Criar shim `src/integrations/supabase/client.ts` com a interface mínima da PostgREST-builder (chainable). Os métodos usados na app: `from`, `select`, `insert`, `update`, `upsert`, `delete`, `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `is`, `or`, `like`, `ilike`, `order`, `limit`, `range`, `single`, `maybeSingle`, `not`. Cada chain gera SQL parametrizado enviado por IPC ao main, que executa em PGlite.
5. Shim de `supabase.storage` (upload, createSignedUrl, remove, list, getPublicUrl) sobre FS local.
6. Shim de `supabase.auth` (signInWithPassword local + sessão em memória) — o ecrã `/auth` mantém-se.
7. Shim de `supabase.channel().on('postgres_changes', …)` — implementação no-op + emit local após cada write (para os useEffects realtime continuarem a invalidar queries).
8. `vite.config.ts`: `base: './'`.
9. Configurar build Electron com `@electron/packager` para Windows e macOS.

### Fase 2 — Migração de dados (opcional, depois da Fase 1)
- Botão "Importar do backup Cloud": carregar um `.json` exportado da app online e injetar em PGlite. Útil para começar com os dados atuais.

### Fase 3 — Polimento desktop
- Menu nativo (Ficheiro › Backup BD, Abrir pasta de documentos, Sair).
- Auto-backup diário de `db.sqlite` para `userData/backups/`.
- Atualizações: não automáticas (entrego novos zips quando pedires).

## Entregáveis

- `FormacaoER-Windows.zip` — executável `.exe` portátil (corre da pen, sem instalador).
- `FormacaoER-macOS.zip` — `.app` portátil.
- Pasta `userData/` é criada automaticamente no primeiro arranque (em `%APPDATA%/FormacaoER` no Windows, `~/Library/Application Support/FormacaoER` no macOS). Para correr de pen, o `.bat`/`.command` aponta `userData` para uma pasta junto do executável.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| PGlite não suporta 100% das features Postgres usadas | A app usa SQL standard (SELECT/INSERT/UPDATE/DELETE/JOIN simples via FK). Triggers e funções são poucos (`set_updated_at`) — port direto. RLS é ignorada (offline single-user). |
| Joins implícitos do PostgREST (`select("id, curso:cursos(...)")`) | O shim resolve manualmente: parsing do select string e queries adicionais ou JOIN gerado. Esta é a parte mais delicada. |
| `.or()`, `.in()`, filtros encadeados complexos | Cobertura testada contra os usos reais no código (varrer `from\(` em todo o repo). |
| Tamanho do bundle Electron (~150MB) | Aceitável para pen drive. |
| macOS unsigned warning | Documenta-se "Abrir > Botão direito > Abrir" para contornar Gatekeeper. |

## Estimativa de esforço

- Fase 1: ~3-4 turnos (fundação + shim PostgREST é o grosso).
- Fase 2: 1 turno.
- Fase 3: 1 turno.

## Confirmação antes de começar

Vou começar pela Fase 1 com foco no shim PostgREST porque é o que desbloqueia tudo o resto. Os primeiros builds podem ter funcionalidades que falham silenciosamente até cobrir todos os operadores — vou corrigir à medida que testares.

Confirmas que avanço por aqui?