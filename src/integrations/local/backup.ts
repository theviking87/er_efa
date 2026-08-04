// Backup e restauro locais — tudo num único ficheiro .zip.
import JSZip from "jszip";
import { getDb, resetDb } from "./db";
import { APP_TABLES } from "./schema";

function q(id: string) {
  return `"${id.replace(/"/g, '""')}"`;
}

/** Gera o backup completo (dados + ficheiros) num único ficheiro. */
export async function criarBackup(): Promise<{ blob: Blob; registos: number; ficheiros: number }> {
  const db = await getDb();
  const zip = new JSZip();
  const tables: Record<string, unknown[]> = {};
  let registos = 0;

  for (const t of APP_TABLES) {
    const r = await db.query<{ _d: string }>(
      `select coalesce(json_agg(to_jsonb(_q)), '[]'::json)::text as _d from public.${q(t)} _q`,
    );
    const rows = JSON.parse(r.rows[0]?._d ?? "[]") as unknown[];
    tables[t] = rows;
    registos += rows.length;
  }

  zip.file("data.json", JSON.stringify({ exportedAt: new Date().toISOString(), version: 1, tables }, null, 2));

  const files = await db.query<{ bucket: string; path: string; conteudo: string }>(
    "select bucket, path, conteudo from public._local_storage",
  );
  for (const f of files.rows) {
    zip.file(`storage/${f.bucket}/${f.path}`, f.conteudo, { base64: true });
  }

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { blob, registos, ficheiros: files.rows.length };
}

/** Restaura integralmente um backup previamente criado (substitui os dados actuais). */
export async function restaurarBackup(
  file: Blob,
  onProgress?: (msg: string) => void,
): Promise<{ registos: number; ficheiros: number }> {
  const zip = await JSZip.loadAsync(file);
  const dataFile = zip.file("data.json");
  if (!dataFile) throw new Error("Ficheiro de backup inválido (data.json em falta).");
  const payload = JSON.parse(await dataFile.async("string")) as { tables: Record<string, Record<string, unknown>[]> };

  onProgress?.("A preparar a base de dados local");
  await resetDb();
  const db = await getDb();

  let registos = 0;
  for (const t of APP_TABLES) {
    const rows = payload.tables?.[t] ?? [];
    if (!rows.length) continue;
    onProgress?.(`A restaurar ${t}`);
    for (const row of rows) {
      const keys = Object.keys(row);
      const params: unknown[] = [];
      const placeholders = keys.map((k) => {
        const v = row[k];
        if (v !== null && typeof v === "object") {
          params.push(JSON.stringify(v));
          return `$${params.length}::jsonb`;
        }
        params.push(v);
        return `$${params.length}`;
      });
      await db.query(
        `insert into public.${q(t)} (${keys.map(q).join(", ")}) values (${placeholders.join(", ")}) on conflict do nothing`,
        params as never[],
      );
      registos++;
    }
  }

  onProgress?.("A restaurar ficheiros");
  let ficheiros = 0;
  const entries = Object.keys(zip.files).filter((n) => n.startsWith("storage/") && !zip.files[n].dir);
  for (const name of entries) {
    const rest = name.slice("storage/".length);
    const slash = rest.indexOf("/");
    if (slash === -1) continue;
    const bucket = rest.slice(0, slash);
    const path = rest.slice(slash + 1);
    const b64 = await zip.files[name].async("base64");
    await db.query(
      `insert into public._local_storage (bucket, path, mime, size, conteudo) values ($1,$2,$3,$4,$5)
       on conflict (bucket, path) do update set conteudo = excluded.conteudo, size = excluded.size`,
      [bucket, path, guessMime(path), Math.floor((b64.length * 3) / 4), b64],
    );
    ficheiros++;
  }

  return { registos, ficheiros };
}

function guessMime(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return "application/octet-stream";
}
