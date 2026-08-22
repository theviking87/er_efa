import JSZip from "jszip";

export const TEMPLATE_URL = "/templates/contrato-formador.docx";

export type ContratoFormadorPlaceholders = {
  FORMADOR_NOME: string;
  FREGUESIA: string;
  CONCELHO: string;
  FORMADOR_CC: string;
  VALIDADE_CC: string;
  FORMADOR_NIF: string;
  FORMADOR_MORADAA: string;
  FORMADOR_HAB_ACAD: string;
  DATA_CCP: string;
  NUMERO_CCP: string;
  DATA_INICIO: string;
  DATA_FIM: string;
  FORMADOR_UFCD: string;
  DATA_CONTRATO: string;
};

function escapeXml(value: string) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Substitui {{TOKEN}} mesmo quando o Word partiu o placeholder por vários runs. */
export function replaceTextInXml(xml: string, replacements: Record<string, string>) {
  for (const [key, value] of Object.entries(replacements)) {
    xml = xml.split(`{{${key}}}`).join(escapeXml(value));
  }

  const textOnly = xml.replace(/<w:t(?:\s[^>]*)?>/g, "").replace(/<\/w:t>/g, "");
  if (textOnly.includes("{{")) {
    for (const [key, value] of Object.entries(replacements)) {
      const pattern = `{{${key}}}`
        .split("")
        .map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("(?:<[^>]+>)*");
      xml = xml.replace(new RegExp(pattern, "g"), escapeXml(value));
    }
  }

  return xml;
}

export function sanitizeFilename(value: string) {
  return (
    String(value || "Formador")
      .trim()
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "Formador"
  );
}

/** Formata "YYYY-MM-DD" para "DD/MM/YYYY". */
export function formatDatePt(value?: string | null) {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

/** Gera o DOCX a partir do modelo associado à aplicação (o modelo original não é alterado). */
export async function gerarContratoFormadorDocx(replacements: ContratoFormadorPlaceholders): Promise<Blob> {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error("Não foi possível carregar o modelo Word do contrato.");
  const zip = await JSZip.loadAsync(await res.arrayBuffer());

  const targets = Object.keys(zip.files).filter(name => /^(word\/.*\.xml|docProps\/.*\.xml)$/i.test(name));
  for (const name of targets) {
    const xml = await zip.file(name)!.async("string");
    zip.file(name, replaceTextInXml(xml, replacements as unknown as Record<string, string>));
  }

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
