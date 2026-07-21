# Arquitetura — Formação ER v1.0

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | TanStack Start v1 (Vite 7, React 19) |
| Routing | TanStack Router (file-based, `src/routes/`) |
| Estado servidor | TanStack Query |
| UI | Tailwind CSS v4 + shadcn/ui |
| Backend cloud | Lovable Cloud (Supabase) — Postgres + Auth + Storage |
| Backend offline | PGlite (Postgres em WASM) + FS local via Electron IPC |
| Desktop | Electron (main em `electron/main.cjs`) |
| Deploy web | Vercel |

## Estrutura de pastas

```
src/
├── routes/
│   ├── __root.tsx              shell HTML, providers globais
│   ├── index.tsx               / (landing → redirect para /dashboard)
│   ├── auth.tsx                /auth (login)
│   └── _authenticated/         layout com gate de sessão + AppShell
│       ├── route.tsx           beforeLoad: getUser() || redirect(/auth)
│       ├── dashboard.tsx
│       ├── projetos.*.tsx
│       ├── cursos.*.tsx
│       ├── formadores.*.tsx
│       ├── formandos.*.tsx
│       ├── cronograma.tsx
│       ├── ufcds.tsx
│       ├── financeiro.*.tsx    módulo Financeiro (11 rotas)
│       └── nota-honorarios.tsx
├── components/
│   ├── app-shell.tsx           sidebar + topbar + ProjetoSelector
│   ├── financeiro/             painéis por entidade
│   └── ui/                     shadcn primitives
├── lib/
│   ├── financeiro/             motor + serviços (ver MOTOR_FINANCEIRO.md)
│   ├── projeto-context.tsx     contexto global "projeto ativo"
│   ├── local-db.ts             bootstrap PGlite (offline)
│   ├── local-migrations.generated.ts   bundle de migrações (auto-gen)
│   ├── electron-io.ts          bridge para IPC do Electron
│   ├── pdf-exports.ts          geração de PDFs (jsPDF + html2canvas)
│   ├── exports.ts              exports Excel (xlsx)
│   ├── weekend-check.ts        alerta de sessões ao fim de semana
│   └── format.ts               helpers de data/número
├── integrations/
│   ├── supabase/               cliente cloud (auto-gerado)
│   └── local/                  shims offline (ver OFFLINE.md)
└── hooks/use-mobile.tsx
```

## Providers globais

Em `src/routes/__root.tsx`, à volta do `<Outlet />`:

```
QueryClientProvider
  └── ProjetoProvider          → localStorage: projeto_ativo_id
       └── TooltipProvider
            └── <Outlet />
                 └── Toaster (sonner)
```

`ProjetoProvider` fornece `useProjetoAtivo()` que devolve `{ projetoId, projeto, setProjetoId }`. Rotas filtram queries por `projeto_id` sempre que faz sentido (dashboard, cursos, processamentos financeiros).

## Autenticação

- **Cloud:** Supabase Auth (email/password). Gate em `_authenticated/route.tsx`.
- **Offline (Electron):** `src/integrations/local/auth-shim.ts` aceita `formacao / ER2026` hardcoded. Sessão persiste em `localStorage`.

Modelo unipessoal por design (RC v1.0). Roles reais ficam para V2 (ver `docs/AUDITORIA_V1.md` §10).

## Camada de dados

Todo o código de aplicação importa exclusivamente:

```ts
import { supabase } from "@/integrations/supabase/client";
```

- **Build web:** resolve para o cliente Supabase real.
- **Build Electron (`VITE_OFFLINE=1`):** `vite.config.electron.ts` faz alias para `src/integrations/local/supabase-shim.ts`, que reimplementa `.from()`, `.auth`, `.storage`, `.channel()` sobre PGlite.

Isto significa que **as rotas não sabem** se estão a correr em cloud ou offline — a mesma query `supabase.from("cursos").select("*, curso_ufcds(...)")` funciona nas duas builds.

Ver `docs/OFFLINE.md` para o mapa completo de shims.

## Server functions

`createServerFn` (`@tanstack/react-start`) é usado em 3 sítios:

- `src/lib/bootstrap-user.functions.ts` — cria linha em `fin_utilizadores` no primeiro login.
- `src/lib/import-cronograma.functions.ts` — importa Excel de cronograma.
- `src/lib/import-referencial.functions.ts` — extrai UFCDs de PDF via Lovable AI.

Na build Electron, `@tanstack/react-start` é aliased para `tanstack-start-shim.ts` (identidade para `useServerFn`) e cada função tem um stub local em `src/integrations/local/server-stubs/`.

## Financeiro

Módulo isolado em `src/lib/financeiro/`. Ver `docs/MOTOR_FINANCEIRO.md`.

## Convenções

- Rotas: `dot.notation` para hierarquia (`cursos.$id.importar.tsx`).
- Componentes de rota: `PascalCase` no ficheiro, exportados como `Route`.
- Serviços de dados: puros, sem JSX, em `src/lib/**/services/`.
- Formatação: Prettier + ESLint (configuração no repo).
- Zero `console.*` em rotas (aceitável em `lib/electron-io.ts` e importadores).

## Deploy

- **Vercel:** `vite build` → static + SSR edge. Requer `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
- **Electron Windows:** `npm run electron:build:win` → `electron-release/FormacaoER-win32-x64/`.
- **Electron macOS:** `npm run electron:build:mac`.
