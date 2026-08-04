# Changelog

## [1.0.0] — Migração concluída, projeto autónomo

Encerramento da migração para uma infraestrutura própria: **GitHub + Vercel + Supabase**.

### Migração de infraestrutura
- Base de dados migrada na íntegra para a instância Supabase própria: 27 tabelas, 7 ENUMs, 2 funções, 16 triggers, 28 políticas RLS, 35 chaves estrangeiras e 59 índices.
- Dados migrados: **3.227 registos** e **9 ficheiros** de Storage (4 buckets privados). Integridade referencial garantida pelas chaves estrangeiras — sem órfãos.
- Utilizadores recriados no Auth da instância própria.
- Deploy exclusivamente no Vercel (preset Nitro `vercel`), a partir do repositório GitHub.

### Removido
- Modo offline completo: PGlite, IndexedDB, bundle local de migrações e aliases associados.
- Camada de "relatórios nativos" (`runNativeExcelReport`, `runNativePdfReport`) e ramos condicionais `VITE_OFFLINE`.
- Stub `localRows()` e todos os caminhos de leitura local — todas as páginas leem agora diretamente do Supabase.
- Aliases legados em `src/lib/dom-helpers.ts` (`saveFileElectron`, `printHtmlWithFallback`, `paintBeforeHeavyWork`).
- Integração de IA (gateway externo e OpenAI) e respetivas dependências.
- Wrapper de build externo; `vite.config.ts` passou a usar apenas plugins oficiais.
- Injeção de credenciais via `define` no Vite — passam a vir exclusivamente de `import.meta.env`.
- Componentes UI não utilizados: `calendar`, `chart`, `collapsible`, `form`, `popover`, `sidebar`, `toggle`.
- Dependências sem utilização: `@hookform/resolvers`, `react-hook-form`, `react-day-picker`, `recharts`, `zod`, `cmdk`, `vaul`, `input-otp`, `embla-carousel-react`, `react-resizable-panels` e 12 pacotes `@radix-ui/*` órfãos.

### Corrigido
- Erro de runtime no Vercel `TypeError: createMiddleware is not a function`, através da desativação do middleware CSRF automático do TanStack Start no `vite.config.ts`.
- 404 do favicon (`public/favicon.png`).

### Mantido
- Todas as funcionalidades: Login, Dashboard, Projetos, Cursos, UFCD, Cronograma, Formadores, Formandos, Sessões, Faltas, Processamento Financeiro, Despesas, Notas de Honorários, Relatórios, Backup e Restauro.
- Autenticação Supabase, middleware e RLS inalterados.

### Documentação
- `README.md` reescrito (arquitetura, instalação, deploy, variáveis de ambiente, estrutura, backups, storage, autenticação e resolução de problemas).
- Este `CHANGELOG.md`.
