# Gestão de Formação

Aplicação de gestão pedagógica e financeira de cursos de formação (projetos, cursos, UFCD, cronograma, formadores, formandos, sessões, faltas, processamento financeiro, despesas e notas de honorários).

Stack: **React 19 + TanStack Start (Vite) + Tailwind CSS 4 + Supabase**, com deploy em **Vercel** e código em **GitHub**. Não existe qualquer dependência funcional de plataformas externas para além destas três.

---

## Arquitetura

```
GitHub  ──►  Vercel (build + SSR/Nitro preset "vercel")  ──►  Supabase
                                                              ├── Postgres (27 tabelas, RLS)
                                                              ├── Auth (email/password)
                                                              └── Storage (4 buckets privados)
```

- **Frontend/SSR**: TanStack Start com routing por ficheiros (`src/routes`). Todo o acesso a dados é feito no browser através do cliente Supabase com a *publishable key* — a RLS garante o controlo de acesso.
- **Estado de servidor**: TanStack Query.
- **Autenticação**: Supabase Auth. A rota `_authenticated` valida a sessão em `beforeLoad` e redireciona para `/auth`.
- **Exportações**: XLSX (`xlsx`, `exceljs`), PDF (`jspdf` + `jspdf-autotable`), ZIP (`jszip`) — tudo gerado no browser.

## Instalação

Requisitos: Node 20+ (ou Bun 1.2+).

```bash
bun install          # ou: npm install
cp .env.example .env # preencher com os dados do projeto Supabase
bun run dev          # http://localhost:8080
```

Scripts: `dev`, `build`, `preview`, `lint`, `format`.

## Variáveis de ambiente

Apenas três, todas públicas (client-side):

| Variável | Descrição |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave *anon/publishable* |
| `VITE_SUPABASE_PROJECT_ID` | Referência do projeto |

Nenhuma chave privada é usada pela aplicação. A `service_role` **não** existe no código nem no bundle; nunca deve ser adicionada a variáveis `VITE_*` (essas são embebidas no browser).

## Deploy (Vercel)

1. Importar o repositório GitHub no Vercel.
2. Framework: *Other*; Build Command `bun run build` (ou `npm run build`); Output detetado via `.vercel/output` (preset Nitro `vercel`).
3. Definir as três variáveis de ambiente acima (Production + Preview).
4. Deploy. Cada push para o ramo principal despoleta novo build.

## Estrutura do projeto

```
src/
├── routes/                 # rotas (file-based) — __root, auth, _authenticated/*
├── components/             # componentes de domínio + ui/ (shadcn)
├── lib/
│   ├── financeiro/         # motor de cálculo e exportações financeiras
│   ├── exports.ts          # exportações Excel gerais
│   ├── pdf-exports.ts      # exportações PDF (incl. SIGO)
│   ├── backup.ts           # backup/restauro ZIP via Supabase
│   ├── dom-helpers.ts      # utilitários de download/impressão
│   └── projeto-context.tsx # projeto ativo (contexto global)
├── integrations/supabase/  # cliente e tipos gerados
└── styles.css              # tema Tailwind 4
supabase/migrations/        # histórico de migrações SQL
```

## Base de dados

27 tabelas em `public`, 7 ENUMs, 2 funções (`set_updated_at`, `update_updated_at_column`), 16 triggers de `updated_at`, 35 chaves estrangeiras, 59 índices e RLS ativa em todas as tabelas (modelo unipessoal: acesso a utilizadores autenticados).

Alterações de esquema fazem-se sempre por nova migração em `supabase/migrations/` (nunca editar migrações antigas).

## Storage

Quatro buckets **privados**: `formador-documentos`, `formando-pra`, `despesas-anexos`, `empresa-logos`. O acesso é feito com a sessão do utilizador autenticado.

## Backups e restauro

Página **Exportar**:
- **Backup** — gera um `.zip` com `data.json` (todas as tabelas) e `storage/<bucket>/<path>` (todos os ficheiros).
- **Restauro** — lê o mesmo `.zip` e faz *upsert* por `id`, repondo também os ficheiros.

Recomenda-se ainda ativar os backups automáticos do próprio Supabase.

## Autenticação

Login por email/palavra-passe. Não há registo público. Para criar utilizadores, usar o painel de Auth do Supabase.

## Resolução de problemas

| Sintoma | Causa provável / solução |
|---|---|
| Ecrã em branco e erro `Missing Supabase environment variable(s)` | Variáveis `VITE_*` em falta no Vercel ou no `.env` local |
| Redirecionado sempre para `/auth` | Sessão expirada ou credenciais inválidas |
| Erros 401/403 nas queries | Política RLS em falta na tabela / utilizador não autenticado |
| Download de ficheiro do Storage falha | Bucket privado + sessão inválida, ou caminho inexistente |
| Build falha no Vercel | Confirmar versões fixas dos pacotes `@tanstack/*` no `package.json` |
| Exportações lentas com muitos registos | Normal: são geradas no browser; evitar intervalos muito longos |

## Licença

Uso interno.
