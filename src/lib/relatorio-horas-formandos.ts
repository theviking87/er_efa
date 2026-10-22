import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { localDateIso } from "@/lib/format";
import { disciplinasFrequentadas, horasRelatorioUfcd, diasRelatorio } from "@/lib/financeiro/regras";
import { yieldToBrowser } from "@/lib/dom-helpers";
import { consultaSessoes } from "@/lib/sessoes-estado-compat";

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
    todas<{ id: string; curso_ufcd_id: string; data: string; horas: number; estado?: string | null }>((a, b) => consultaSessoes(comEstado => {
      const q = supabase.from("sessoes").select(comEstado ? "id, curso_ufcd_id, data, horas, estado" : "id, curso_ufcd_id, data, horas").lte("data", ate).order("id").range(a, b);
      return (comEstado ? q.eq("estado", "realizada") : q) as any;
    })),
    todas((a, b) => supabase.from("formando_faltas").select("id, curso_formando_id, sessao_id, tipo, horas").order("id").range(a, b)),
  ]);
  const cursoById = new Map(cursos.map(c => [c.id, c]));
  const ufcdById = new Map(ufcds.map(u => [u.id, u]));
  const praDisciplinas = disciplinas.filter(d => {
    const u = ufcdById.get(d.ufcd_id);
    return /\bpra\b/i.test(`${u?.codigo} ${u?.designacao}`) || /portef[oó]lio reflexivo/i.test(u?.designacao ?? "");
  }).sort((a, b) => `${cursoById.get(a.curso_id)?.codigo} ${a.ordem}`.localeCompare(`${cursoById.get(b.curso_id)?.codigo} ${b.ordem}`, "pt", { numeric: true }));
  const praIds = new Set(praDisciplinas.map(d => d.id));
  const formandoById = new Map(formandos.map(f => [f.id, f]));
  const round = (n: number) => Math.round(n * 100) / 100;
  const header = ["Curso", "Nome curso", "Formando", "NIF", "Estado", "Data desistência", "Horas a ministrar", "Horas totais", "Horas presenciais", "Horas online", "Horas PRA", "Dias total", "Dias PRA", "Dias presencial", "Dias online"];
  const linhas: Record<string, string | number>[] = [];
  for (const insc of inscricoes) {
    const formando = formandoById.get(insc.formando_id);
    if (!formando) continue;
    const curso = cursoById.get(insc.curso_id);
    const ds = disciplinas.filter(d => d.curso_id === insc.curso_id);
    const ids = disciplinasFrequentadas(ds.map(d => d.id), selecoes.filter(s => s.curso_formando_id === insc.id));
    const fs = faltas.filter(f => f.curso_formando_id === insc.id);
    let previstas = 0, total = 0, pres = 0, onl = 0, pra = 0;
    const dT = new Set<string>(), dP = new Set<string>(), dPr = new Set<string>(), dO = new Set<string>();
    for (const d of ds.filter(d => ids.has(d.id))) {
      previstas += Number(d.horas_totais) || 0;
      const h = horasRelatorioUfcd(sessoes.filter(s => s.curso_ufcd_id === d.id), fs, insc, ate, true);
      total += h.assistidas; pres += h.presenciais; onl += h.online;
      h.datasAssistidas.forEach(x => dT.add(x)); h.datasPresenciais.forEach(x => dPr.add(x)); h.datasOnline.forEach(x => dO.add(x));
      if (praIds.has(d.id)) { pra += h.assistidas; h.datasAssistidas.forEach(x => dP.add(x)); }
    }
    linhas.push({ Curso: curso?.codigo ?? "", "Nome curso": curso?.nome ?? "", Formando: formando.nome, NIF: formando.nif ?? "", Estado: insc.estado, "Data desistência": insc.data_desistencia ?? "",
      "Horas a ministrar": round(previstas), "Horas totais": round(total), "Horas presenciais": round(pres), "Horas online": round(onl), "Horas PRA": round(pra),
      "Dias total": dT.size, "Dias PRA": dP.size, "Dias presencial": dPr.size, "Dias online": dO.size });
    if (linhas.length % 20 === 0) await yieldToBrowser();
  }
  linhas.sort((x, y) => String(x.Curso).localeCompare(String(y.Curso), "pt", { numeric: true }) || String(x.Formando).localeCompare(String(y.Formando), "pt"));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(linhas, { header });
  ws["!cols"] = header.map(k => ({ wch: k === "Formando" || k === "Nome curso" ? 35 : 16 }));
  if (ws["!ref"]) ws["!autofilter"] = { ref: ws["!ref"] };
  XLSX.utils.book_append_sheet(wb, ws, "Horas por formando");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Relatório de horas dos formandos", `Até ${ate}`],
    ["Período", "Desde o 1.º dia de formação do curso até hoje ou até à véspera da desistência (o dia da desistência já não conta). Só sessões realizadas."],
    ["Horas a ministrar", "Total das horas das UC selecionadas para o formando nesse curso; sem seleção, todas as UC do curso."],
    ["Horas totais", "Horas assistidas = presenciais + online (descontadas faltas justificadas, injustificadas e ausências)."],
    ["Horas online", "Horas das sessões registadas como online para o formando."],
    ["Horas PRA", "Horas assistidas na UC Portefólio Reflexivo de Aprendizagem."],
    ["Dias", "Dias de calendário com presença; manhã ou tarde conta um dia. Um dia com sessão presencial e online conta em ambos."],
  ]), "Critérios");
  await yieldToBrowser();
  XLSX.writeFile(wb, `Horas_Formandos_${ate}.xlsx`);
}