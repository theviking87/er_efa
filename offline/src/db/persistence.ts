// File System Access API wrapper (browser) + Electron IPC bridge (desktop).
//
// In Electron, window.electronAPI is exposed by preload.cjs and we use it for
// silent disk access. In a normal browser, we fall back to the File System
// Access API where the user picks a folder on the pen drive.

import { idbGet, idbSet, idbDel } from "./idb";

type AnyHandle = FileSystemDirectoryHandle;
type ElectronAPI = {
  isElectron: true;
  docs: {
    write: (rel: string, buf: ArrayBuffer) => Promise<unknown>;
    read: (rel: string) => Promise<Uint8Array | ArrayBuffer | null>;
    remove: (rel: string) => Promise<unknown>;
    list: (rel: string) => Promise<{ name: string; size: number }[]>;
  };
  db: {
    read: () => Promise<Uint8Array | ArrayBuffer | null>;
    write: (buf: ArrayBuffer) => Promise<unknown>;
  };
};
const electron: ElectronAPI | undefined =
  (typeof window !== "undefined" && (window as unknown as { electronAPI?: ElectronAPI }).electronAPI) || undefined;

export const IS_ELECTRON = !!electron;

const KEY_DIR = "rootDir";

let rootDir: AnyHandle | null = null;

export function hasRoot(): boolean {
  return IS_ELECTRON || !!rootDir;
}

export async function loadSavedRoot(): Promise<AnyHandle | null> {
  const saved = await idbGet<AnyHandle>(KEY_DIR);
  if (!saved) return null;
  // Ask for permission again if needed.
  const perm = await ensurePermission(saved);
  if (!perm) return null;
  // Validate the handle is still usable. If the pen drive was plugged into
  // a different USB port (Windows assigned a new drive letter) or into a
  // different PC, the stored handle may be stale — fall through to the
  // folder picker instead of crashing silently.
  try {
    // @ts-expect-error - async iterator on FileSystemDirectoryHandle
    const it = saved.values();
    await it.next();
  } catch {
    await idbDel(KEY_DIR);
    return null;
  }
  rootDir = saved;
  return saved;
}

export async function pickRoot(): Promise<AnyHandle> {
  // showDirectoryPicker is only available in Chromium-based browsers.
  // @ts-expect-error - FSA types not in TS DOM lib
  const dir: AnyHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  await ensurePermission(dir, true);
  rootDir = dir;
  await idbSet(KEY_DIR, dir);
  return dir;
}

export async function forgetRoot(): Promise<void> {
  rootDir = null;
  await idbDel(KEY_DIR);
}

async function ensurePermission(handle: AnyHandle, request = false): Promise<boolean> {
  // @ts-expect-error - non-standard but supported in Chromium
  const opts = { mode: "readwrite" } as const;
  // @ts-expect-error
  const current = await handle.queryPermission?.(opts);
  if (current === "granted") return true;
  if (!request) return false;
  // @ts-expect-error
  const next = await handle.requestPermission?.(opts);
  return next === "granted";
}

function requireRoot(): AnyHandle {
  if (!rootDir) throw new Error("Pasta de trabalho não está aberta");
  return rootDir;
}

// ---- database.db -------------------------------------------------------

export async function readDatabaseBytes(): Promise<Uint8Array | null> {
  const dir = requireRoot();
  try {
    const fh = await dir.getFileHandle("database.db");
    const file = await fh.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

export async function writeDatabaseBytes(bytes: Uint8Array): Promise<void> {
  const dir = requireRoot();
  const fh = await dir.getFileHandle("database.db", { create: true });
  // @ts-expect-error - createWritable types missing
  const w = await fh.createWritable();
  await w.write(bytes);
  await w.close();
}

// ---- docs/ subtree -----------------------------------------------------

export async function ensureSubdir(...parts: string[]): Promise<FileSystemDirectoryHandle> {
  let dir = requireRoot();
  for (const p of parts) {
    if (!p) continue;
    dir = await dir.getDirectoryHandle(p, { create: true });
  }
  return dir;
}

export async function writeFileAt(relativePath: string, data: Blob | Uint8Array | ArrayBuffer): Promise<void> {
  const parts = relativePath.split("/").filter(Boolean);
  const filename = parts.pop()!;
  const dir = await ensureSubdir(...parts);
  const fh = await dir.getFileHandle(filename, { create: true });
  // @ts-expect-error
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

export async function readFileAt(relativePath: string): Promise<File | null> {
  try {
    const parts = relativePath.split("/").filter(Boolean);
    const filename = parts.pop()!;
    let dir = requireRoot();
    for (const p of parts) dir = await dir.getDirectoryHandle(p);
    const fh = await dir.getFileHandle(filename);
    return await fh.getFile();
  } catch {
    return null;
  }
}

export async function deleteFileAt(relativePath: string): Promise<void> {
  try {
    const parts = relativePath.split("/").filter(Boolean);
    const filename = parts.pop()!;
    let dir = requireRoot();
    for (const p of parts) dir = await dir.getDirectoryHandle(p);
    await dir.removeEntry(filename);
  } catch {
    /* ignore */
  }
}
