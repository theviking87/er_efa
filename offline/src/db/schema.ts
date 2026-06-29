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

/** Make sure the given columns exist on a table, adding any that are missing. */
export function ensureColumns(table: string, cols: string[]): void {
  const db = getDb();
  db.run(`CREATE TABLE IF NOT EXISTS ${quote(table)} ("id" PRIMARY KEY)`);
  const stmt = db.prepare(`PRAGMA table_info(${quote(table)})`);
  const existing = new Set<string>();
  try {
    while (stmt.step()) {
      const row = stmt.getAsObject() as { name: string };
      existing.add(row.name);
    }
  } finally {
    stmt.free();
  }
  for (const c of cols) {
    if (!existing.has(c)) db.run(`ALTER TABLE ${quote(table)} ADD COLUMN ${quote(c)}`);
  }
  scheduleFlush();
}

/**
 * The online export uses the canonical column names (ufcds.designacao,
 * ufcds.horas_referencia, no cursos.local). The offline UI reads aliases
 * (nome, horas, local). Mirror the canonical columns into the aliases so
 * existing queries keep working without rewriting every screen.
 */
export function normalizeImportedSchema(): void {
  const db = getDb();
  if (tableExists("ufcds")) {
    ensureColumns("ufcds", ["nome", "horas", "designacao", "horas_referencia"]);
    db.run(`UPDATE ufcds SET nome = COALESCE(NULLIF(nome,''), designacao) WHERE designacao IS NOT NULL`);
    db.run(`UPDATE ufcds SET designacao = COALESCE(NULLIF(designacao,''), nome) WHERE nome IS NOT NULL`);
    db.run(`UPDATE ufcds SET horas = COALESCE(horas, horas_referencia)`);
    db.run(`UPDATE ufcds SET horas_referencia = COALESCE(horas_referencia, horas)`);
  }
  if (tableExists("cursos")) {
    ensureColumns("cursos", ["local", "horario", "tipologia", "observacoes"]);
  }
  if (tableExists("formandos")) {
    ensureColumns("formandos", ["nome", "nif", "email"]);
  }
  if (tableExists("curso_ufcds")) {
    ensureColumns("curso_ufcds", ["curso_id", "ufcd_id", "estado", "concluida", "ordem"]);
    // Map the online `concluida` boolean to the offline `estado` text.
    db.run(`UPDATE curso_ufcds SET estado = COALESCE(NULLIF(estado,''),
      CASE WHEN concluida IN (1,'1','true') THEN 'concluida' ELSE 'por_iniciar' END)`);
  }
  if (tableExists("curso_formandos")) {
    ensureColumns("curso_formandos", ["curso_id", "formando_id"]);
  }
  ensureColumns("formando_pra", ["formando_id", "curso_id", "ufcd_id", "ficheiro", "nota"]);
  scheduleFlush();
}

