import JSZip from "jszip";
import { getLocalDb, resetLocalDbForRestore } from "./local-db";
import { resetRelationshipCache } from "@/integrations/local/relationships";

type Progress = (message: string) => void;

export type LocalImportSummary = {
  tables: Record<string, number>;
  files: number;
  warnings: string[];
};

const TABLE_ORDER = [
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
  "sessoes",
  "formando_faltas",
  "formando_pra",
] as const;

const STORAGE_PREFIX = "storage/";

function quoteIdent(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function tableName(table: string) {
  return `public.${quoteIdent(table)}`;
}

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function normalizeValue(value: unknown) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    // O backup online guarda DATE como "YYYY-MM-DD". O PGlite deve receber
    // exatamente esse valor, sem converter para timezone local/UTC.
    if (ISO_DATE_ONLY.test(value)) return value;
    return value;
  }
  return JSON.stringify(value);
}

async function yieldToUi() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function tableColumns(db: Awaited<ReturnType<typeof getLocalDb>>, table: string): Promise<Set<string>> {
  const res = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return new Set(res.rows.map((r) => r.column_name));
}

async function ensureExtraColumns(
  db: Awaited<ReturnType<typeof getLocalDb>>,
  table: string,
  rowColumns: string[],
  existing: Set<string>,
) {
  for (const col of rowColumns) {
    if (existing.has(col)) continue;
    await db.exec(`ALTER TABLE ${tableName(table)} ADD COLUMN ${quoteIdent(col)} text`);
    existing.add(col);
  }
}

async function existingTables(db: Awaited<ReturnType<typeof getLocalDb>>): Promise<Set<string>> {
  const res = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  return new Set(res.rows.map((r) => r.table_name));
}

async function insertRows(
  db: Awaited<ReturnType<typeof getLocalDb>>,
  table: string,
  rows: Record<string, unknown>[],
  progress?: Progress,
) {
  if (!rows.length) return 0;
  const existing = await tableColumns(db, table);
  const rowColumns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  await ensureExtraColumns(db, table, rowColumns, existing);
  const cols = rowColumns.filter((col) => existing.has(col));
  if (!cols.length) return 0;

  const quotedCols = cols.map(quoteIdent).join(", ");
  const maxParams = 800;
  const batchSize = Math.max(1, Math.floor(maxParams / Math.max(1, cols.length)));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const params: unknown[] = [];
    const values = batch.map((row) => {
      const placeholders = cols.map((col) => {
        params.push(normalizeValue(row[col]));
        return `$${params.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    await db.query(
      `INSERT INTO ${tableName(table)} (${quotedCols}) VALUES ${values.join(", ")} ON CONFLICT DO NOTHING`,
      params,
    );
    inserted += batch.length;
    if (i > 0 && i % (batchSize * 5) === 0) {
      progress?.(`A importar ${table}: ${Math.min(i + batch.length, rows.length)}/${rows.length}…`);
      await yieldToUi();
    }
  }
  return inserted;
}

async function clearKnownTables(db: Awaited<ReturnType<typeof getLocalDb>>, tablesInBackup: string[]) {
  const existing = await existingTables(db);
  const targets = TABLE_ORDER.filter((t) => tablesInBackup.includes(t) && existing.has(t));
  if (!targets.length) return;
  // PGlite in the Electron main process can surface opaque IPC errors for
  // TRUNCATE CASCADE on a previously broken portable DB. Deleting in reverse FK
  // order is slower but deterministic and keeps the import error visible.
  await db.exec(`SET session_replication_role = replica;`);
  try {
    for (const table of [...targets].reverse()) {
      await db.exec(`DELETE FROM ${tableName(table)}`);
    }
  } finally {
    await db.exec(`SET session_replication_role = origin;`);
  }
}

async function copyStorage(zip: JSZip, progress?: Progress): Promise<{ files: number; warnings: string[] }> {
  const api = typeof window !== "undefined" ? (window as any).electronAPI : null;
  const warnings: string[] = [];
  let files = 0;
  const entries: { path: string; entry: JSZip.JSZipObject }[] = [];
  zip.forEach((path, entry) => {
    if (!entry.dir && path.startsWith(STORAGE_PREFIX)) entries.push({ path, entry });
  });

  for (let i = 0; i < entries.length; i++) {
    const { path, entry } = entries[i];
    const relPath = path.slice(STORAGE_PREFIX.length);
    progress?.(`A copiar ficheiro ${i + 1}/${entries.length}…`);
    try {
      const data = await entry.async("arraybuffer");
      if (api?.docs?.write) await api.docs.write(relPath, data);
      files++;
    } catch (err: any) {
      warnings.push(`${relPath}: ${err?.message ?? String(err)}`);
    }
    if (i > 0 && i % 25 === 0) await yieldToUi();
  }
  return { files, warnings };
}

export async function getLocalDataSummary() {
  const db = await getLocalDb();
  const summary: Record<string, number> = {};
  for (const table of TABLE_ORDER) {
    try {
      const res = await db.query<{ count: string | number }>(`SELECT COUNT(*) AS count FROM ${tableName(table)}`);
      summary[table] = Number(res.rows[0]?.count ?? 0);
    } catch {
      summary[table] = 0;
    }
  }
  return summary;
}

export async function importLocalBackupZip(file: File, progress?: Progress): Promise<LocalImportSummary> {
  progress?.("A abrir o backup…");
  const zip = await JSZip.loadAsync(file);
  const dataEntry = zip.file("data.json");
  if (!dataEntry) throw new Error("Este .zip não tem data.json. Exporta novamente o backup completo da versão online.");

  progress?.("A preparar a base de dados local…");
  const parsed = JSON.parse(await dataEntry.async("string")) as { tables?: Record<string, Record<string, unknown>[]> };
  const tables = parsed.tables ?? {};
  const tableNames = Object.keys(tables);

  // A failed v6 import could leave the local PGlite folder in a half-broken
  // state. For a full backup restore the safest behaviour is to reset the local
  // DB first, recreate the schema, then import. Existing docs are overwritten
  // below from the backup storage/ folder.
  progress?.("A reiniciar a base local…");
  const db = await resetLocalDbForRestore();
  const existing = await existingTables(db);

  const summary: LocalImportSummary = { tables: {}, files: 0, warnings: [] };
  progress?.("A limpar dados antigos…");
  await db.exec("BEGIN");
  try {
    await clearKnownTables(db, tableNames);

    for (const table of TABLE_ORDER) {
      const rows = tables[table];
      if (!rows) continue;
      if (!existing.has(table)) {
        summary.tables[table] = 0;
        summary.warnings.push(`Tabela ${table} não existe na base local; foi ignorada.`);
        continue;
      }
      progress?.(`A importar ${table} (${rows.length})…`);
      summary.tables[table] = await insertRows(db, table, rows, progress);
      await yieldToUi();
    }
    await db.exec("COMMIT");
  } catch (err) {
    try { await db.exec("ROLLBACK"); } catch {}
    throw err;
  }

  progress?.("A copiar documentos…");
  const storage = await copyStorage(zip, progress);
  summary.files = storage.files;
  summary.warnings.push(...storage.warnings);
  resetRelationshipCache();
  progress?.("Importação concluída.");
  return summary;
}