// Local PGlite database — offline replacement for Supabase Postgres.
// Runs in the renderer (browser/Electron) with IndexedDB persistence.
//
// Status: foundation only. The shim that translates Supabase query-builder
// calls into PGlite SQL lives in `src/integrations/local/postgrest-shim.ts`
// (to be wired into `src/integrations/supabase/client.ts` once stable).
import { PGlite } from "@electric-sql/pglite";
import { MIGRATIONS } from "./local-migrations.generated";

let _db: PGlite | null = null;
let _ready: Promise<PGlite> | null = null;

export function isElectron(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).electronAPI?.isElectron);
}

/**
 * Strip statements that PGlite cannot run (RLS, grants, policies, references
 * to the Supabase-managed `auth` and `storage` schemas).
 *
 * We split on semicolons-at-end-of-line as a pragmatic heuristic; the project's
 * migrations all use that style. If a migration ever uses dollar-quoted bodies
 * with semicolons inside, extend this to be DO-block aware.
 */
function preprocess(sql: string): string {
  // Drop comments first to make the regex matching simpler.
  const noBlock = sql.replace(/\/\*[\s\S]*?\*\//g, "");
  const stripped = noBlock
    .split(/\n/)
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");

  // Split on `;` that terminates a statement (newline or EOF after).
  const statements = stripped.split(/;\s*(?=\n|$)/);

  const SKIP_PATTERNS: RegExp[] = [
    /^\s*grant\b/i,
    /^\s*revoke\b/i,
    /^\s*create\s+policy\b/i,
    /^\s*drop\s+policy\b/i,
    /^\s*alter\s+policy\b/i,
    /^\s*alter\s+table[\s\S]+enable\s+row\s+level\s+security/i,
    /^\s*alter\s+table[\s\S]+disable\s+row\s+level\s+security/i,
    /^\s*alter\s+table[\s\S]+force\s+row\s+level\s+security/i,
    /^\s*insert\s+into\s+storage\./i,
    /^\s*create\s+(unique\s+)?index[\s\S]+on\s+storage\./i,
    /^\s*create\s+trigger[\s\S]+on\s+storage\./i,
  ];

  const kept = statements
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s) => !SKIP_PATTERNS.some((rx) => rx.test(s)))
    // Drop FK clauses pointing to auth.users — replace with plain uuid column.
    .map((s) => s.replace(/\bREFERENCES\s+auth\.users\s*\([^)]*\)(\s+ON\s+\w+\s+\w+)*/gi, ""))
    // Strip "TO authenticated"/"TO service_role"/"TO anon" leftovers (in case
    // they sneak through). PGlite has no roles model.
    .map((s) => s.replace(/\bTO\s+(authenticated|service_role|anon)\b/gi, ""));

  return kept.join(";\n") + ";";
}

async function initSchema(db: PGlite): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _local_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const applied = await db.query<{ name: string }>(`SELECT name FROM _local_migrations`);
  const done = new Set(applied.rows.map((r) => r.name));

  for (const m of MIGRATIONS) {
    if (done.has(m.name)) continue;
    const cleaned = preprocess(m.sql);
    if (!cleaned.trim() || cleaned.trim() === ";") {
      await db.query(`INSERT INTO _local_migrations(name) VALUES ($1)`, [m.name]);
      continue;
    }
    try {
      await db.exec(cleaned);
      await db.query(`INSERT INTO _local_migrations(name) VALUES ($1)`, [m.name]);
      console.log(`[local-db] applied migration ${m.name}`);
    } catch (err) {
      console.error(`[local-db] FAILED migration ${m.name}:\n`, cleaned, "\n", err);
      throw err;
    }
  }
}

export async function getLocalDb(): Promise<PGlite> {
  if (_db) return _db;
  if (_ready) return _ready;
  _ready = (async () => {
    const db = new PGlite("idb://formacao-er-db");
    await initSchema(db);
    _db = db;
    return db;
  })();
  return _ready;
}

/** Convenience: run a single SQL with $1, $2… params. Returns rows. */
export async function localQuery<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getLocalDb();
  const res = await db.query<T>(sql, params);
  return res.rows;
}
