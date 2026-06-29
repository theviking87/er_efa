// Client-only entry point for the Electron desktop build.
// No SSR, no TanStack Start. Uses the same routes/UI as the online app.
import { StrictMode, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter, createHashHistory } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./styles.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import { Toaster } from "@/components/ui/sonner";
import { getLocalDataSummary, importLocalBackupZip, type LocalImportSummary } from "@/lib/local-import-backup";

const LOCAL_SESSION_KEY = "formacao-er-local-session";
const LOCAL_IMPORTED_KEY = "formacao-er-local-imported";
const VALID_USER = "formacao";
const VALID_PASS = "ER2026";

type LocalSession = {
  user: { id: string; email: string; user_metadata: { username: string } };
  access_token: string;
  expires_at: number;
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

function showFatal(msg: string) {
  const el = document.getElementById("root");
  if (el) {
    el.innerHTML = `<div style="padding:24px;font-family:system-ui;color:#b91c1c;white-space:pre-wrap"><h2 style="margin:0 0 12px">Erro ao iniciar</h2><pre style="font-size:12px;background:#fff1f2;padding:12px;border-radius:8px;overflow:auto">${msg.replace(/</g, "&lt;")}</pre><p style="font-size:12px;color:#475569">Pressiona F12 para abrir as ferramentas de programador.</p></div>`;
  }
}
window.addEventListener("error", (e) => showFatal(`${e.message}\n${e.error?.stack ?? ""}`));
window.addEventListener("unhandledrejection", (e) => showFatal(`Unhandled promise:\n${(e.reason && (e.reason.stack || e.reason.message)) || String(e.reason)}`));

function readLocalSession(): LocalSession | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_SESSION_KEY);
    return raw ? (JSON.parse(raw) as LocalSession) : null;
  } catch {
    return null;
  }
}

function writeLocalSession() {
  const session: LocalSession = {
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      email: `${VALID_USER}@local`,
      user_metadata: { username: VALID_USER },
    },
    access_token: "local-offline-token",
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
  };
  window.localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session));
}

function OfflineLogin({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const user = username.trim().toLowerCase();
    if (user !== VALID_USER || password !== VALID_PASS) {
      setError("Utilizador ou palavra-passe incorretos.");
      return;
    }
    writeLocalSession();
    window.location.hash = "/dashboard";
    onLogin();
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background text-foreground">
      <section className="hidden lg:flex flex-col justify-between bg-foreground text-background p-12">
        <div className="font-semibold tracking-tight">Elisabete Ribeiro</div>
        <div className="space-y-4 max-w-md">
          <h1 className="text-4xl font-semibold leading-tight">Gestão pedagógica, cronogramas e SIGO.</h1>
          <p className="text-background/70 text-sm leading-relaxed">
            Plataforma interna do Centro de Formação. Cursos EFA, ERFA, MFA — formadores, UFCD, cronogramas e exportações num só lugar.
          </p>
        </div>
        <div className="text-xs text-background/50">© {new Date().getFullYear()} Elisabete Ribeiro — Centro de Formação</div>
      </section>
      <main className="flex items-center justify-center p-6 lg:p-12">
        <form onSubmit={submit} className="w-full max-w-sm space-y-6" autoComplete="on">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Aceder ao sistema</h2>
            <p className="text-sm text-muted-foreground mt-1">Inicie sessão com o nome de utilizador e palavra-passe.</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="offline-username" className="text-sm font-medium">Nome de utilizador</label>
            <input
              id="offline-username"
              name="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="offline-password" className="text-sm font-medium">Palavra-passe</label>
            <input
              id="offline-password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              autoComplete="current-password"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
          <button type="submit" className="h-10 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            Entrar
          </button>
        </form>
      </main>
    </div>
  );
}

function ElectronRouterApp() {
  const [router, setRouter] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const history = useMemo(() => createHashHistory(), []);

  useEffect(() => {
    let cancelled = false;
    import("./routeTree.gen")
      .then(({ routeTree }) => {
        if (cancelled) return;
        setRouter(createRouter({
          routeTree,
          context: { queryClient },
          history,
          defaultPreloadStaleTime: 0,
          scrollRestoration: true,
        }));
      })
      .catch((err) => setLoadError(err?.stack ?? String(err)));
    return () => { cancelled = true; };
  }, [history]);

  if (loadError) {
    return <pre className="p-6 text-sm text-destructive whitespace-pre-wrap">{loadError}</pre>;
  }
  if (!router) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">A carregar aplicação…</div>;
  }
  return <RouterProvider router={router} />;
}

function OfflineDataGate({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState("A verificar dados locais…");
  const [summary, setSummary] = useState<LocalImportSummary | null>(null);
  const [error, setError] = useState("");
  const [continueEmpty, setContinueEmpty] = useState(false);

  async function refreshSummary() {
    setChecking(true);
    setError("");
    try {
      const counts = await getLocalDataSummary();
      const total = ["cursos", "formadores", "formandos", "ufcds", "sessoes"].reduce((acc, key) => acc + (counts[key] ?? 0), 0);
      // Se uma versão anterior marcou a importação como feita mas a BD ficou
      // vazia/parcial, não podemos esconder o ecrã de importação: isso deixava
      // a app a abrir sem dados e sem pedir novamente o backup.
      if (total === 0) window.localStorage.removeItem(LOCAL_IMPORTED_KEY);
      setEmpty(total === 0);
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setEmpty(true);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => { void refreshSummary(); }, []);

  async function handleFile(file: File | null) {
    if (!file) return;
    setImporting(true);
    setError("");
    setSummary(null);
    try {
      const result = await importLocalBackupZip(file, setProgress);
      const coreTotal = ["cursos", "formadores", "formandos", "ufcds", "sessoes"].reduce((acc, key) => acc + (result.tables[key] ?? 0), 0);
      if (coreTotal === 0) {
        window.localStorage.removeItem(LOCAL_IMPORTED_KEY);
        throw new Error("O backup foi lido, mas não importou dados principais (cursos/formadores/formandos/UFCD/sessões). Confirma que escolheste o backup completo exportado pela aplicação online.");
      }
      window.localStorage.setItem(LOCAL_IMPORTED_KEY, "1");
      setSummary(result);
      setEmpty(false);
      queryClient.clear();
      window.location.hash = "/dashboard";
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setImporting(false);
    }
  }

  if (checking) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">{progress}</div>;
  }

  if (empty && !continueEmpty) {
    const totalImported = summary ? Object.values(summary.tables).reduce((a, b) => a + b, 0) : 0;
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-5 border rounded-lg p-6 bg-card shadow-sm">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Importar dados</h1>
            <p className="text-sm text-muted-foreground">Antes de usar a versão offline, seleciona o backup <strong>.zip</strong> exportado da versão online.</p>
          </div>
          <label className="block">
            <span className="sr-only">Selecionar backup</span>
            <input
              type="file"
              accept=".zip,application/zip"
              disabled={importing}
              onChange={(e) => void handleFile(e.currentTarget.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:opacity-90 disabled:opacity-60"
            />
          </label>
          <div className="min-h-6 text-sm text-muted-foreground">{importing ? progress : summary ? `${totalImported} registos importados · ${summary.files} documentos copiados` : ""}</div>
          {summary?.warnings.length ? <p className="text-xs text-amber-700">Alguns documentos não foram copiados: {summary.warnings.slice(0, 3).join("; ")}</p> : null}
          {error ? <pre className="text-xs whitespace-pre-wrap rounded-md bg-destructive/10 text-destructive p-3">{error}</pre> : null}
          <div className="flex gap-2 justify-between pt-2">
            <button type="button" className="text-sm text-muted-foreground hover:underline" onClick={() => setContinueEmpty(true)} disabled={importing}>Entrar vazio</button>
            <button type="button" className="h-10 rounded-md border px-4 text-sm font-medium" onClick={refreshSummary} disabled={importing}>Verificar novamente</button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function ElectronApp() {
  const [signedIn, setSignedIn] = useState(() => Boolean(readLocalSession()));
  return signedIn ? (
    <QueryClientProvider client={queryClient}>
      <OfflineDataGate>
        <ElectronRouterApp />
      </OfflineDataGate>
      <Toaster />
    </QueryClientProvider>
  ) : (
    <>
      <OfflineLogin onLogin={() => setSignedIn(true)} />
      <Toaster />
    </>
  );
}

try {
  const root = createRoot(document.getElementById("root")!);
  root.render(
    <StrictMode>
      <ElectronApp />
    </StrictMode>,
  );
} catch (err: any) {
  showFatal(err?.stack ?? String(err));
}
