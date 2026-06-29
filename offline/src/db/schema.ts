// Schema is derived dynamically from the imported data.json — we create one
// SQLite table per JSON key, with one TEXT column per discovered field
// (SQLite is dynamically typed so this works for ints, reals, JSON, etc.).
//
// The single hard assumption is that every row has an `id` field that serves
// as primary key. This matches every public table currently in use.

import { getDb, scheduleFlush } from "./sqljs";

export const KNOWN_TABLES = [
  "ufcds",
  "formadores",
  "formandos",
  "cursos",
  "curso_ufcds",
  "curso_formandos",
  "curso_ufcd_formadores",
  "curso_ferias",
  "formador_ufcds",
  "formador_disponibilidades",
  "formador_inatividades",
  "formador_documentos",
  "formando_faltas",
  "formando_pra",
  "sessoes",
] as const;

export type TableName = (typeof KNOWN_TABLES)[number];

export function tableExists(name: string): boolean {
  const db = getDb();
  const stmt = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?");
  try {
    stmt.bind([name]);
    return stmt.step();
  } finally {
    stmt.free();
  }
}

function discoverColumns(rows: Record<string, unknown>[]): string[] {
  const cols = new Set<string>(["id"]);
  for (const r of rows) for (const k of Object.keys(r)) cols.add(k);
  return [...cols];
}

function quote(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

/** Drop+recreate a table from the imported rows and bulk-insert them. */
export function createAndFillTable(name: string, rows: Record<string, unknown>[]): void {
  const db = getDb();
  const cols = discoverColumns(rows);
  const colsSql = cols.map((c) => `${quote(c)}${c === "id" ? " PRIMARY KEY" : ""}`).join(", ");
  db.run(`DROP TABLE IF EXISTS ${quote(name)}`);
  db.run(`CREATE TABLE ${quote(name)} (${colsSql})`);
  if (rows.length === 0) return;

  const placeholders = cols.map(() => "?").join(", ");
  const stmt = db.prepare(
    `INSERT INTO ${quote(name)} (${cols.map(quote).join(", ")}) VALUES (${placeholders})`,
  );
  try {
    db.run("BEGIN");
    for (const row of rows) {
      const values = cols.map((c) => normalize(row[c]));
      stmt.bind(values as never);
      stmt.step();
      stmt.reset();
    }
    db.run("COMMIT");
  } catch (e) {
    db.run("ROLLBACK");
    throw e;
  } finally {
    stmt.free();
  }
  scheduleFlush();
}

function normalize(v: unknown): string | number | Uint8Array | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  // arrays / objects → JSON string
  return JSON.stringify(v);
}

/** Create empty tables with just an `id` column so the app boots on a fresh BD. */
export function ensureMinimalSchema(): void {
  const db = getDb();
  for (const t of KNOWN_TABLES) {
    db.run(`CREATE TABLE IF NOT EXISTS ${quote(t)} ("id" PRIMARY KEY)`);
  }
  scheduleFlush();
}
