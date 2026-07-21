# Offline / Desktop — Formação ER v1.0

A app corre em **Electron** com base de dados **PGlite** (Postgres em WASM) local. As mesmas rotas React funcionam online e offline graças a shims.

## Build

```bash
npm run electron:build:win     # Windows x64
npm run electron:build:mac     # macOS x64
```

Output: `electron-release/FormacaoER-<plat>-x64/`. Executável portable — sem instalador.

Antes de qualquer build offline: `npm run migrations:bundle` regenera `src/lib/local-migrations.generated.ts` a partir de `supabase/migrations/`. O script `electron:build:*` já faz isto.

## Arranque

1. `electron/main.cjs` abre `BrowserWindow` com `dist-electron/index.electron.html`.
2. `src/electron-entry.tsx` faz mount do React com `VITE_OFFLINE=1`.
3. `src/integrations/local/auth-shim.ts` mostra login local (`formacao / ER2026`, hardcoded).
4. Primeira query aciona `getLocalDb()` → PGlite abre BD em `<userData>/formacao.db`, aplica todas as migrações bundled.
5. `OfflineDataGate` (se ligado) permite importar backup antes de usar.

## Persistência

- **BD Postgres:** PGlite worker (`src/lib/pglite.worker.ts`) → ficheiro binário em `app.getPath("userData")`.
- **Ficheiros (docs de formador, PRA de formando):** FS via IPC (`electron/preload.cjs` expõe `electronAPI.docs.*`). Armazenados em `<userData>/docs/<bucket>/<path>`.
- **Sessão:** `localStorage` da janela Electron.

## Shims (mapa)

Em `vite.config.electron.ts`, aliases redirecionam os módulos cloud para equivalentes locais:

| Import original | Shim offline |
|---|---|
| `@/integrations/supabase/client` | `src/integrations/local/supabase-shim.ts` |
| `@/integrations/supabase/client.server` | `src/integrations/local/server-stubs/client-server.ts` |
| `@/integrations/supabase/auth-middleware` | `src/integrations/local/server-stubs/auth-middleware.ts` |
| `@tanstack/react-start` | `src/integrations/local/tanstack-start-shim.ts` |
| `@tanstack/react-start/server` | `src/integrations/local/server-stubs/tanstack-start-server.ts` |
| `@/lib/bootstrap-user.functions` | `src/integrations/local/server-stubs/bootstrap-user.ts` |
| `@/lib/import-cronograma.functions` | `src/integrations/local/server-stubs/import-cronograma.ts` |
| `@/lib/import-referencial.functions` | `src/integrations/local/server-stubs/import-referencial.ts` |

### `supabase-shim.ts`
Expõe `{ from, auth, storage, channel, removeChannel, rpc }` com a mesma superfície do cliente `@supabase/supabase-js`.

- `.from(table)` → `LocalQueryBuilder` que traduz a fluent API (`.select().eq().order().range()`) em SQL Postgres. Interpreta o formato de select do PostgREST incluindo joins (`curso_ufcds(*, ufcds(*), curso_ufcd_formadores(*, formadores(*)))`) usando `select-parser.ts` + `relationships.ts` (mapa de FKs carregado das tabelas de sistema).
- `.rpc()` → lança erro (não usado).

### `auth-shim.ts`
`signInWithPassword`, `getUser`, `signOut` sobre `localStorage`. Só aceita as credenciais locais.

### `storage-shim.ts`
`.from(bucket).upload/download/remove/list()` → chama `window.electronAPI.docs.*` (IPC).

### `realtime-shim.ts`
Stubs no-op. Realtime não é usado em produção.

### Server function stubs
`useServerFn(fn)` no shim de `@tanstack/react-start` é identidade — as funções `.functions.ts` tornam-se async normais. As 3 funções reais têm implementação local em `server-stubs/`.

## Backup / Restore

- **Export:** menu → Backup → exporta ZIP com dump SQL + ficheiros de `docs/`.
- **Import:** `src/lib/local-import-backup.ts` — recebe ZIP, faz TRUNCATE, aplica dump, restaura ficheiros.

Formato compatível com dumps cloud (mesmas migrações → mesmo schema).

## Limitações conhecidas

| Área | Estado |
|---|---|
| Extração de referencial por IA (PDF → UFCDs) | **Requer internet** — usa Lovable AI. Stub offline lança erro. |
| Encriptação da BD local | Não implementada (V2). |
| Auto-update do executável | Não implementado (V2). |
| Assinatura do executável | Não assinado — SmartScreen avisa (V2). |
| Realtime | Não suportado. |
| Multi-user simultâneo | Não suportado (single-writer). |

## Diagnóstico

Se o Electron congelar ("Renderer sem resposta"):
1. Ver `%APPDATA%/FormacaoER/logs/` (Windows) ou `~/Library/Logs/FormacaoER/` (macOS).
2. PGlite corre em worker — não deveria bloquear UI. Se bloquear, verificar imports pesados síncronos.
3. Menu Ver → Ferramentas de Programador (DevTools) para logs do renderer.
