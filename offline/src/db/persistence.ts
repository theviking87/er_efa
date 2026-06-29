// File System Access API wrapper.
//
// The user picks a directory once (typically the pen drive folder). We persist
// the handle in IndexedDB so subsequent sessions can re-open the same folder
// without re-prompting. Inside that folder we read/write database.db and a
// docs/ subtree for attachments.

import { idbGet, idbSet, idbDel } from "./idb";

type AnyHandle = FileSystemDirectoryHandle;

const KEY_DIR = "rootDir";

let rootDir: AnyHandle | null = null;

export function hasRoot(): boolean {
  return !!rootDir;
}

export async function loadSavedRoot(): Promise<AnyHandle | null> {
  const saved = await idbGet<AnyHandle>(KEY_DIR);
  if (!saved) return null;
  // Ask for permission again if needed.
  const perm = await ensurePermission(saved);
  if (!perm) return null;
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
