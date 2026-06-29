// Storage shim — routes Supabase Storage calls to the local filesystem
// when running under Electron, or to IndexedDB when running in a regular
// browser (preview during dev). Each bucket maps to a folder under `docs/`.
//
// API surface implemented (matches `@supabase/storage-js`):
//   from(bucket).upload(path, file, opts?)
//   from(bucket).remove(paths)
//   from(bucket).list(prefix, opts?)
//   from(bucket).download(path) → { data: Blob | null, error }
//   from(bucket).createSignedUrl(path, expiresIn) → { data: { signedUrl }, error }

type ElectronAPI = {
  isElectron: true;
  docs: {
    write: (rel: string, buf: ArrayBuffer) => Promise<{ ok: boolean }>;
    read: (rel: string) => Promise<Uint8Array | null>;
    remove: (rel: string) => Promise<{ ok: boolean }>;
    list: (rel: string) => Promise<{ name: string; size: number }[]>;
  };
};

function api(): ElectronAPI | null {
  if (typeof window === "undefined") return null;
  return (window as any).electronAPI ?? null;
}

// In-browser fallback (preview). Uses IndexedDB via a tiny key/value store.
const memoryStore = new Map<string, ArrayBuffer>();

async function browserWrite(key: string, buf: ArrayBuffer) { memoryStore.set(key, buf); }
async function browserRead(key: string): Promise<ArrayBuffer | null> { return memoryStore.get(key) ?? null; }
async function browserRemove(key: string) { memoryStore.delete(key); }
async function browserList(prefix: string) {
  return [...memoryStore.keys()]
    .filter((k) => k.startsWith(prefix))
    .map((k) => ({ name: k.slice(prefix.length).replace(/^\//, ""), size: memoryStore.get(k)?.byteLength ?? 0 }));
}

class BucketHandle {
  constructor(private bucket: string) {}
  private rel(p: string) { return `${this.bucket}/${p}`.replace(/\/+/g, "/"); }

  async upload(path: string, file: Blob | File | ArrayBuffer, _opts?: { upsert?: boolean; contentType?: string }) {
    try {
      const buf = file instanceof ArrayBuffer ? file : await (file as Blob).arrayBuffer();
      const rel = this.rel(path);
      const a = api();
      if (a) await a.docs.write(rel, buf);
      else await browserWrite(rel, buf);
      return { data: { path }, error: null };
    } catch (err: any) { return { data: null, error: { message: String(err?.message ?? err) } }; }
  }

  async remove(paths: string[]) {
    try {
      const a = api();
      for (const p of paths) {
        const rel = this.rel(p);
        if (a) await a.docs.remove(rel); else await browserRemove(rel);
      }
      return { data: paths, error: null };
    } catch (err: any) { return { data: null, error: { message: String(err?.message ?? err) } }; }
  }

  async list(prefix = "", _opts?: { limit?: number }) {
    try {
      const a = api();
      const rel = this.rel(prefix);
      const items = a ? await a.docs.list(rel) : await browserList(rel);
      return { data: items.map((i) => ({ name: i.name, metadata: { size: i.size } })), error: null };
    } catch (err: any) { return { data: null, error: { message: String(err?.message ?? err) } }; }
  }

  async download(path: string) {
    try {
      const a = api();
      const rel = this.rel(path);
      const buf = a ? await a.docs.read(rel) : await browserRead(rel);
      if (!buf) return { data: null, error: { message: "File not found" } };
      const blob = new Blob([new Uint8Array(buf as any)]);
      return { data: blob, error: null };
    } catch (err: any) { return { data: null, error: { message: String(err?.message ?? err) } }; }
  }

  async createSignedUrl(path: string, _expiresIn: number) {
    try {
      const a = api();
      const rel = this.rel(path);
      const buf = a ? await a.docs.read(rel) : await browserRead(rel);
      if (!buf) return { data: null, error: { message: "File not found" } };
      const url = URL.createObjectURL(new Blob([new Uint8Array(buf as any)]));
      return { data: { signedUrl: url }, error: null };
    } catch (err: any) { return { data: null, error: { message: String(err?.message ?? err) } }; }
  }
}

export const localStorageApi = {
  from(bucket: string) { return new BucketHandle(bucket); },
};
