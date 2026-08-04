// Utilitários de UI/exportação usados por várias páginas (browser).

/** Cede o thread ao browser para permitir repintar entre trabalhos pesados. */
export function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/** Download de ficheiro no browser via anchor + object URL. */
export async function saveFile(
  filename: string,
  bytes: ArrayBuffer | Uint8Array,
): Promise<boolean> {
  const buffer =
    bytes instanceof Uint8Array
      ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      : bytes;
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer as ArrayBuffer)]));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** Recolhe as folhas de estilo aplicadas ao documento (para impressão). */
export function collectDocumentStyles(): string {
  if (typeof document === "undefined") return "";
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = Array.from(sheet.cssRules ?? [])
        .map((rule) => rule.cssText)
        .join("\n");
      if (rules) chunks.push(`<style>${rules}</style>`);
    } catch {
      const owner = sheet.ownerNode as HTMLElement | null;
      if (owner) chunks.push(owner.outerHTML);
    }
  }
  for (const style of Array.from(document.querySelectorAll("style"))) {
    if (!chunks.includes(style.outerHTML)) chunks.push(style.outerHTML);
  }
  return chunks.join("\n");
}

/** Abre uma nova janela com HTML pronto a imprimir. */
export async function printHtml(payload: {
  title: string;
  html: string;
  landscape?: boolean;
}): Promise<boolean> {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(payload.html);
  w.document.close();
  return true;
}
