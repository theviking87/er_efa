// Cliente OpenAI (server-only). A chave nunca chega ao browser.
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export type PdfJsonRequest = {
  systemPrompt: string;
  userText: string;
  filename: string;
  pdfBase64: string;
};

/**
 * Envia um PDF + prompt para a OpenAI e devolve o objeto JSON resultante.
 * Mantém o mesmo contrato (JSON object) usado anteriormente.
 */
export async function extractJsonFromPdf(req: PdfJsonRequest): Promise<any> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY em falta");
  const model = process.env.OPENAI_MODEL || "gpt-4.1";

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: req.systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: req.userText },
            {
              type: "file",
              file: {
                filename: req.filename,
                file_data: `data:application/pdf;base64,${req.pdfBase64}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 429) throw new Error("Limite de pedidos atingido. Tenta novamente em alguns instantes.");
    if (res.status === 402 || res.status === 403)
      throw new Error("Créditos/permissões da IA esgotados. Verifica a conta OpenAI.");
    throw new Error(`Erro da IA (${res.status}): ${txt.slice(0, 300)}`);
  }

  const payload = await res.json();
  const content = payload?.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("A IA devolveu resposta inválida.");
  }
}
