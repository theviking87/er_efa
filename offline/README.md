# Formação ER — versão offline portátil

App que corre 100% no browser, com a base de dados (`database.db`, SQLite via
sql.js) e os documentos (`docs/`) gravados diretamente na pen drive através
da File System Access API.

## Como funciona

1. Duplo clique em **`Abrir Formação.bat`** (Windows). Abre o Chrome/Edge em modo app.
2. Escolhes a pasta da pen onde queres trabalhar.
3. 1.ª vez: importa o `backup-formacao-*.zip` exportado da versão online.
4. Defines uma palavra-passe local.
5. A app está pronta. Cada alteração é gravada automaticamente no `.db`.

## Build (gera a pasta para copiar para a pen)

A partir da raiz do projeto:

```bash
bun run offline:build
```

O resultado fica em `offline/dist/`. Copia o conteúdo dessa pasta para a pen,
junto com o `Abrir Formação.bat`. A estrutura final na pen é:

```
FormacaoER/
├── Abrir Formação.bat
├── index.html
├── assets/
├── database.db        (criado no 1.º arranque)
└── docs/              (criado no 1.º arranque)
```

## Dev (testar localmente)

```bash
bun run offline:dev
```

Abre [http://localhost:5180](http://localhost:5180). A FSA só funciona em
Chrome/Edge — Firefox/Safari não conseguem gravar diretamente na pen.

## Limitações conhecidas

- Sem importação de referencial PDF por IA (requer internet — fica só na versão online).
- Sem autenticação multi-utilizador. Quem tem a pen + a palavra-passe entra.
- Browser obrigatório: Chrome 86+ ou Edge 86+ (File System Access API).
