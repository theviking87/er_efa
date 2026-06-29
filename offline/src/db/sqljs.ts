// sql.js bootstrap. Loads the WASM as a static asset (works in dev and in the
// portable build under file://) and exposes a single Database instance plus a
// helper that debounces writes back to disk.
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { writeDatabaseBytes } from "./persistence";

let SQL: SqlJsStatic | null = null;
let DB: Database | null = null;

export async function getSql(): Promise<SqlJsStatic> {
  if (SQL) return SQL;
  const electron = (window as unknown as { electronAPI?: { db?: { wasm?: () => Promise<Uint8Array | ArrayBuffer | null> } } }).electronAPI;
  if (electron?.db?.wasm) {
    try {
      const raw = await electron.db.wasm();
      if (raw) {
        const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
        SQL = await initSqlJs({ wasmBinary: bytes });
        return SQL;
      }
    } catch (e) {
      console.warn("electron wasm read failed, falling back to fetch", e);
    }
  }
  SQL = await initSqlJs({ locateFile: () => wasmUrl });
  return SQL;
}

export async function openDatabase(bytes: Uint8Array | null): Promise<Database> {
  const sql = await getSql();
  DB = new sql.Database(bytes ?? undefined);
  return DB;
}

export function getDb(): Database {
  if (!DB) throw new Error("Database not opened yet");
  return DB;
}

// ---- Persistence: debounced flush to the pen drive ---------------------
let flushTimer: number | null = null;
let flushing = false;

export function scheduleFlush(): void {
  if (flushTimer != null) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    void flushNow();
  }, 800);
}

export async function flushNow(): Promise<void> {
  if (!DB || flushing) return;
  flushing = true;
  try {
    const bytes = DB.export();
    await writeDatabaseBytes(bytes);
  } finally {
    flushing = false;
  }
}

// ---- Query helpers ----------------------------------------------------
export function exec(sql: string, params: unknown[] = []): void {
  const db = getDb();
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params as never);
    stmt.step();
  } finally {
    stmt.free();
  }
  scheduleFlush();
}

export function all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  const out: T[] = [];
  try {
    stmt.bind(params as never);
    while (stmt.step()) out.push(stmt.getAsObject() as T);
  } finally {
    stmt.free();
  }
  return out;
}

export function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | null {
  const rows = all<T>(sql, params);
  return rows[0] ?? null;
}

export function count(table: string): number {
  const row = one<{ n: number }>(`SELECT COUNT(*) AS n FROM "${table}"`);
  return row?.n ?? 0;
}
