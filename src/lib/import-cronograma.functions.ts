import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  cursoId: z.string().uuid(),
  pdfBase64: z.string().min(10),
  filename: z.string().optional(),
});

export type SessaoExtraida = {
  data: string;
  hora_inicio: string;
  hora_fim: string;
  ufcd_codigo: string | null;
  ufcd_nome: string | null;
  formador_nome: string | null;
  observacoes: string | null;
};

export const extrairCronogramaPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Load context: curso + UFCDs + formadores
    const [{ data: curso }, { data: cufcds }, { data: formadores }] = await Promise.all([
      supabase.from("cursos").select("id, codigo, nome, data_inicio, data_fim").eq("id", data.cursoId).maybeSingle(),
      supabase.from("curso_ufcds").select("id, ufcd:ufcds(codigo, designacao)").eq("curso_id", data.cursoId),
      supabase.from("formadores").select("id, nome, abreviatura").eq("estado", "ativo"),
    ]);

    if (!curso) throw new Error("Curso não encontrado");

    const ufcdList = (cufcds ?? []).map((u: any) => `${u.ufcd?.codigo} — ${u.ufcd?.designacao}`).join("\n");
    const formadorList = (formadores ?? []).map((f: any) =>
      `${f.nome}${f.abreviatura ? ` (${f.abreviatura})` : ""}`
    ).join("\n");

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY em falta");

    const systemPrompt = `És um assistente que extrai sessões de formação de um cronograma em PDF.
Devolves APENAS JSON válido no formato:
{"sessoes":[{"data":"YYYY-MM-DD","hora_inicio":"HH:MM","hora_fim":"HH:MM","ufcd_codigo":"...","ufcd_nome":"...","formador_nome":"...","observacoes":null}]}

Regras:
- Datas em formato ISO YYYY-MM-DD. Se o PDF tiver dd/mm/aaaa converte.
- Horas em formato 24h HH:MM.
- Uma linha por sessão (cada bloco contínuo num dia para a mesma UFCD/formador).
- Se houver várias sessões no mesmo dia (manhã/tarde) cria entradas separadas.
- Tenta fazer matching das UFCD pelo código ou designação contra a lista do curso.
- Tenta fazer matching dos formadores pelo nome ou abreviatura.
- Se não conseguires identificar, preenche com o texto do PDF e deixa o utilizador resolver.
- Ignora cabeçalhos, totais, legendas e dias sem sessões.

Curso: ${curso.codigo} — ${curso.nome}
Período: ${curso.data_inicio} a ${curso.data_fim}

UFCD do curso:
${ufcdList || "(nenhuma — usa o que aparecer no PDF)"}

Formadores disponíveis:
${formadorList}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extrai todas as sessões deste cronograma." },
              {
                type: "file",
                file: {
                  filename: data.filename ?? "cronograma.pdf",
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

    const sessoes: SessaoExtraida[] = (parsed.sessoes ?? parsed.sessions ?? []).map((s: any) => ({
      data: s.data ?? s.date ?? "",
      hora_inicio: (s.hora_inicio ?? s.start ?? "").slice(0, 5),
      hora_fim: (s.hora_fim ?? s.end ?? "").slice(0, 5),
      ufcd_codigo: s.ufcd_codigo ?? s.ufcd ?? null,
      ufcd_nome: s.ufcd_nome ?? null,
      formador_nome: s.formador_nome ?? s.formador ?? null,
      observacoes: s.observacoes ?? null,
    }));

    const cufcdIds = (cufcds ?? []).map((u: any) => u.id);
    const horasExistentesPorUfcd: Record<string, number> = {};
    if (cufcdIds.length) {
      const { data: sess } = await supabase
        .from("sessoes")
        .select("curso_ufcd_id, horas")
        .in("curso_ufcd_id", cufcdIds);
      (sess ?? []).forEach((s: any) => {
        horasExistentesPorUfcd[s.curso_ufcd_id] =
          (horasExistentesPorUfcd[s.curso_ufcd_id] ?? 0) + Number(s.horas ?? 0);
      });
    }

    const { data: disp } = await supabase
      .from("formador_disponibilidades")
      .select("formador_id, data, hora_inicio, hora_fim, tipo")
      .gte("data", curso.data_inicio)
      .lte("data", curso.data_fim);

    return {
      sessoes,
      curso_ufcds: (cufcds ?? []).map((u: any) => ({
        id: u.id,
        codigo: u.ufcd?.codigo,
        designacao: u.ufcd?.designacao,
        horas_totais: u.horas_totais ?? 0,
        horas_existentes: horasExistentesPorUfcd[u.id] ?? 0,
      })),
      formadores: (formadores ?? []).map((f: any) => ({ id: f.id, nome: f.nome, abreviatura: f.abreviatura })),
      disponibilidades: (disp ?? []).map((d: any) => ({
        formador_id: d.formador_id,
        data: d.data,
        hora_inicio: String(d.hora_inicio).slice(0, 5),
        hora_fim: String(d.hora_fim).slice(0, 5),
        tipo: d.tipo as string,
      })),
      curso: { data_inicio: curso.data_inicio, data_fim: curso.data_fim },
    };
  });

const FormadorInput = z.object({
  nome: z.string().min(1),
  abreviatura: z.string().optional().nullable(),
});

export const criarFormadorRapido = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FormadorInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("formadores")
      .insert({ nome: data.nome, abreviatura: data.abreviatura ?? null, estado: "ativo" })
      .select("id, nome, abreviatura")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const UfcdInput = z.object({
  cursoId: z.string().uuid(),
  codigo: z.string().min(1),
  designacao: z.string().min(1),
  horas_referencia: z.number().int().positive(),
});

export const criarUfcdNoCurso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UfcdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let ufcdId: string | null = null;
    const { data: existing } = await supabase
      .from("ufcds").select("id").eq("codigo", data.codigo).maybeSingle();
    if (existing) ufcdId = existing.id;
    else {
      const { data: novo, error: e1 } = await supabase
        .from("ufcds")
        .insert({ codigo: data.codigo, designacao: data.designacao, horas_referencia: data.horas_referencia })
        .select("id").single();
      if (e1) throw new Error(e1.message);
      ufcdId = novo.id;
    }

    const { data: existeCU } = await supabase
      .from("curso_ufcds").select("id, horas_totais")
      .eq("curso_id", data.cursoId).eq("ufcd_id", ufcdId).maybeSingle();
    if (existeCU) {
      return { id: existeCU.id, codigo: data.codigo, designacao: data.designacao, horas_totais: existeCU.horas_totais ?? 0, horas_existentes: 0 };
    }
    const { data: cu, error: e2 } = await supabase
      .from("curso_ufcds")
      .insert({ curso_id: data.cursoId, ufcd_id: ufcdId, horas_totais: data.horas_referencia })
      .select("id, horas_totais").single();
    if (e2) throw new Error(e2.message);
    return { id: cu.id, codigo: data.codigo, designacao: data.designacao, horas_totais: cu.horas_totais ?? 0, horas_existentes: 0 };
  });

