// Gera a pasta dist/ a partir do output estático (.vercel/output/static),
// com um index.html SPA que carrega o entry cliente — necessário para a
// verificação de build da plataforma (a app é SSR e não emite index.html).
import { cpSync, existsSync, readdirSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const staticDir = ".vercel/output/static";
if (!existsSync(staticDir)) {
  console.error("make-dist: .vercel/output/static não existe — corre `vite build` primeiro.");
  process.exit(1);
}

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync(staticDir, "dist", { recursive: true });

const assetsDir = join("dist", "assets");
const assets = readdirSync(assetsDir);
const entry = assets.find((f) => /^client-.*\.js$/.test(f));
const styles = assets.filter((f) => f.endsWith(".css"));
if (!entry) {
  console.error("make-dist: entry cliente (client-*.js) não encontrado em dist/assets.");
  process.exit(1);
}

const html = `<!doctype html>
<html lang="pt">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="/favicon.png" />
${styles.map((s) => `    <link rel="stylesheet" href="/assets/${s}" />`).join("\n")}
    <title>Gestão de Formação</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/${entry}"></script>
  </body>
</html>
`;
writeFileSync(join("dist", "index.html"), html);
console.log(`make-dist: dist/index.html criado (entry ${entry}, ${styles.length} css).`);
