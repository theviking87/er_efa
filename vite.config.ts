// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// A configuração do Supabase vem exclusivamente das variáveis de ambiente
// (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_PROJECT_ID).
// No Vercel são definidas no painel do projeto; localmente em .env.local.
export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Alvo de deploy explícito: o Vercel precisa do preset "vercel" (.vercel/output).
  // Sem isto o build pode cair no preset por omissão (cloudflare-module), gerando um
  // worker que o Vercel não consegue servir em runtime.
  nitro: { preset: "vercel" },
});
