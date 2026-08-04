// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import path from "node:path";

const local = (p: string) => path.resolve(process.cwd(), "src/integrations/local", p);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      alias: [
        // Armazenamento local (offline) em vez do armazenamento online.
        { find: /^@\/integrations\/supabase\/client$/, replacement: local("client.ts") },
        { find: /^@\/lib\/import-cronograma\.functions$/, replacement: local("server-stubs/import-cronograma.ts") },
        { find: /^@\/lib\/import-referencial\.functions$/, replacement: local("server-stubs/import-referencial.ts") },
        { find: /^@\/lib\/bootstrap-user\.functions$/, replacement: local("server-stubs/bootstrap-user.ts") },
      ],
    },
    optimizeDeps: { exclude: ["@electric-sql/pglite"] },
  },
});
