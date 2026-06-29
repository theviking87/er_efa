
# App offline portátil (pen drive)

## Abordagem recomendada

**Single Page Application estática + SQLite no browser (sql.js WASM)**, com a base de dados guardada como ficheiro `.db` na própria pen.

Porquê esta e não as alternativas:

- **HTML + IndexedDB** → funciona, mas os dados ficam fechados dentro do browser de cada PC. Mudas de PC, perdes acesso. Mau para pen drive.
- **Electron portátil** → cria um `.exe` de ~200 MB só para Windows, e não corre em Mac/Linux. Demasiado pesado.
- **SPA + SQLite (sql.js)** → uma pasta na pen com `index.html` + `app.js` + `database.db`. Abres o `index.html` em qualquer browser moderno (Chrome/Edge/Firefox), em qualquer PC, sem instalar nada. Os dados ficam no ficheiro `.db` da pen — levas a pen, levas tudo. Tamanho total: ~3–5 MB.

## O que se mantém vs. muda

| Funcionalidade | Estado |
|---|---|
| Formadores, Formandos, Cursos, UFCDs, Cronograma, Sessões, Disponibilidades, PRA, Férias, Análises, Impressões | Mantém-se igual (mesma UI React) |
| Login com user/pass | Removido — a pen é o "login". Opcional: pass simples local. |
| Lovable Cloud / Supabase | Removido |
| Upload de documentos do formador / PRA | Os ficheiros ficam numa pasta `/docs/` ao lado do `.db` na pen |
| **Importar referencial PDF (IA)** | Mantém-se, mas só funciona quando há internet. Detecta automaticamente e desativa o botão se estiver offline. |

## Migração dos dados atuais

1. Antes de cortar o backend, gero uma página "Exportar tudo" que descarrega um `database.db` já pronto com todos os teus dados (formadores, cursos, sessões, PRA, etc.) + um `.zip` com os ficheiros do storage.
2. Copias os dois para a pen.
3. Abres `index.html` — está tudo lá.

## Como vai funcionar na pen

```text
pen/
├── FormacaoER/
│   ├── index.html           ← duplo-clique para abrir
│   ├── assets/              ← JS + CSS + sql.js WASM
│   ├── database.db          ← os teus dados (SQLite)
│   └── docs/                ← PDFs, anexos
```

- Abrir: duplo clique em `index.html`.
- Guardar alterações: a app escreve no `database.db` via [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) (suportada em Chrome/Edge — pede uma vez "Permitir gravar nesta pasta?" e fica memorizado).
- Backup: copiar a pasta inteira. Já tens versionamento.

## Detalhes técnicos

- **Stack**: Vite + React + Dexie-style wrapper sobre `sql.js` (SQLite compilado para WASM). Mantém o teu código React quase intacto — só substituo a camada de acesso a dados (`supabase.from(...)` → `db.query(...)`).
- **Build**: `vite build` produz uma pasta estática que copias para a pen. Sem servidor.
- **Browsers suportados**: Chrome 86+, Edge 86+, Opera. Firefox/Safari funcionam mas com fallback (descarregam `.db` modificado em vez de gravar diretamente).
- **IA (PDFs)**: o botão "Importar referencial" só ativa se `navigator.onLine === true`. Chama diretamente a API Gemini (chave guardada localmente, encriptada com pass) — sem servidor intermediário.

## Plano de execução (faseado)

1. **Fase 1 — Exportação** (sem mexer na app atual)
   Adicionar página de export que gera `database.db` + zip com storage. Garante que tens backup completo antes de migrar.

2. **Fase 2 — Nova app offline** (projeto novo)
   Criar a versão portátil em paralelo. Camada de dados em SQLite/sql.js, mesmas telas e funcionalidades.

3. **Fase 3 — Migração**
   Importar o `database.db` exportado, validar que está tudo (cursos, sessões, PRAs).

4. **Fase 4 — Aposentar versão online**
   Quando confirmares que a offline está OK, podes deixar a online morrer ou mantê-la como backup só de leitura.

## Confirmações que preciso

Antes de começar pela Fase 1:

1. Confirmas o formato pen drive + `index.html`? (alternativa: gero também um `.bat` "Abrir Formação" que abre no Chrome em modo app)
2. Queres pass simples na abertura, ou totalmente sem login?
3. Os PDFs (documentos do formador, PRAs dos formandos) — manter na pen em `/docs/` é OK, ou preferes embebidos no próprio `.db` (mais pesado mas 1 ficheiro só)?
