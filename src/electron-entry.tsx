// Client-only entry point for the Electron desktop build.
// No SSR, no TanStack Start. Uses the same routes/UI as the online app.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter, createHashHistory } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import "./styles.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import { Toaster } from "@/components/ui/sonner";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

// Hash history works under file:// (Electron) without needing a server.
const router = createRouter({
  routeTree,
  context: { queryClient },
  history: createHashHistory(),
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function showFatal(msg: string) {
  const el = document.getElementById("root");
  if (el) {
    el.innerHTML = `<div style="padding:24px;font-family:system-ui;color:#b91c1c;white-space:pre-wrap"><h2 style="margin:0 0 12px">Erro ao iniciar</h2><pre style="font-size:12px;background:#fff1f2;padding:12px;border-radius:8px;overflow:auto">${msg.replace(/</g, "&lt;")}</pre><p style="font-size:12px;color:#475569">Pressiona F12 para abrir as ferramentas de programador.</p></div>`;
  }
}
window.addEventListener("error", (e) => showFatal(`${e.message}\n${e.error?.stack ?? ""}`));
window.addEventListener("unhandledrejection", (e) => showFatal(`Unhandled promise:\n${(e.reason && (e.reason.stack || e.reason.message)) || String(e.reason)}`));

try {
  const root = createRoot(document.getElementById("root")!);
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>
    </StrictMode>,
  );
} catch (err: any) {
  showFatal(err?.stack ?? String(err));
}
