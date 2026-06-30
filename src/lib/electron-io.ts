type SaveFilter = { name: string; extensions: string[] };

function electronApi(): any | null {
  if (typeof window === "undefined") return null;
  return (window as any).electronAPI ?? null;
}

export async function saveFileElectron(defaultName: string, bytes: ArrayBuffer | Uint8Array, filters?: SaveFilter[]) {
  const api = electronApi();
  if (!api?.files?.save) return false;
  const raw = bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes;
  const res = await api.files.save(defaultName, raw, filters ?? []);
  if (res && res.ok === false && res.error) throw new Error(res.error);
  return Boolean(res?.ok);
}

export function collectDocumentStyles() {
  if (typeof document === "undefined") return "";
  return Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((el) => (el as HTMLElement).outerHTML)
    .join("\n");
}

export async function printHtmlElectron(payload: { title: string; html: string; landscape?: boolean }) {
  const api = electronApi();
  if (!api?.print?.html) return false;
  const res = await api.print.html(payload);
  if (res && res.ok === false && res.error && res.error !== "Impressão cancelada") throw new Error(res.error);
  return Boolean(res?.ok);
}

export async function printHtmlWithFallback(payload: { title: string; html: string; landscape?: boolean }) {
  if (await printHtmlElectron(payload)) return true;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(payload.html);
  w.document.close();
  return true;
}