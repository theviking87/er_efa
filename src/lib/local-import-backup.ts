import JSZip from "jszip";
import { getLocalDb } from "./local-db";
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

function normalizeValue(value: unknown) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value;
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
  let inserted = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const params = cols.map((col) => normalizeValue(row[col]));
    const placeholders = params.map((_, idx) => `$${idx + 1}`).join(", ");
    await db.query(
      `INSERT INTO ${tableName(table)} (${quotedCols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
      params,
    );
    inserted++;
    if (i > 0 && i % 100 === 0) {
      progress?.(`A importar ${table}: ${i}/${rows.length}…`);
      await yieldToUi();
    }
  }
  return inserted;
}

async function clearKnownTables(db: Awaited<ReturnType<typeof getLocalDb>>, tablesInBackup: string[]) {
  const targets = TABLE_ORDER.filter((t) => tablesInBackup.includes(t));
  if (!targets.length) return;
  await db.exec(`TRUNCATE ${targets.map(tableName).join(", ")} RESTART IDENTITY CASCADE`);
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
  const db = await getLocalDb();
  const parsed = JSON.parse(await dataEntry.async("string")) as { tables?: Record<string, Record<string, unknown>[]> };
  const tables = parsed.tables ?? {};
  const tableNames = Object.keys(tables);

  progress?.("A limpar dados antigos…");
  await clearKnownTables(db, tableNames);

  const summary: LocalImportSummary = { tables: {}, files: 0, warnings: [] };
  for (const table of TABLE_ORDER) {
    const rows = tables[table];
    if (!rows) continue;
    progress?.(`A importar ${table} (${rows.length})…`);
    summary.tables[table] = await insertRows(db, table, rows, progress);
    await yieldToUi();
  }

  progress?.("A copiar documentos…");
  const storage = await copyStorage(zip, progress);
  summary.files = storage.files;
  summary.warnings.push(...storage.warnings);
  resetRelationshipCache();
  progress?.("Importação concluída.");
  return summary;
}