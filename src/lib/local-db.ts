// Local PGlite database — offline replacement for Supabase Postgres.
// Runs in the renderer (browser/Electron) with IndexedDB persistence.
//
// Status: foundation only. The shim that translates Supabase query-builder
// calls into PGlite SQL lives in `src/integrations/local/postgrest-shim.ts`
// (to be wired into `src/integrations/supabase/client.ts` once stable).
import { PGlite } from "@electric-sql/pglite";
import { PGliteWorker } from "@electric-sql/pglite/worker";
import { MIGRATIONS } from "./local-migrations.generated";
import { resetRelationshipCache } from "@/integrations/local/relationships";

export type LocalDb = Pick<PGlite, "query" | "exec" | "close"> & Record<string, any>;

let _db: LocalDb | null = null;
let _ready: Promise<LocalDb> | null = null;

const APP_TABLES = [
  "ufcds",
  "formadores",
  "formandos",
  "cursos",
  "curso_ufcds",
  "curso_formandos",
  "curso_ufcd_formadores",
  "curso_ferias",
  "cronograma_observacoes",
  "formador_ufcds",
  "formador_disponibilidades",
  "formador_inatividades",
  "formador_documentos",
  "formando_faltas",
  "formando_pra",
  "sessoes",
];

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
  let stripped = noBlock
    .split(/\n/)
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");

  // Strip DO $$ ... END $$; blocks entirely — they are realtime/publication
  // wiring that PGlite cannot run (and the semicolon-splitter would break them).
  stripped = stripped.replace(/\bDO\s*\$\$[\s\S]*?\$\$\s*;?/gi, "");

  // Split on real statement terminators. A naive `.split(';')` breaks PL/pgSQL
  // functions and DO blocks, which was the reason some local databases stopped
  // halfway through the first migration and then opened as an empty app.
  const statements = splitSqlStatements(stripped);

  const SKIP_PATTERNS: RegExp[] = [
    /^\s*grant\b/i,
    /^\s*revoke\b/i,
    /^\s*create\s+policy\b/i,
    /^\s*drop\s+policy\b/i,
    /^\s*alter\s+policy\b/i,
    /^\s*alter\s+table[\s\S]+enable\s+row\s+level\s+security/i,
    /^\s*alter\s+table[\s\S]+disable\s+row\s+level\s+security/i,
    /^\s*alter\s+table[\s\S]+force\s+row\s+level\s+security/i,
    /^\s*alter\s+table[\s\S]+replica\s+identity/i,
    /^\s*alter\s+publication\b/i,
    /^\s*create\s+publication\b/i,
    /^\s*drop\s+publication\b/i,
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

function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let single = false;
  let double = false;
  let dollarTag: string | null = null;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const rest = sql.slice(i);

    if (!single && !double) {
      if (dollarTag) {
        if (rest.startsWith(dollarTag)) {
          buf += dollarTag;
          i += dollarTag.length - 1;
          dollarTag = null;
          continue;
        }
      } else if (ch === "$") {
        const m = rest.match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
        if (m) {
          dollarTag = m[0];
          buf += dollarTag;
          i += dollarTag.length - 1;
          continue;
        }
      } else if (ch === ";") {
        const s = buf.trim();
        if (s) out.push(s);
        buf = "";
        continue;
      }
    }

    if (!dollarTag && !double && ch === "'") {
      if (single && sql[i + 1] === "'") {
        buf += "''";
        i++;
        continue;
      }
      single = !single;
    } else if (!dollarTag && !single && ch === '"') {
      double = !double;
    }

    buf += ch;
  }

  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

async function resetPartialSchemaIfNeeded(db: LocalDb, appliedCount: number) {
  const tableList = APP_TABLES.map((t) => `'${t.replace(/'/g, "''")}'`).join(",");
  const res = await db.query<{ count: string | number }>(
    `SELECT COUNT(*) AS count
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (${tableList})`,
  );
  const existingCount = Number(res.rows[0]?.count ?? 0);

  // First ZIPs could fail midway through a migration but still leave public
  // objects behind. If no migration is recorded, any app table means the schema
  // is partial and must be recreated before we continue.
  if (appliedCount === 0 && existingCount === 0) return;
  if (appliedCount === 0 && existingCount > 0) {
    console.warn("[local-db] detected partial offline schema; resetting before migrations");
    await db.exec(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS _local_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    return;
  }

  // If migrations were marked as applied by a broken build, but core tables are
  // missing, rerun everything. Do not reset merely because a newer optional
  // table is missing; those are patched/applied below to avoid deleting data.
  const core = await db.query<{ table_name: string }>(`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('formadores','formandos','cursos','ufcds','sessoes')
  `);
  if (appliedCount > 0 && core.rows.length < 5) {
    console.warn("[local-db] detected broken offline schema with applied migrations; resetting before migrations");
    await db.exec(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS _local_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    return;
  }
}

async function initSchema(db: LocalDb): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _local_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const applied = await db.query<{ name: string }>(`SELECT name FROM _local_migrations`);
  await resetPartialSchemaIfNeeded(db, applied.rows.length);
  const appliedAfterReset = await db.query<{ name: string }>(`SELECT name FROM _local_migrations`);
  const done = new Set(appliedAfterReset.rows.map((r) => r.name));

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

  // Hardening for existing portable databases created by older ZIPs: if a
  // migration was previously marked as applied but the table/columns are still
  // missing, patch them here so the offline UI never starts with a stale schema.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS public.cronograma_observacoes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      curso_id uuid REFERENCES public.cursos(id) ON DELETE CASCADE,
      mes date NOT NULL,
      texto text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (curso_id, mes)
    );
    ALTER TABLE public.cronograma_observacoes ADD COLUMN IF NOT EXISTS curso_id uuid REFERENCES public.cursos(id) ON DELETE CASCADE;
    ALTER TABLE public.cronograma_observacoes ADD COLUMN IF NOT EXISTS mes date;
    ALTER TABLE public.cronograma_observacoes ADD COLUMN IF NOT EXISTS texto text DEFAULT '';
    ALTER TABLE public.cronograma_observacoes ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    ALTER TABLE public.cronograma_observacoes ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
    DELETE FROM public.cronograma_observacoes a
      USING public.cronograma_observacoes b
     WHERE a.ctid < b.ctid
       AND a.curso_id = b.curso_id
       AND a.mes = b.mes;
    CREATE UNIQUE INDEX IF NOT EXISTS cronograma_observacoes_curso_mes_key
      ON public.cronograma_observacoes(curso_id, mes);

    CREATE TABLE IF NOT EXISTS public.curso_ferias (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      curso_id uuid REFERENCES public.cursos(id) ON DELETE CASCADE,
      data_inicio date,
      data_fim date,
      motivo text NOT NULL DEFAULT 'Férias',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE public.curso_ferias ADD COLUMN IF NOT EXISTS curso_id uuid REFERENCES public.cursos(id) ON DELETE CASCADE;
    ALTER TABLE public.curso_ferias ADD COLUMN IF NOT EXISTS data_inicio date;
    ALTER TABLE public.curso_ferias ADD COLUMN IF NOT EXISTS data_fim date;
    ALTER TABLE public.curso_ferias ADD COLUMN IF NOT EXISTS motivo text DEFAULT 'Férias';
    ALTER TABLE public.curso_ferias ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    ALTER TABLE public.curso_ferias ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
    CREATE INDEX IF NOT EXISTS curso_ferias_curso_idx
      ON public.curso_ferias(curso_id, data_inicio, data_fim);

    ALTER TABLE public.formadores ADD COLUMN IF NOT EXISTS data_nascimento date;
    ALTER TABLE public.formando_pra ADD COLUMN IF NOT EXISTS nota text;
    ALTER TABLE public.formando_pra ALTER COLUMN nome DROP NOT NULL;
    ALTER TABLE public.formando_pra ALTER COLUMN storage_path DROP NOT NULL;
  `);
  resetRelationshipCache();
}

async function createLocalDb(): Promise<LocalDb> {
  if (isElectron() && typeof Worker !== "undefined") {
    try {
      const worker = new Worker(new URL("./pglite.worker.ts", import.meta.url), { type: "module", name: "formacao-er-db" });
      return await PGliteWorker.create(worker, { dataDir: "idb://formacao-er-db" } as any) as LocalDb;
    } catch (err) {
      console.warn("[local-db] PGlite worker unavailable, falling back to renderer DB", err);
    }
  }
  return new PGlite("idb://formacao-er-db") as LocalDb;
}

export async function getLocalDb(): Promise<LocalDb> {
  if (_db) return _db;
  if (_ready) return _ready;
  _ready = (async () => {
    const db = await createLocalDb();
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
