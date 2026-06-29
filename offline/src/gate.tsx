// Three-step gate: choose folder → unlock with password → app.
// The password is hashed and stored in localStorage; first run sets it.

import { useEffect, useState } from "react";
import { hasRoot, loadSavedRoot, pickRoot } from "./db/persistence";
import {
  openDatabase,
  flushNow,
  count as countRows,
} from "./db/sqljs";
import { ensureMinimalSchema, KNOWN_TABLES, normalizeImportedSchema } from "./db/schema";
import { readDatabaseBytes } from "./db/persistence";
import { importBackupZip, type ImportSummary } from "./db/import-zip";

const PASS_KEY = "formacao-er-pass-hash";

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Stage = "boot" | "pickFolder" | "needImport" | "password" | "ready";

export function Gate({ children }: { children: React.ReactNode }) {
  const [stage, setStage] = useState<Stage>("boot");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // ---- boot: try to silently re-open the last folder ------------------
  useEffect(() => {
    (async () => {
      try {
        if (!("showDirectoryPicker" in window)) {
          setError(
            "Este browser não suporta a File System Access API. Usa o Chrome ou o Edge.",
          );
          return;
        }
        const dir = await loadSavedRoot();
        if (!dir) {
          setStage("pickFolder");
          return;
        }
        await openExisting();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStage("pickFolder");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openExisting() {
    setBusy("A abrir base de dados…");
    try {
      const bytes = await readDatabaseBytes();
      if (!bytes) {
        await openDatabase(null);
        ensureMinimalSchema();
        setBusy(null);
        setStage("needImport");
        return;
      }
      await openDatabase(bytes);
      setBusy(null);
      setStage("password");
    } catch (e) {
      // Handle stale (e.g. drive letter changed) — force re-pick.
      setBusy(null);
      setError(
        "Não consegui aceder à pasta guardada (a letra da pen pode ter mudado). Escolhe a pasta outra vez.",
      );
      setStage("pickFolder");
      console.error(e);
    }
  }

  async function onPickFolder() {
    setError(null);
    try {
      await pickRoot();
      await openExisting();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (stage === "boot" || busy) {
    return <Centered><p className="text-sm text-slate-500">{busy ?? "A carregar…"}</p></Centered>;
  }
  if (error && stage === "pickFolder") {
    return (
      <Centered>
        <h1 className="text-xl font-semibold mb-2">Formação ER — Offline</h1>
        <p className="text-sm text-red-600 mb-4">{error}</p>
        <button className="btn btn-primary" onClick={onPickFolder}>Escolher pasta na pen</button>
      </Centered>
    );
  }
  if (stage === "pickFolder") {
    return (
      <Centered>
        <h1 className="text-xl font-semibold mb-1">Formação ER — Offline</h1>
        <p className="text-sm text-slate-500 mb-6 max-w-md text-center">
          Escolhe a pasta da pen drive onde queres trabalhar. A base de dados
          (<code>database.db</code>) e os documentos (<code>docs/</code>) ficam guardados aí.
        </p>
        <button className="btn btn-primary" onClick={onPickFolder}>Escolher pasta…</button>
      </Centered>
    );
  }
  if (stage === "needImport") {
    return <ImportScreen onDone={() => setStage("password")} />;
  }
  if (stage === "password") {
    return <PasswordScreen onUnlock={() => setStage("ready")} />;
  }
  return <>{children}</>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-2">{children}</div>
    </div>
  );
}

function ImportScreen({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);

  async function pickAndImport(file: File) {
    setBusy(true);
    setError(null);
    try {
      const s = await importBackupZip(file, setProgress);
      setSummary(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function startEmpty() {
    setBusy(true);
    try {
      ensureMinimalSchema();
      await flushNow();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  if (summary) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold mb-2">Importação concluída</h1>
        <div className="card max-w-md w-full text-sm">
          <p className="mb-2 font-medium">{summary.files} ficheiros copiados.</p>
          <ul className="text-xs text-slate-600 space-y-0.5 max-h-64 overflow-auto">
            {Object.entries(summary.tables).map(([t, n]) => (
              <li key={t}><code>{t}</code>: {n}</li>
            ))}
          </ul>
          {summary.warnings.length > 0 && (
            <p className="text-xs text-amber-600 mt-2">{summary.warnings.length} avisos.</p>
          )}
        </div>
        <button className="btn btn-primary mt-4" onClick={onDone}>Continuar</button>
      </Centered>
    );
  }

  return (
    <Centered>
      <h1 className="text-xl font-semibold mb-1">Primeira utilização</h1>
      <p className="text-sm text-slate-500 mb-6 max-w-md text-center">
        Esta pasta ainda não tem base de dados. Importa o ficheiro <code>backup-formacao-*.zip</code>
        que geraste na versão online, ou começa com uma base vazia.
      </p>
      <label className="btn btn-primary cursor-pointer">
        {busy ? (progress ?? "A importar…") : "Importar backup .zip"}
        <input
          type="file"
          accept=".zip"
          className="hidden"
          disabled={busy}
          onChange={(e) => e.target.files?.[0] && pickAndImport(e.target.files[0])}
        />
      </label>
      <button className="btn btn-outline mt-2" disabled={busy} onClick={startEmpty}>
        Começar do zero
      </button>
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
    </Centered>
  );
}

function PasswordScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const existing = localStorage.getItem(PASS_KEY);
  const isSetup = !existing;

  // Show a one-line stat after unlock so the user sees the import worked.
  function statsLine(): string {
    try {
      const parts = KNOWN_TABLES.slice(0, 5)
        .map((t) => `${t}: ${countRows(t)}`)
        .join(" · ");
      return parts;
    } catch {
      return "";
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (isSetup) {
      if (pw.length < 4) return setError("Define uma palavra-passe com 4+ caracteres.");
      if (pw !== pw2) return setError("As palavras-passe não coincidem.");
      localStorage.setItem(PASS_KEY, await sha256(pw));
      onUnlock();
      return;
    }
    const h = await sha256(pw);
    if (h !== existing) return setError("Palavra-passe incorreta.");
    onUnlock();
  }

  return (
    <Centered>
      <h1 className="text-xl font-semibold mb-1">Formação ER</h1>
      <p className="text-xs text-slate-500 mb-1">{statsLine()}</p>
      <form onSubmit={submit} className="card w-80 mt-3 space-y-3">
        <div>
          <label className="text-xs text-slate-500 block mb-1">
            {isSetup ? "Define a palavra-passe" : "Palavra-passe"}
          </label>
          <input
            type="password"
            autoFocus
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="input"
          />
        </div>
        {isSetup && (
          <div>
            <label className="text-xs text-slate-500 block mb-1">Repete</label>
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              className="input"
            />
          </div>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button className="btn btn-primary w-full justify-center" type="submit">
          {isSetup ? "Guardar e entrar" : "Entrar"}
        </button>
      </form>
    </Centered>
  );
}
