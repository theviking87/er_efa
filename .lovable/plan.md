# Plano: .exe offline com a UI igual à versão online

## Objetivo

Substituir o `FormacaoER.exe` atual (que usa a UI simplificada de `/offline/`) por um build que carrega exatamente as mesmas páginas, componentes shadcn e estilos da versão online — incluindo importação de Excel a funcionar offline.

## Estratégia

A app online usa TanStack Start com SSR e server functions. O Electron não tem servidor, por isso vou compilá-la como SPA pura (client-only), substituindo o cliente Supabase pelo shim local já existente (`src/integrations/local/`).

## O que vou fazer

1. **Build alternativo SPA**
   - Criar `vite.config.electron.ts` com `base: './'`, sem o plugin TanStack Start SSR, apenas com o plugin do router.
   - Alias `@/integrations/supabase/client` → `@/integrations/local/supabase-shim` (já existe).
   - Output em `dist-electron/`.

2. **Entry point client-only**
   - Criar `src/electron-entry.tsx` que monta `<RouterProvider>` diretamente (sem SSR/hydration), reaproveitando `routeTree.gen.ts`.
   - Criar `index.electron.html` que carrega esse entry.

3. **Neutralizar server functions no modo Electron**
   - Substituir `src/lib/import-cronograma.functions.ts` e `src/lib/import-referencial.functions.ts` por versões isomórficas: detectam ambiente, e em Electron fazem o parse do XLSX no browser com `xlsx` (SheetJS) — biblioteca já leve, 100% client-side.
   - `bootstrap-user.functions.ts` → no-op em Electron (login local hardcoded).
   - Remover `_authenticated` gate (em Electron entra sempre).

4. **Persistência local (já existe parcialmente)**
   - `src/lib/local-db.ts` + `local-migrations.generated.ts` já carregam PGlite com as migrações.
   - Adicionar ponte IPC para persistir o ficheiro PGlite e PDFs em `FormacaoER-data/` ao lado do `.exe` (igual ao que já fazia o `/offline/`).
   - `storage-shim.ts` aponta `formador-documentos/` e `formando-pra/` para pastas locais.

5. **Importação de backup**
   - No primeiro arranque (BD vazia), ecrã para selecionar `.zip` exportado da versão online.
   - O zip contém dump SQL + ficheiros; aplica via PGlite e copia para `FormacaoER-data/docs/`.

6. **Electron e empacotamento**
   - `electron/main.cjs` carrega `dist-electron/index.html`.
   - Recompilar com `@electron/packager` → `.zip` portátil Windows x64.
   - Apagar `/offline/` (já não é necessário).

## Notas técnicas

- TanStack Router suporta perfeitamente modo SPA (`createRouter` + `<RouterProvider>` sem `StartServer`).
- O shim local já implementa `.from().select/insert/update/delete`, `.auth`, `.storage`, `.channel`. As páginas online não precisam de mudar.
- Rotas com `loader` que chamam server fns: para Electron, transformo em queries normais via Query/`useEffect` (ou mantenho loader que invoca diretamente a função sem RPC, dado que tudo corre client-side).
- O ficheiro de BD vive em `FormacaoER-data/db.bin`. Backup = copiar essa pasta.

## Custo

É um trabalho iterativo: alguns componentes vão precisar de pequenos ajustes quando o shim não cobre 100% (joins complexos, ordenações específicas). Estimo várias rondas de fix-build até o `.exe` arrancar limpo.

Aprovas para avançar?
