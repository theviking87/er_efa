// Backup e restauro — lê/escreve directamente na base de dados Supabase.
// Produz e aceita o mesmo formato de ficheiro .zip (data.json + storage/<bucket>/<path>).
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";

export const APP_TABLES = [
  "projetos",
  "ufcds",
  "formadores",
  "formandos",
  "cursos",
  "curso_ufcds",
  "curso_formandos",
  "curso_formando_ufcds",
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
  "despesa_categorias",
  "despesas",
  "fin_config",
  "fin_bolsa_config",
  "fin_transporte_config",
  "fin_processamento",
  "fin_processamento_linha",
  "fin_processamento_obs",
  "painel_notas",
] as const;

export const STORAGE_BUCKETS = [
  "formador-documentos",
  "formando-pra",
  "despesas-anexos",
  "empresa-logos",
] as const;

type Row = Record<string, unknown>;

const PAGE = 1000;

async function fetchAll(table: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table as never)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function listBucket(bucket: string, prefix = ""): Promise<string[]> {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) return [];
  const paths: string[] = [];
  for (const entry of data ?? []) {
    const full = prefix ? `${prefix}/${entry.name}` : entry.name;
    // Pastas não têm metadata/id de ficheiro.
    if (entry.id === null || entry.metadata === null) {
      paths.push(...(await listBucket(bucket, full)));
    } else {
      paths.push(full);
    }
  }
  return paths;
}

/** Gera o backup completo (dados + ficheiros) num único ficheiro .zip. */
export async function criarBackup(): Promise<{ blob: Blob; registos: number; ficheiros: number }> {
  const zip = new JSZip();
  const tables: Record<string, unknown[]> = {};
  let registos = 0;

  for (const t of APP_TABLES) {
    const rows = await fetchAll(t);
    tables[t] = rows;
    registos += rows.length;
  }

  zip.file("data.json", JSON.stringify({ exportedAt: new Date().toISOString(), version: 1, tables }, null, 2));

  let ficheiros = 0;
  for (const bucket of STORAGE_BUCKETS) {
    const paths = await listBucket(bucket);
    for (const path of paths) {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error || !data) continue;
      zip.file(`storage/${bucket}/${path}`, await data.arrayBuffer());
      ficheiros++;
    }
  }

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { blob, registos, ficheiros };
}

/** Restaura um backup previamente criado para a base de dados online. */
export async function restaurarBackup(
  file: Blob,
  onProgress?: (msg: string) => void,
): Promise<{ registos: number; ficheiros: number }> {
  const zip = await JSZip.loadAsync(file);
  const dataFile = zip.file("data.json");
  if (!dataFile) throw new Error("Ficheiro de backup inválido (data.json em falta).");
  const payload = JSON.parse(await dataFile.async("string")) as { tables: Record<string, Row[]> };

  let registos = 0;
  for (const t of APP_TABLES) {
    const rows = payload.tables?.[t] ?? [];
    if (!rows.length) continue;
    onProgress?.(`A restaurar ${t}`);
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await supabase
        .from(t as never)
        .upsert(chunk as never, { onConflict: "id", ignoreDuplicates: false });
      if (error) throw new Error(`${t}: ${error.message}`);
      registos += chunk.length;
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
    const blob = await zip.files[name].async("blob");
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, blob, { upsert: true, contentType: guessMime(path) });
    if (!error) ficheiros++;
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
