// Vite config for the Electron desktop build.
// Produces a pure-SPA bundle in dist-electron/ that uses the same UI as the
// online app, but with Supabase replaced by the local PGlite shim.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "node:path";

const r = (p: string) => path.resolve(__dirname, p);

export default defineConfig({
  base: "./",
  define: {
    "import.meta.env.VITE_OFFLINE": JSON.stringify("1"),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  plugins: [
    tanstackRouter({
      target: "react",
      routesDirectory: "src/routes",
      generatedRouteTree: "src/routeTree.gen.ts",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    // Order matters: specific aliases BEFORE the "@" catch-all.
    alias: [
      { find: "@/integrations/supabase/client", replacement: r("src/integrations/local/supabase-shim.ts") },
      { find: "@/integrations/supabase/auth-middleware", replacement: r("src/integrations/local/server-stubs/auth-middleware.ts") },
      { find: "@/integrations/supabase/client.server", replacement: r("src/integrations/local/server-stubs/client-server.ts") },
      { find: "@/integrations/supabase/auth-attacher", replacement: r("src/integrations/local/server-stubs/auth-middleware.ts") },
      { find: "@/lib/bootstrap-user.functions", replacement: r("src/integrations/local/server-stubs/bootstrap-user.ts") },
      { find: "@/lib/import-cronograma.functions", replacement: r("src/integrations/local/server-stubs/import-cronograma.ts") },
      { find: "@/lib/import-referencial.functions", replacement: r("src/integrations/local/server-stubs/import-referencial.ts") },
      { find: /^@tanstack\/react-start\/server$/, replacement: r("src/integrations/local/server-stubs/tanstack-start-server.ts") },
      { find: /^@tanstack\/react-start$/, replacement: r("src/integrations/local/tanstack-start-shim.ts") },
      { find: "@", replacement: r("src") },
    ],
  },
  build: {
    outDir: "dist-electron",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: r("index.electron.html"),
    },
  },
});
