import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  pdfBase64: z.string().min(10),
  filename: z.string().optional(),
});

export type UfcdExtraida = {
  codigo: string;
  designacao: string;
  horas: number;
};

export const extrairReferencialPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY em falta");

    const systemPrompt = `És um assistente que extrai a lista de UFCD de um referencial de formação em PDF.
Devolves APENAS JSON válido no formato:
{"ufcds":[{"codigo":"1234","designacao":"Nome da UFCD","horas":25}]}

Regras:
- Código da UFCD tal como aparece (normalmente 4-7 dígitos).
- Designação completa, sem prefixos tipo "UFCD".
- Horas como número inteiro (normalmente 25 ou 50).
- Ignora cabeçalhos, índices, totais, áreas de formação e tudo o que não seja uma UFCD individual.
- Não inventes UFCD que não estejam claramente no documento.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extrai todas as UFCD deste referencial." },
              {
                type: "file",
                file: {
                  filename: data.filename ?? "referencial.pdf",
                  file_data: `data:application/pdf;base64,${data.pdfBase64}`,
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
      if (res.status === 402) throw new Error("Créditos esgotados. Adiciona créditos na workspace.");
      throw new Error(`Erro da IA (${res.status}): ${txt.slice(0, 300)}`);
    }

    const payload = await res.json();
    const content = payload?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try { parsed = JSON.parse(content); } catch { throw new Error("A IA devolveu resposta inválida."); }

    const ufcds: UfcdExtraida[] = (parsed.ufcds ?? []).map((u: any) => ({
      codigo: String(u.codigo ?? "").trim(),
      designacao: String(u.designacao ?? u.nome ?? "").trim(),
      horas: Number(u.horas ?? u.horas_referencia ?? 25),
    })).filter((u: UfcdExtraida) => u.codigo && u.designacao);

    // Marcar existentes
    const codigos = ufcds.map((u) => u.codigo);
    const { data: existentes } = await context.supabase
      .from("ufcds").select("id, codigo, designacao, horas_referencia").in("codigo", codigos);

    const existMap = new Map((existentes ?? []).map((e: any) => [e.codigo, e]));

    return {
      ufcds: ufcds.map((u) => {
        const ex = existMap.get(u.codigo);
        return {
          ...u,
          existe: !!ex,
          existente: ex ? {
            id: ex.id,
            designacao: ex.designacao,
            horas_referencia: ex.horas_referencia,
          } : null,
        };
      }),
    };
  });

const ImportInput = z.object({
  ufcds: z.array(z.object({
    codigo: z.string().min(1),
    designacao: z.string().min(1),
    horas: z.number().int().positive(),
  })).min(1),
});

export const importarReferencial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportInput.parse(d))
  .handler(async ({ data, context }) => {
    const codigos = data.ufcds.map((u) => u.codigo);
    const { data: existentes } = await context.supabase
      .from("ufcds").select("codigo").in("codigo", codigos);
    const existSet = new Set((existentes ?? []).map((e: any) => e.codigo));

    const novos = data.ufcds.filter((u) => !existSet.has(u.codigo));
    let criados = 0;
    if (novos.length) {
      const { error } = await context.supabase.from("ufcds").insert(
        novos.map((u) => ({ codigo: u.codigo, designacao: u.designacao, horas_referencia: u.horas })),
      );
      if (error) throw new Error(error.message);
      criados = novos.length;
    }
    return { criados, existentes: data.ufcds.length - criados };
  });
