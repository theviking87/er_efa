// Base de dados local (PGlite = Postgres em WASM), persistida em IndexedDB.
// Substitui apenas o mecanismo de armazenamento — o esquema e os dados são os mesmos.
import { PGlite } from "@electric-sql/pglite";
import { SCHEMA_SQL } from "./schema";

export type FkMeta = {
  constraint: string;
  child: string;
  childCols: string[];
  parent: string;
  parentCols: string[];
};

let dbPromise: Promise<PGlite> | undefined;
let fks: FkMeta[] = [];
let pkCache: Record<string, string[]> = {};

const DB_NAME = "idb://formacao-er";

/** Ordena os statements: tabelas → chaves primárias/únicas → chaves estrangeiras → restantes. */
function orderStatements(stmts: string[]): string[] {
  const rank = (s: string) => {
    if (/^create\s+(table|type|extension|schema)/i.test(s)) return 0;
    if (/primary key|add constraint\s+\S+\s+unique/i.test(s)) return 1;
    if (/foreign key/i.test(s)) return 2;
    return 3;
  };
  return stmts.map((s, i) => ({ s, i, r: rank(s) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.s);
}

async function runSchema(db: PGlite) {
  for (const stmt of orderStatements(splitSql(SCHEMA_SQL))) {
    try {
      await db.exec(stmt);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/already exists|duplicate/i.test(msg)) throw e;
    }
  }
}

async function bootstrap(db: PGlite) {
  const existing = await db.query<{ n: number }>(
    "select count(*)::int as n from information_schema.tables where table_schema='public' and table_name='cursos'",
  );
  if ((existing.rows[0]?.n ?? 0) === 0) {
    await runSchema(db);
  }
}


/** Divide SQL em statements, respeitando $fn$ ... $fn$ */
function splitSql(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inDollar = false;
  for (let i = 0; i < sql.length; i++) {
    if (sql.startsWith("$fn$", i)) {
      inDollar = !inDollar;
      buf += "$fn$";
      i += 3;
      continue;
    }
    const ch = sql[i];
    if (ch === ";" && !inDollar) {
      if (buf.trim()) out.push(buf.trim());
      buf = "";
    } else buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter((s) => !/^--/.test(s));
}

async function loadMeta(db: PGlite) {
  const r = await db.query<{
    constraint_name: string;
    child: string;
    child_cols: string;
    parent: string;
    parent_cols: string;
  }>(`
    select con.conname as constraint_name,
      c.relname as child,
      (select string_agg(a.attname, ',' order by k.ord) from unnest(con.conkey) with ordinality k(attnum, ord)
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as child_cols,
      p.relname as parent,
      (select string_agg(a.attname, ',' order by k.ord) from unnest(con.confkey) with ordinality k(attnum, ord)
        join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum) as parent_cols
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_class p on p.oid = con.confrelid
    where con.contype = 'f'
  `);
  fks = r.rows.map((row) => ({
    constraint: row.constraint_name,
    child: row.child,
    childCols: row.child_cols.split(","),
    parent: row.parent,
    parentCols: row.parent_cols.split(","),
  }));

  const pk = await db.query<{ tbl: string; cols: string }>(`
    select c.relname as tbl,
      (select string_agg(a.attname, ',' order by k.ord) from unnest(con.conkey) with ordinality k(attnum, ord)
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as cols
    from pg_constraint con join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'p' and n.nspname = 'public'
  `);
  pkCache = {};
  for (const row of pk.rows) pkCache[row.tbl] = row.cols.split(",");
}

export function getFks(): FkMeta[] {
  return fks;
}

export function getPk(table: string): string[] {
  return pkCache[table] ?? ["id"];
}

export function getDb(): Promise<PGlite> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = new PGlite(DB_NAME);
      await db.waitReady;
      await bootstrap(db);
      await loadMeta(db);
      return db;
    })();
  }
  return dbPromise;
}

/** Apaga tudo e recria o esquema (usado no restauro de backup). */
export async function resetDb() {
  const db = await getDb();
  await db.exec("drop schema public cascade; create schema public;");
  await runSchema(db);

  await loadMeta(db);
}
