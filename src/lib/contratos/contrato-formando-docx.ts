import JSZip from "jszip";
import { replaceTextInXml } from "./contrato-formador-docx";

export const TEMPLATE_FORMANDO_URL = "/templates/contrato-formando.docx";

export type ContratoFormandoPlaceholders = {
  FORMANDO_NOME: string;
  FORMANDO_CC: string;
  VALIDADE_CC: string;
  FORMANDO_NIF: string;
  MORADA_COMPLETA: string;
  CURSO: string;
  HORAS_CURSO: string;
  REGIME: string;
  INICIO_CURSO: string;
  FIM_CURSO: string;
  NUMERO_APOLICE: string;
  SEGURADORA: string;
  DATA_CONTRATO: string;
};

/** Gera o DOCX do contrato de formando a partir do modelo integrado (o modelo original não é alterado). */
export async function gerarContratoFormandoDocx(replacements: ContratoFormandoPlaceholders): Promise<Blob> {
  const res = await fetch(TEMPLATE_FORMANDO_URL);
  if (!res.ok) throw new Error("Não foi possível carregar o modelo Word do contrato de formando.");
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
