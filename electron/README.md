# Versão Desktop (Electron) — Estado da migração

## Onde estamos

**Fase 1 em curso** — fundação instalada, falta o shim que substitui as chamadas Supabase por SQL local. **A versão online continua a funcionar normalmente** durante a transição (o ficheiro `src/integrations/supabase/client.ts` ainda não foi tocado).

### Já feito
- `@electric-sql/pglite` + `electron` + `@electron/packager` instalados.
- `electron/main.cjs` + `electron/preload.cjs` — arranque da janela, IPC para ficheiros (`docs:write/read/remove/list`) e backup/restauro da BD.
- `scripts/bundle-migrations.mjs` — concatena `supabase/migrations/*.sql` em `src/lib/local-migrations.generated.ts`.
- `src/lib/local-db.ts` — singleton PGlite + runner que aplica migrações em ordem (com filtro automático para remover `GRANT`, `CREATE POLICY`, RLS e referências a `auth.users`).
- Scripts no `package.json`: `electron:dev`, `electron:build:win`, `electron:build:mac`, `migrations:bundle`.

### Falta (próximas entregas)
1. **Shim PostgREST** (`src/integrations/local/postgrest-shim.ts`) — o pedaço grande. Tem de traduzir a API encadeada do `supabase-js` (`from().select().eq().in().order().single()` etc.) e os joins embutidos do PostgREST (`formador:formadores(...)`, `formadores:curso_ufcd_formadores(formador:formadores(...))`) para SQL PGlite.
2. **Shim Auth** — `signInWithPassword` local contra utilizador `formacao` / `ER2026`.
3. **Shim Storage** — em Electron grava em `userData/docs/<bucket>/<path>` via IPC; no preview do browser cai num blob em IndexedDB.
4. **Shim Realtime** — `channel().on('postgres_changes')` como event emitter local após cada write.
5. **Switch em `src/integrations/supabase/client.ts`** — detetar `window.electronAPI` e devolver o shim em vez do cliente real.
6. **Vite base = `./`** — ajustar config para Electron carregar via `file://` (requer override no wrapper `@lovable.dev/vite-tanstack-config`).
7. **Empacotar** Windows + macOS com `@electron/packager`.

## Como testar a fundação (já agora)

```bash
npm run migrations:bundle   # regenerar bundle de migrações
npm run build               # build do frontend (ainda usa Supabase — para teste online)
npm run electron:dev        # arranca Electron a apontar para dist/
```

No primeiro arranque verás a app a tentar contactar Supabase (sem internet falha). Quando a Fase 1 estiver completa, isto passa a funcionar 100% offline.

## Estrutura de pastas em runtime

```
%APPDATA%/FormacaoER/        (Windows)
~/Library/Application Support/FormacaoER/   (macOS)
├── IndexedDB/...            ← PGlite (base de dados)
└── docs/
    ├── formadores/<id>/...
    └── formandos/<id>/...
```

Modo portátil (correr da pen): define `LOVABLE_PORTABLE=1` no `.bat`/`.command` antes de arrancar — os dados ficam em `FormacaoER-data/` ao lado do executável.
