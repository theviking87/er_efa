# Fase 2 — App offline portátil

Decisões confirmadas:
- Pasta `/offline/` no mesmo projeto, build próprio (Vite+React independente).
- Importação inicial a partir do `backup-formacao-*.zip` exportado na Fase 1.
- Sem IA / sem importação de referencial PDF na offline.
- Pass simples na abertura. PDFs em pastas. Lançador `.bat`.

## Estrutura final na pen

```text
FormacaoER/
├── Abrir Formação.bat       ← duplo clique
├── index.html
├── assets/                  ← JS + CSS + sql-wasm.wasm bundlados
├── database.db              ← SQLite (criado no 1.º arranque)
└── docs/
    ├── formadores/<id>/...
    └── cursos/<id>/formandos/<id>/...
```

## Estrutura no repositório

```text
offline/
├── package.json             ← Vite+React próprio, sem TanStack Start, sem Supabase
├── vite.config.ts           ← build → offline/dist, base: "./" (file://)
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx              ← roteamento com react-router (hash router → file://)
│   ├── db/
│   │   ├── sqljs.ts         ← bootstrap sql.js, schema, migrations
│   │   ├── persistence.ts   ← FSA: handle da pasta, save/load database.db
│   │   ├── repo.ts          ← API tipada (substitui `supabase.from`)
│   │   └── import-zip.ts    ← lê backup-formacao-*.zip e popula a BD + /docs
│   ├── routes/              ← portados 1:1 a partir de src/routes/_authenticated/
│   ├── components/          ← portados
│   ├── lib/                 ← format/feriados/utils reaproveitados
│   └── gate.tsx             ← ecrã inicial: escolher pasta → unlock → app
└── public/
    └── Abrir Formação.bat
```

## Como vai funcionar

1. Utilizador faz duplo clique no `.bat` → abre Chrome em modo app no `index.html`.
2. 1.º arranque: pede pass → escolher pasta da pen (FSA `showDirectoryPicker`).
3. Se não existir `database.db`, pede o `backup-formacao-*.zip` → cria `database.db` + popula `docs/`.
4. Trabalho normal: todas as escritas vão para sql.js em memória + flush automático para `database.db` no disco (debounced 1–2s).
5. Próximos arranques: pass → carrega a BD do mesmo handle (memorizado em IndexedDB).

## Camada de dados

`db/repo.ts` expõe funções por entidade (`listFormadores`, `upsertFormador`, `listSessoesByCurso`, etc.) com a mesma forma de retorno que o código atual já consome. Cada rota só troca os imports de `@/integrations/supabase/client` por `@/db/repo`. Schema SQLite replica as tabelas Supabase atuais (sem RLS — não aplicável).

## Ficheiros (PDFs)

- Upload: gravado em `docs/<scope>/<id>/<nome-sanitizado>.ext` via FSA, e o caminho relativo guardado na BD.
- Leitura: abre `File` a partir do `FileSystemFileHandle` e mostra com `URL.createObjectURL`.

## .bat launcher

```bat
@echo off
start "" chrome --app="file://%~dp0index.html"
```

Fallback se Chrome não estiver em PATH: tenta `msedge`. Documento no README.

## Fora do âmbito

- IA / importação de referencial PDF.
- Auth (sem login Supabase; pass local só).
- Sincronização bidirecional online ↔ offline (a app online fica como leitura/backup, conforme Fase 4).

## Plano de turnos

1. **Este turno** — scaffold completo: `offline/` com package.json, vite config, sql.js bootstrap, schema, FSA persistence, importador de zip, gate (pass + escolher pasta), `.bat`, README. App arranca, importa o zip, mostra um dashboard mínimo a confirmar contagens. **Sem rotas portadas ainda.**
2. **Turno seguinte** — portar Formadores, Formandos, UFCDs, Cursos (CRUD).
3. **Turno seguinte** — portar Cronograma geral + cronograma do curso + sessões + disponibilidades.
4. **Turno seguinte** — PRA, férias, análise, impressões, relatórios.
5. **Validação final** — testar a partir de uma pen real, comparar com a online.

Confirma para arrancar com o turno 1 (scaffold).
