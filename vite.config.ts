import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type Plugin } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

function disableTanStackAutomaticCsrf(): Plugin {
  return {
    name: "disable-tanstack-automatic-csrf",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("@tanstack/start-server-core/dist/esm/createStartHandler.js")) {
        return null;
      }

      const automaticCsrf =
        'var defaultCsrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" });';
      const automaticFallback =
        "requestMiddleware: hasStartInstance ? startOptions.requestMiddleware : [defaultCsrfMiddleware]";

      if (!code.includes(automaticCsrf) || !code.includes(automaticFallback)) {
        throw new Error("A estrutura interna do middleware CSRF do TanStack mudou.");
      }

      return {
        code: code
          .replace(automaticCsrf, "")
          .replace(automaticFallback, "requestMiddleware: hasStartInstance ? startOptions.requestMiddleware : []"),
        map: null,
      };
    },
  };
}

// A configuração do Supabase vem exclusivamente das variáveis de ambiente
// (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_PROJECT_ID).
// No Vercel são definidas no painel do projeto; localmente em .env.local.
export default defineConfig({
  plugins: [
    disableTanStackAutomaticCsrf(),
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      server: { entry: "server" },
      serverFns: { disableCsrfMiddlewareWarning: true },
    }),
    nitro({ preset: "vercel" }),
    viteReact(),
  ],
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "@tanstack/react-start",
      "@tanstack/react-router",
      "@tanstack/start-client-core",
      "@tanstack/start-server-core",
    ],
  },
});
