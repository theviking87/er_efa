// Armazenamento local de ficheiros (substitui os buckets online).
import { getDb } from "./db";

async function toBase64(file: Blob | ArrayBuffer | Uint8Array): Promise<{ b64: string; size: number; mime: string }> {
  let blob: Blob;
  if (file instanceof Blob) blob = file;
  else if (file instanceof Uint8Array) blob = new Blob([file as unknown as BlobPart]);
  else blob = new Blob([file as ArrayBuffer]);
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return { b64: btoa(binary), size: buf.length, mime: blob.type || "application/octet-stream" };
}

function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

class LocalBucket {
  constructor(private bucket: string) {}

  async upload(path: string, file: Blob | File | ArrayBuffer | Uint8Array, opts?: { upsert?: boolean }) {
    try {
      const db = await getDb();
      const { b64, size, mime } = await toBase64(file);
      const mimeFinal = file instanceof File && file.type ? file.type : mime;
      if (opts?.upsert === false) {
        const exists = await db.query<{ n: number }>(
          "select count(*)::int as n from public._local_storage where bucket=$1 and path=$2",
          [this.bucket, path],
        );
        if ((exists.rows[0]?.n ?? 0) > 0) {
          return { data: null, error: { message: "The resource already exists", name: "StorageError" } };
        }
      }
      await db.query(
        `insert into public._local_storage (bucket, path, mime, size, conteudo) values ($1,$2,$3,$4,$5)
         on conflict (bucket, path) do update set mime = excluded.mime, size = excluded.size, conteudo = excluded.conteudo`,
        [this.bucket, path, mimeFinal, size, b64],
      );
      return { data: { path, id: path, fullPath: `${this.bucket}/${path}` }, error: null };
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : String(e), name: "StorageError" } };
    }
  }

  async download(path: string) {
    const db = await getDb();
    const r = await db.query<{ conteudo: string; mime: string }>(
      "select conteudo, mime from public._local_storage where bucket=$1 and path=$2",
      [this.bucket, path],
    );
    const row = r.rows[0];
    if (!row) return { data: null, error: { message: "Object not found", name: "StorageError" } };
    return { data: base64ToBlob(row.conteudo, row.mime ?? "application/octet-stream"), error: null };
  }

  async createSignedUrl(path: string, _expiresIn?: number) {
    const db = await getDb();
    const r = await db.query<{ conteudo: string; mime: string }>(
      "select conteudo, mime from public._local_storage where bucket=$1 and path=$2",
      [this.bucket, path],
    );
    const row = r.rows[0];
    if (!row) return { data: null, error: { message: "Object not found", name: "StorageError" } };
    return {
      data: { signedUrl: `data:${row.mime ?? "application/octet-stream"};base64,${row.conteudo}` },
      error: null,
    };
  }

  getPublicUrl(path: string) {
    return { data: { publicUrl: `local://${this.bucket}/${path}` } };
  }

  async remove(paths: string[]) {
    const db = await getDb();
    for (const p of paths) {
      await db.query("delete from public._local_storage where bucket=$1 and path=$2", [this.bucket, p]);
    }
    return { data: paths.map((p) => ({ name: p })), error: null };
  }

  async list(prefix = "", _opts?: { limit?: number }) {
    const db = await getDb();
    const r = await db.query<{ path: string; size: number; mime: string; created_at: string }>(
      "select path, size, mime, created_at from public._local_storage where bucket=$1 and path like $2 order by path",
      [this.bucket, `${prefix}%`],
    );
    const data = r.rows.map((row) => ({
      name: prefix ? row.path.slice(prefix.length).replace(/^\//, "") : row.path,
      id: row.path,
      updated_at: row.created_at,
      created_at: row.created_at,
      metadata: { size: row.size, mimetype: row.mime },
    }));
    return { data, error: null };
  }
}

export const localStorageApi = {
  from(bucket: string) {
    return new LocalBucket(bucket);
  },
};
