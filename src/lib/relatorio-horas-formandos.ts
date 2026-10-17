import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { localDateIso } from "@/lib/format";
import { disciplinasFrequentadas, horasFrequenciaSessao, sessaoNoPercurso } from "@/lib/financeiro/regras";
import { yieldToBrowser } from "@/lib/dom-helpers";

// Paginação evita truncar silenciosamente os formandos e o histórico de sessões.
async function todas<T>(consulta: (inicio: number, fim: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await consulta(inicio, inicio + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) return rows;
  }
}

export async function exportRelatorioHorasFormandos() {
  const ate = localDateIso(new Date());
  const [formandos, inscricoes, cursos, disciplinas, ufcds, selecoes, sessoes, faltas] = await Promise.all([
    todas((a, b) => supabase.from("formandos").select("id, nome, nif").order("id").range(a, b)),
    todas((a, b) => supabase.from("curso_formandos").select("id, curso_id, formando_id, estado, data_inscricao, data_desistencia, data_conclusao").order("id").range(a, b)),
    todas((a, b) => supabase.from("cursos").select("id, codigo, nome").order("id").range(a, b)),
    todas((a, b) => supabase.from("curso_ufcds").select("id, curso_id, ufcd_id, horas_totais, ordem").order("id").range(a, b)),
    todas((a, b) => supabase.from("ufcds").select("id, codigo, designacao").order("id").range(a, b)),
    todas((a, b) => supabase.from("curso_formando_ufcds").select("id, curso_formando_id, curso_ufcd_id, frequenta").order("id").range(a, b)),
    todas((a, b) => supabase.from("sessoes").select("id, curso_ufcd_id, data, horas, estado").eq("estado", "realizada").lte("data", ate).order("id").range(a, b)),
    todas((a, b) => supabase.from("formando_faltas").select("id, curso_formando_id, sessao_id, tipo, horas").order("id").range(a, b)),
  ]);
  const cursoById = new Map(cursos.map(c => [c.id, c]));
  const ufcdById = new Map(ufcds.map(u => [u.id, u]));
  const praDisciplinas = disciplinas.filter(d => {
    const u = ufcdById.get(d.ufcd_id);
    return /\bpra\b/i.test(`${u?.codigo} ${u?.designacao}`) || /portef[oó]lio reflexivo/i.test(u?.designacao ?? "");
  }).sort((a, b) => `${cursoById.get(a.curso_id)?.codigo} ${a.ordem}`.localeCompare(`${cursoById.get(b.curso_id)?.codigo} ${b.ordem}`, "pt", { numeric: true }));
  const praCols = praDisciplinas.flatMap(d => {
    const u = ufcdById.get(d.ufcd_id);
    const label = `${cursoById.get(d.curso_id)?.codigo ?? d.curso_id} · ${u?.codigo} · ${u?.designacao} [${d.ordem}]`;
    return [{ id: d.id, key: `${label} — previstas (h)`, campo: "previstas" as const }, { id: d.id, key: `${label} — ministradas (h)`, campo: "ministradas" as const }];
  });
  const round = (n: number) => Math.round(n * 100) / 100;
  type Row = Record<string, string | number>;
  const resumo: Row[] = [], porCurso: Row[] = [], detalhe: Row[] = [];
  for (const formando of formandos.sort((a, b) => a.nome.localeCompare(b.nome, "pt"))) {
    const total: Row = { Formando: formando.nome, NIF: formando.nif ?? "", "Horas previstas": 0, "Horas ministradas": 0, "Horas frequentadas": 0, "Horas presenciais": 0, "Horas online": 0 };
    praCols.forEach(c => { total[c.key] = 0; });
    for (const insc of inscricoes.filter(i => i.formando_id === formando.id)) {
      const curso = cursoById.get(insc.curso_id);
      const ds = disciplinas.filter(d => d.curso_id === insc.curso_id);
      const ids = disciplinasFrequentadas(ds.map(d => d.id), selecoes.filter(s => s.curso_formando_id === insc.id));
      const linha: Row = { Formando: formando.nome, NIF: formando.nif ?? "", Curso: curso?.codigo ?? "", "Nome curso": curso?.nome ?? "", Estado: insc.estado, "Horas previstas": 0, "Horas ministradas": 0, "Horas frequentadas": 0, "Horas presenciais": 0, "Horas online": 0 };
      praCols.forEach(c => { linha[c.key] = 0; });
      for (const d of ds.filter(d => ids.has(d.id))) {
        const u = ufcdById.get(d.ufcd_id);
        let ministradas = 0, frequentadas = 0, presenciais = 0, online = 0;
        for (const s of sessoes.filter(s => s.curso_ufcd_id === d.id && sessaoNoPercurso(s, insc, ate))) {
          const h = horasFrequenciaSessao(s.horas, faltas.filter(f => f.curso_formando_id === insc.id && f.sessao_id === s.id));
          ministradas += Number(s.horas); frequentadas += h.frequentadas; presenciais += h.presenciais; online += h.online;
        }
        const valores = { "Horas previstas": Number(d.horas_totais), "Horas ministradas": round(ministradas), "Horas frequentadas": round(frequentadas), "Horas presenciais": round(presenciais), "Horas online": round(online) };
        detalhe.push({ Formando: formando.nome, NIF: formando.nif ?? "", Curso: curso?.codigo ?? "", UFCD: u?.codigo ?? "", Designação: u?.designacao ?? "", ...valores });
        for (const [key, valor] of Object.entries(valores)) { linha[key] = round(Number(linha[key]) + valor); total[key] = round(Number(total[key]) + valor); }
        for (const col of praCols.filter(c => c.id === d.id)) {
          const valor = col.campo === "previstas" ? Number(d.horas_totais) : round(ministradas);
          linha[col.key] = valor; total[col.key] = round(Number(total[col.key]) + valor);
        }
      }
      porCurso.push(linha);
    }
    resumo.push(total);
    if (resumo.length % 20 === 0) await yieldToBrowser();
  }
  const wb = XLSX.utils.book_new();
  for (const [nome, rows, base] of [
    ["Resumo por formando", resumo, ["Formando", "NIF", "Horas previstas", "Horas ministradas", "Horas frequentadas", "Horas presenciais", "Horas online", ...praCols.map(c => c.key)]],
    ["Por curso", porCurso, ["Formando", "NIF", "Curso", "Nome curso", "Estado", "Horas previstas", "Horas ministradas", "Horas frequentadas", "Horas presenciais", "Horas online", ...praCols.map(c => c.key)]],
    ["Por UFCD", detalhe, ["Formando", "NIF", "Curso", "UFCD", "Designação", "Horas previstas", "Horas ministradas", "Horas frequentadas", "Horas presenciais", "Horas online"]],
  ] as [string, Row[], string[]][]) {
    const ws = XLSX.utils.json_to_sheet(rows, { header: base });
    ws["!cols"] = base.map(k => ({ wch: k === "Formando" || k === "Designação" || k === "Nome curso" ? 35 : k.includes("·") ? 32 : 20 }));
    if (ws["!ref"]) ws["!autofilter"] = { ref: ws["!ref"] };
    XLSX.utils.book_append_sheet(wb, ws, nome);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Relatório de horas dos formandos", `Até ${ate}`],
    ["Previstas", "Total das horas das UFCD que cada formando frequenta; sem seleção explícita, todas as UFCD do curso."],
    ["Ministradas", "Sessões realizadas até à data da extração, dentro das datas da inscrição."],
    ["Frequentadas", "Ministradas menos faltas justificadas, injustificadas e ausências. Não são horas pagáveis nem incluem recuperação pedagógica."],
    ["Online", "Horas das sessões marcadas online para o formando, mesmo quando o marcador tem 0 horas."],
    ["Presenciais", "Horas frequentadas não marcadas online. Sem registo de falta, considera-se presença."],
    ["PRA", "Cada UFCD Portefólio Reflexivo de Aprendizagem tem duas colunas próprias, identificadas pelo curso e UFCD. Estes valores já estão incluídos nos totais."],
  ]), "Critérios");
  await yieldToBrowser();
  XLSX.writeFile(wb, `Horas_Formandos_${ate}.xlsx`);
}