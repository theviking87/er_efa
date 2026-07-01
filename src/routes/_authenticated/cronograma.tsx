import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { ChevronLeft, ChevronRight, CalendarPlus, Printer, FileWarning, Palmtree } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { MONTH_NAMES, fmtDate, fmtHoras, diffHoras, dateOnlyIso, weekdayFromIso, localDateIso } from "@/lib/format";
import { toast } from "sonner";
import { compareUfcdCodigo } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cronograma")({
  head: () => ({ meta: [{ title: "Cronograma Geral — Gestão Pedagógica" }] }),
  component: CronogramaGeral,
});

type DispSlot = {
  kind: "disp";
  id: string;
  formador_id: string;
  formador_nome: string;
  formador_cor: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  tipo: "disponivel" | "indisponivel";
  notas: string | null;
  curso_id: string | null;
  curso_codigo: string | null;
};
type SessaoSlot = {
  kind: "sessao";
  id: string;
  formador_id: string | null;
  formador_nome: string;
  formador_cor: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  horas: number;
  curso_id: string;
  curso_codigo: string;
  curso_nome: string;
  ufcd_codigo: string;
};


function CronogramaGeral() {
  const qc = useQueryClient();
  const [mes, setMes] = useState(() => { const d = new Date(); return { ano: d.getFullYear(), mes: d.getMonth() }; });
  const [formadorFiltro, setFormadorFiltro] = useState<string>("");
  const [cursoFiltro, setCursoFiltro] = useState<string>("");
  const [mostrar, setMostrar] = useState<"ambos" | "sessoes" | "disp">("ambos");
  const [convertSlot, setConvertSlot] = useState<DispSlot | null>(null);
  const [createDate, setCreateDate] = useState<string | null>(null);
  const [editDisp, setEditDisp] = useState<DispSlot | null>(null);
  const [feriasOpen, setFeriasOpen] = useState(false);



  useEffect(() => {
    const ch = supabase
      .channel("cronograma-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "cursos" }, () => qc.invalidateQueries({ queryKey: ["cursos-ativos-mes"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "curso_ufcds" }, () => qc.invalidateQueries({ queryKey: ["cursos-ativos-mes"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "curso_ufcd_formadores" }, () => qc.invalidateQueries({ queryKey: ["cursos-ativos-mes"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "formador_disponibilidades" }, () => { qc.invalidateQueries({ queryKey: ["disp-geral"] }); })
      .on("postgres_changes", { event: "*", schema: "public", table: "sessoes" }, () => { qc.invalidateQueries({ queryKey: ["sessoes-geral"] }); })
      .on("postgres_changes", { event: "*", schema: "public", table: "curso_ferias" }, () => { qc.invalidateQueries({ queryKey: ["curso-ferias-all"] }); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);


  const inicioMes = dateOnlyIso(mes.ano, mes.mes, 1);
  const fimMes = dateOnlyIso(mes.ano, mes.mes + 1, 0);

  const isProximoMes = useMemo(() => {
    const hoje = new Date();
    const prox = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
    return mes.ano === prox.getFullYear() && mes.mes === prox.getMonth();
  }, [mes]);

  const cursosAtivos = useQuery({
    queryKey: ["cursos-ativos-mes", inicioMes, fimMes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cursos")
        .select("id, codigo, nome, data_inicio, data_fim, estado")
        .eq("estado", "ativo")
        .lte("data_inicio", fimMes)
        .or(`data_fim.gte.${inicioMes},data_fim.is.null`);
      if (error) throw error;
      const cursos = data ?? [];
      const cursoIds = cursos.map((c: any) => c.id).filter(Boolean);
      if (cursoIds.length === 0) return [];

      // Evitar nested embeds pesados no PGlite/Electron: em pens USB isso
      // bloqueava a UI ao mudar de separador. Duas consultas simples são muito
      // mais leves e dão a mesma lista de formadores por curso.
      const { data: cursoUfcds, error: cuError } = await supabase
        .from("curso_ufcds")
        .select("id, curso_id")
        .in("curso_id", cursoIds);
      if (cuError) throw cuError;
      const cuRows = cursoUfcds ?? [];
      const cuIds = cuRows.map((cu: any) => cu.id).filter(Boolean);

      const formadoresByCu = new Map<string, string[]>();
      if (cuIds.length > 0) {
        const { data: formRows, error: formError } = await supabase
          .from("curso_ufcd_formadores" as any)
          .select("curso_ufcd_id, formador_id")
          .in("curso_ufcd_id", cuIds);
        if (formError) throw formError;
        (formRows ?? []).forEach((r: any) => {
          const arr = formadoresByCu.get(r.curso_ufcd_id) ?? [];
          if (r.formador_id) arr.push(r.formador_id);
          formadoresByCu.set(r.curso_ufcd_id, arr);
        });
      }

      const formadoresByCurso = new Map<string, Set<string>>();
      cuRows.forEach((cu: any) => {
        const set = formadoresByCurso.get(cu.curso_id) ?? new Set<string>();
        (formadoresByCu.get(cu.id) ?? []).forEach((fid) => set.add(fid));
        formadoresByCurso.set(cu.curso_id, set);
      });

      return cursos.map((c: any) => ({
        id: c.id,
        codigo: c.codigo,
        nome: c.nome,
        formadores: Array.from(formadoresByCurso.get(c.id) ?? new Set<string>()),
      }));
    },
  });


  const formadores = useQuery({
    queryKey: ["formadores-todos"],
    queryFn: async () => (await supabase.from("formadores").select("id, nome, cor").order("nome")).data ?? [],
  });

  const cursosTodos = useQuery({
    queryKey: ["cursos-cronograma-filter"],
    queryFn: async () => (await supabase.from("cursos").select("id, codigo, nome").order("codigo")).data ?? [],
  });


  const sessoes = useQuery({
    queryKey: ["sessoes-geral", inicioMes, fimMes, formadorFiltro, cursoFiltro],
    queryFn: async () => {
      let q = supabase.from("sessoes")
        .select("id, data, hora_inicio, hora_fim, horas, formador_id, curso_id, formador:formadores(id,nome,abreviatura,cor), curso:cursos(id,nome,codigo), curso_ufcd:curso_ufcds(id, ufcd:ufcds(codigo, designacao))")
        .gte("data", inicioMes).lte("data", fimMes)
        .order("data").order("hora_inicio");
      if (formadorFiltro) q = q.eq("formador_id", formadorFiltro);
      if (cursoFiltro) q = q.eq("curso_id", cursoFiltro);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const disp = useQuery({
    queryKey: ["disp-geral", inicioMes, fimMes, formadorFiltro, cursoFiltro],
    queryFn: async () => {
      let q = supabase.from("formador_disponibilidades" as any)
        .select("id, formador_id, data, hora_inicio, hora_fim, tipo, notas, curso_id, formador:formadores(id,nome,abreviatura,cor), curso:cursos(id,codigo)")
        .gte("data", inicioMes).lte("data", fimMes)
        .order("data").order("hora_inicio");
      if (formadorFiltro) q = q.eq("formador_id", formadorFiltro);
      if (cursoFiltro) q = q.or(`curso_id.eq.${cursoFiltro},curso_id.is.null`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const ferias = useQuery({
    queryKey: ["curso-ferias-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("curso_ferias" as any)
        .select("id, curso_id, data_inicio, data_fim, motivo, curso:cursos(id,codigo,nome)")
        .order("data_inicio");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const observacoes = useQuery({
    queryKey: ["cronograma-observacoes", inicioMes],
    queryFn: async () => {
      const { data, error } = await supabase.from("cronograma_observacoes" as any)
        .select("id, curso_id, mes, texto")
        .eq("mes", inicioMes);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("cron-obs-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "cronograma_observacoes" }, () => qc.invalidateQueries({ queryKey: ["cronograma-observacoes"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // Map dia ISO -> Set<curso_id> de cursos em férias
  const feriasByDay = useMemo(() => {
    const m = new Map<string, Set<string>>();
    (ferias.data ?? []).forEach((f: any) => {
      const di = new Date(f.data_inicio + "T00:00:00");
      const df = new Date(f.data_fim + "T00:00:00");
      for (let d = new Date(di); d <= df; d.setDate(d.getDate() + 1)) {
        const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
        let s = m.get(iso);
        if (!s) { s = new Set(); m.set(iso, s); }
        s.add(f.curso_id);
      }
    });
    return m;
  }, [ferias.data]);


  const slotsByDay = useMemo(() => {
    const m = new Map<string, (DispSlot | SessaoSlot)[]>();
    if (mostrar !== "disp") {
      (sessoes.data ?? []).forEach((s: any) => {
        const slot: SessaoSlot = {
          kind: "sessao",
          id: s.id,
          formador_id: s.formador_id ?? s.formador?.id ?? null,
          formador_nome: (s.formador?.abreviatura?.trim() || s.formador?.nome) ?? "—",
          formador_cor: s.formador?.cor ?? "#888",
          data: s.data,
          hora_inicio: s.hora_inicio,
          hora_fim: s.hora_fim,
          horas: Number(s.horas),
          curso_id: s.curso?.id,
          curso_codigo: s.curso?.codigo ?? "",
          curso_nome: s.curso?.nome ?? "",
          ufcd_codigo: s.curso_ufcd?.ufcd?.codigo ?? "",
        };
        const arr = m.get(s.data) ?? [];
        arr.push(slot); m.set(s.data, arr);
      });
    }
    if (mostrar !== "sessoes") {
      const cursoFiltroInfo = cursoFiltro ? (cursosAtivos.data ?? []).find((c: any) => c.id === cursoFiltro) : null;
      const formadoresDoCursoFiltro = new Set<string>(cursoFiltroInfo?.formadores ?? []);
      (disp.data ?? []).forEach((d: any) => {
        // Quando filtrado por curso, mostrar disponibilidades específicas desse curso
        // ou gerais (sem curso) de formadores atribuídos ao curso.
        if (cursoFiltro) {
          if (d.curso_id === cursoFiltro) {
            // ok
          } else if (!d.curso_id && formadoresDoCursoFiltro.has(d.formador_id)) {
            // ok — disp geral cobre todos os cursos do formador
          } else {
            return;
          }
        }
        const slot: DispSlot = {
          kind: "disp",
          id: d.id,
          formador_id: d.formador_id,
          formador_nome: (d.formador?.abreviatura?.trim() || d.formador?.nome) ?? "—",
          formador_cor: d.formador?.cor ?? "#888",
          data: d.data,
          hora_inicio: d.hora_inicio,
          hora_fim: d.hora_fim,
          tipo: d.tipo,
          notas: d.notas,
          curso_id: d.curso_id ?? null,
          curso_codigo: d.curso?.codigo ?? null,
        };
        const arr = m.get(d.data) ?? [];
        arr.push(slot); m.set(d.data, arr);

      });
    }
    // sort each day by hora_inicio
    for (const arr of m.values()) arr.sort((a, b) => (a.hora_inicio ?? "").localeCompare(b.hora_inicio ?? ""));
    return m;
  }, [sessoes.data, disp.data, mostrar, cursoFiltro, cursosAtivos.data]);


  const grid = useMemo(() => {
    const first = new Date(mes.ano, mes.mes, 1);
    const last = new Date(mes.ano, mes.mes + 1, 0);
    const startDow = (first.getDay() + 6) % 7;
    const days: ({ d: number; iso: string } | null)[] = [];
    for (let i = 0; i < startDow; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) {
      const iso = dateOnlyIso(mes.ano, mes.mes, d);
      days.push({ d, iso });
    }
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [mes]);

  const PALETA = ["#fde68a", "#bbf7d0", "#fbcfe8", "#bfdbfe", "#ddd6fe", "#fed7aa", "#a7f3d0", "#fecaca"];
  const cursosComCor = useMemo(() => {
    const base = (cursosAtivos.data ?? []).map((c, i) => ({ ...c, cor: PALETA[i % PALETA.length] }));
    return cursoFiltro ? base.filter(c => c.id === cursoFiltro) : base;
  }, [cursosAtivos.data, cursoFiltro]);

  // Por dia × curso: cobertura de manhã (09-13) e tarde (14-17).
  const coverageByDay = useMemo(() => {
    const m = new Map<string, Map<string, { manha: boolean; tarde: boolean }>>();
    const cursos = cursosComCor;
    const toMin = (h: string) => {
      const [hh, mm] = (h ?? "").split(":").map(Number);
      return (hh || 0) * 60 + (mm || 0);
    };
    const ensure = (iso: string, cid: string) => {
      let dayMap = m.get(iso);
      if (!dayMap) { dayMap = new Map(); m.set(iso, dayMap); }
      let v = dayMap.get(cid);
      if (!v) { v = { manha: false, tarde: false }; dayMap.set(cid, v); }
      return v;
    };
    (disp.data ?? []).forEach((d: any) => {
      if (d.tipo !== "disponivel") return;
      const ini = toMin(d.hora_inicio);
      const fim = toMin(d.hora_fim);
      const cobreManha = ini < 780 && fim > 540;
      const cobreTarde = ini < 1020 && fim > 840;
      const alvo: string[] = d.curso_id
        ? [d.curso_id]
        : cursos.filter(c => c.formadores.includes(d.formador_id)).map(c => c.id);
      for (const cid of alvo) {
        const v = ensure(d.data, cid);
        if (cobreManha) v.manha = true;
        if (cobreTarde) v.tarde = true;
      }
    });
    // Sessões já marcadas também contam como cobertura (consomem a disponibilidade)
    (sessoes.data ?? []).forEach((s: any) => {
      if (!s.curso_id) return;
      const ini = toMin(s.hora_inicio);
      const fim = toMin(s.hora_fim);
      const cobreManha = ini < 780 && fim > 540;
      const cobreTarde = ini < 1020 && fim > 840;
      const v = ensure(s.data, s.curso_id);
      if (cobreManha) v.manha = true;
      if (cobreTarde) v.tarde = true;
    });
    return m;
  }, [disp.data, sessoes.data, cursosComCor]);


  // Para cada dia: cursos sem manhã / sem tarde / sem nada.
  type MissingInfo = {
    todos: boolean;
    cursos: { id: string; codigo: string; cor: string }[]; // sem nada (dia todo)
    manha: { id: string; codigo: string; cor: string }[];
    tarde: { id: string; codigo: string; cor: string }[];
  };
  const dayMissing = useMemo(() => {
    const r = new Map<string, MissingInfo>();
    if (mostrar !== "disp") return r;
    const cursos = cursosComCor;
    if (cursos.length === 0) return r;
    for (const cell of grid) {
      if (!cell) continue;
      const dow = weekdayFromIso(cell.iso);
      if (dow === 0 || dow === 6) continue;
      const feriasSet = feriasByDay.get(cell.iso);
      const cov = coverageByDay.get(cell.iso) ?? new Map<string, { manha: boolean; tarde: boolean }>();
      const semNada: { id: string; codigo: string; cor: string }[] = [];
      const semManha: { id: string; codigo: string; cor: string }[] = [];
      const semTarde: { id: string; codigo: string; cor: string }[] = [];
      for (const c of cursos) {
        if (feriasSet?.has(c.id)) continue; // dia de férias do curso — não conta como falta
        const v = cov.get(c.id) ?? { manha: false, tarde: false };
        const entry = { id: c.id, codigo: c.codigo, cor: c.cor };
        if (!v.manha && !v.tarde) semNada.push(entry);
        else if (!v.manha) semManha.push(entry);
        else if (!v.tarde) semTarde.push(entry);
      }
      if (semNada.length === 0 && semManha.length === 0 && semTarde.length === 0) continue;
      r.set(cell.iso, {
        todos: semNada.length === cursos.length,
        cursos: semNada,
        manha: semManha,
        tarde: semTarde,
      });
    }
    return r;
  }, [mostrar, cursosComCor, coverageByDay, grid, feriasByDay]);

  // Disponibilidades sobrepostas: mesmo curso, mesmo dia, formadores diferentes, intervalos que se intersetam.
  const overlapDispIds = useMemo(() => {
    const matched = new Set<string>();
    const cursos = cursosAtivos.data ?? [];
    const toMin = (h: string) => {
      const [hh, mm] = (h ?? "").split(":").map(Number);
      return (hh || 0) * 60 + (mm || 0);
    };
    type Item = { id: string; formador_id: string; s: number; e: number };
    const byCursoDay = new Map<string, Item[]>();
    (disp.data ?? []).forEach((d: any) => {
      if (d.tipo !== "disponivel") return;
      const cursosAlvo = d.curso_id
        ? [d.curso_id]
        : cursos.filter((c: any) => c.formadores.includes(d.formador_id)).map((c: any) => c.id);
      const item: Item = { id: d.id, formador_id: d.formador_id, s: toMin(d.hora_inicio), e: toMin(d.hora_fim) };
      for (const cid of cursosAlvo) {
        const k = `${cid}|${d.data}`;
        const arr = byCursoDay.get(k) ?? [];
        arr.push(item);
        byCursoDay.set(k, arr);
      }
    });
    for (const arr of byCursoDay.values()) {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i], b = arr[j];
          if (a.formador_id === b.formador_id) continue;
          if (a.s < b.e && b.s < a.e) {
            matched.add(a.id);
            matched.add(b.id);
          }
        }
      }
    }
    return matched;
  }, [disp.data, cursosAtivos.data]);

  // Cobertura de sessões por dia (manhã/tarde) para o curso filtrado.
  const sessoesCoverByDay = useMemo(() => {
    const m = new Map<string, { manha: boolean; tarde: boolean }>();
    (sessoes.data ?? []).forEach((x: any) => {
      if (cursoFiltro && x.curso_id !== cursoFiltro) return;
      const hi = (x.hora_inicio ?? "").slice(0, 5);
      const hf = (x.hora_fim ?? "").slice(0, 5);
      const cur = m.get(x.data) ?? { manha: false, tarde: false };
      if (hi < "13:00") cur.manha = true;
      if (hf > "13:00") cur.tarde = true;
      m.set(x.data, cur);
    });
    // Dias de férias do curso filtrado: considerar coberto (dia inteiro)
    if (cursoFiltro) {
      for (const [iso, set] of feriasByDay.entries()) {
        if (set.has(cursoFiltro)) m.set(iso, { manha: true, tarde: true });
      }
    }
    return m;
  }, [sessoes.data, cursoFiltro, feriasByDay]);





  const totalSessoes = (sessoes.data ?? []).length;
  const totalHoras = (sessoes.data ?? []).reduce((acc, s: any) => acc + Number(s.horas), 0);
  const totalDisp = (disp.data ?? []).filter((d: any) => d.tipo === "disponivel").length;

  function prev() { setMes(m => m.mes === 0 ? { ano: m.ano - 1, mes: 11 } : { ano: m.ano, mes: m.mes - 1 }); }
  function next() { setMes(m => m.mes === 11 ? { ano: m.ano + 1, mes: 0 } : { ano: m.ano, mes: m.mes + 1 }); }
  function hoje() { const d = new Date(); setMes({ ano: d.getFullYear(), mes: d.getMonth() }); }

  async function imprimirDiasSemDisp() {
    if (!cursoFiltro) return toast.error("Seleciona um curso primeiro");
    const curso = (cursosTodos.data ?? []).find((c: any) => c.id === cursoFiltro) as any;
    if (!curso) return;
    const diasSem: { iso: string; dow: string; periodo: string }[] = [];
    const semanaLbl = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const dispData = disp.data ?? [];
    // Procura formadores do curso em cursosAtivos; se não existir, busca direto à BD para evitar saltar disp. gerais.
    let formadoresDoCurso = new Set<string>(((cursosAtivos.data ?? []).find((c: any) => c.id === cursoFiltro)?.formadores) ?? []);
    if (formadoresDoCurso.size === 0) {
      const { data: cuRows } = await supabase
        .from("curso_ufcds")
        .select("curso_ufcd_formadores(formador_id)")
        .eq("curso_id", cursoFiltro);
      const ids = (cuRows ?? []).flatMap((cu: any) => (cu.curso_ufcd_formadores ?? []).map((f: any) => f.formador_id));
      formadoresDoCurso = new Set<string>(ids);
    }
    const toMin = (h: string) => {
      const [hh, mm] = (h ?? "").split(":").map(Number);
      return (hh || 0) * 60 + (mm || 0);
    };
    // Manhã: 09:00-13:00 (540-780). Tarde: 14:00-17:00 (840-1020).
    for (const cell of grid) {
      if (!cell) continue;
      const dow = weekdayFromIso(cell.iso);
      if (dow === 0 || dow === 6) continue;
      if (feriasByDay.get(cell.iso)?.has(cursoFiltro)) continue; // dia de férias do curso
      let cobreManha = false;
      let cobreTarde = false;
      for (const d of dispData as any[]) {
        if (d.data !== cell.iso || d.tipo !== "disponivel") continue;
        if (!(d.curso_id === cursoFiltro || (!d.curso_id && formadoresDoCurso.has(d.formador_id)))) continue;
        const ini = toMin(d.hora_inicio);
        const fim = toMin(d.hora_fim);
        if (ini < 780 && fim > 540) cobreManha = true;
        if (ini < 1020 && fim > 840) cobreTarde = true;
        if (cobreManha && cobreTarde) break;
      }
      // Sessões já marcadas para o curso contam como cobertura.
      if (!(cobreManha && cobreTarde)) {
        for (const s of (sessoes.data ?? []) as any[]) {
          if (s.data !== cell.iso || s.curso_id !== cursoFiltro) continue;
          const ini = toMin(s.hora_inicio);
          const fim = toMin(s.hora_fim);
          if (ini < 780 && fim > 540) cobreManha = true;
          if (ini < 1020 && fim > 840) cobreTarde = true;
          if (cobreManha && cobreTarde) break;
        }
      }
      if (cobreManha && cobreTarde) continue;

      let periodo = "Dia todo";
      if (cobreManha && !cobreTarde) periodo = "Tarde";
      else if (!cobreManha && cobreTarde) periodo = "Manhã";
      diasSem.push({ iso: cell.iso, dow: semanaLbl[dow], periodo });
    }
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, w, 18, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text("Dias sem disponibilidade", 14, 11);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(`${curso.codigo} · ${curso.nome} — ${MONTH_NAMES[mes.mes]} ${mes.ano}`, 14, 15.5);
    doc.setTextColor(0, 0, 0);

    if (diasSem.length === 0) {
      doc.setFontSize(11);
      doc.text("Todos os dias úteis do mês têm disponibilidade de manhã e de tarde.", 14, 30);
    } else {
      const totalDias = diasSem.filter(d => d.periodo === "Dia todo").length;
      const totalManha = diasSem.filter(d => d.periodo === "Manhã").length;
      const totalTarde = diasSem.filter(d => d.periodo === "Tarde").length;
      autoTable(doc, {
        startY: 24,
        head: [["Data", "Dia da semana", "Período sem disponibilidade"]],
        body: diasSem.map(d => [fmtDate(d.iso), d.dow === "Sáb" ? "Sábado" : `${d.dow}-feira`, d.periodo]),
        styles: { font: "helvetica", fontSize: 10, cellPadding: 2.5 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 14, right: 14 },
      });
      const yEnd = (doc as any).lastAutoTable.finalY ?? 24;
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Total: ${diasSem.length} registo(s) — ${totalDias} dia(s) inteiro(s), ${totalManha} manhã(s), ${totalTarde} tarde(s)`,
        14,
        yEnd + 8,
      );
    }
    doc.save(`Dias_sem_disponibilidade_${curso.codigo}_${mes.ano}-${String(mes.mes + 1).padStart(2, "0")}.pdf`);
  }


  return (
    <PageContainer>
      <PageHeader
        title="Cronograma Geral"
        description="Sessões agendadas e disponibilidades declaradas pelos formadores. Clica numa disponibilidade para a converter em sessão."
      />


      <Card><CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prev}><ChevronLeft className="size-4" /></Button>
            <div className="font-semibold text-lg min-w-[170px] text-center">{MONTH_NAMES[mes.mes]} {mes.ano}</div>
            <Button variant="outline" size="icon" onClick={next}><ChevronRight className="size-4" /></Button>
            <Button variant="ghost" size="sm" onClick={hoje}>Hoje</Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="size-4 mr-1" />Imprimir</Button>
            <Button
              variant="outline"
              size="sm"
              onClick={imprimirDiasSemDisp}
              disabled={!cursoFiltro}
              title={cursoFiltro ? "PDF dos dias úteis sem disponibilidade para o curso selecionado" : "Seleciona um curso para ativar"}
            >
              <FileWarning className="size-4 mr-1" />Dias sem disponibilidade
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setCreateDate(localDateIso())}
              title="Lançar disponibilidade"
            >
              <CalendarPlus className="size-4 mr-1" />Lançar disponibilidade
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFeriasOpen(true)}
              title="Lançar período de férias / inatividade do formador"
            >
              <Palmtree className="size-4 mr-1" />Lançar férias
            </Button>


          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={mostrar}
              onChange={e => setMostrar(e.target.value as any)}
              className="text-sm border border-input rounded-md px-2.5 py-1.5 bg-background"
            >
              <option value="ambos">Sessões + disponibilidades</option>
              <option value="sessoes">Apenas sessões</option>
              <option value="disp">Apenas disponibilidades</option>
            </select>
            <select
              value={formadorFiltro}
              onChange={e => setFormadorFiltro(e.target.value)}
              className="text-sm border border-input rounded-md px-2.5 py-1.5 bg-background"
            >
              <option value="">Todos os formadores</option>
              {(formadores.data ?? []).map((f: any) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
            <select
              value={cursoFiltro}
              onChange={e => setCursoFiltro(e.target.value)}
              className="text-sm border border-input rounded-md px-2.5 py-1.5 bg-background"
            >
              <option value="">Todos os cursos</option>
              {(cursosTodos.data ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>
              ))}
            </select>
            <div className="text-xs text-muted-foreground">
              {totalSessoes} sessões · {fmtHoras(totalHoras)} · {totalDisp} dispon.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-foreground" /> Sessão</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm border-2 border-emerald-500 border-dashed" /> Disponível</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm border-2 border-rose-500 border-dashed" /> Indisponível</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm ring-2 ring-amber-500" /> Disponibilidade sobreposta (mesmo curso, &gt;1 formador)</span>
          {cursoFiltro && (
            <span className="inline-flex items-center gap-1.5"><span className="text-[9px] font-semibold uppercase px-1 rounded bg-amber-100 text-amber-800 border border-amber-300">sem sessão</span> Dia útil sem sessão atribuída ao curso</span>
          )}

          {mostrar === "disp" && cursosComCor.length > 0 && (
            <>

              <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-red-500" /> Sem disponibilidade para nenhum curso</span>
              {cursosComCor.map(c => (
                <span key={c.id} className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-sm" style={{ background: c.cor }} /> {c.codigo} sem disponibilidade
                </span>
              ))}
            </>
          )}

        </div>

        <ObservacoesPanel
          mes={inicioMes}
          cursos={(cursoFiltro
            ? (cursosTodos.data ?? []).filter((c: any) => c.id === cursoFiltro)
            : (cursosTodos.data ?? [])) as any[]}
          obs={observacoes.data ?? []}
          onSaved={() => qc.invalidateQueries({ queryKey: ["cronograma-observacoes"] })}
        />

        <div className="border rounded-md overflow-hidden bg-card">
          <div className="grid grid-cols-7 bg-muted/40 text-xs uppercase text-muted-foreground">
            {["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map(d => <div key={d} className="px-2 py-1.5 text-center font-medium">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 auto-rows-[minmax(110px,auto)]">
            {grid.map((cell, i) => {
              const miss = cell ? dayMissing.get(cell.iso) : undefined;
              let bgStyle: React.CSSProperties | undefined;
              if (miss) {
                if (miss.todos) {
                  bgStyle = { background: "rgba(239,68,68,0.35)" };
                } else {
                  const manhaCursos = [...miss.cursos, ...miss.manha];
                  const tardeCursos = [...miss.cursos, ...miss.tarde];
                  const stopsOf = (arr: { cor: string }[]) => {
                    if (arr.length === 0) return null;
                    const n = arr.length;
                    return arr.map((c, idx) => {
                      const a = (idx * 100) / n;
                      const b = ((idx + 1) * 100) / n;
                      return `${c.cor} ${a}%, ${c.cor} ${b}%`;
                    }).join(", ");
                  };
                  const layers: string[] = [];
                  const sizes: string[] = [];
                  const positions: string[] = [];
                  const repeats: string[] = [];
                  const manhaStops = stopsOf(manhaCursos);
                  const tardeStops = stopsOf(tardeCursos);
                  if (manhaStops) {
                    layers.push(`linear-gradient(90deg, ${manhaStops})`);
                    sizes.push("100% 50%");
                    positions.push("top left");
                    repeats.push("no-repeat");
                  }
                  if (tardeStops) {
                    layers.push(`linear-gradient(90deg, ${tardeStops})`);
                    sizes.push("100% 50%");
                    positions.push("bottom left");
                    repeats.push("no-repeat");
                  }
                  if (layers.length) {
                    bgStyle = {
                      backgroundImage: layers.join(", "),
                      backgroundSize: sizes.join(", "),
                      backgroundPosition: positions.join(", "),
                      backgroundRepeat: repeats.join(", "),
                    };
                  }
                }
              }
              const titleParts: string[] = [];
              if (miss) {
                if (miss.todos) titleParts.push("Nenhum curso ativo tem formador disponível");
                else {
                  if (miss.cursos.length) titleParts.push("Sem disponibilidade (dia todo): " + miss.cursos.map(c => c.codigo).join(", "));
                  if (miss.manha.length) titleParts.push("Sem disponibilidade de manhã: " + miss.manha.map(c => c.codigo).join(", "));
                  if (miss.tarde.length) titleParts.push("Sem disponibilidade de tarde: " + miss.tarde.map(c => c.codigo).join(", "));
                }
              }
              const title = titleParts.length ? titleParts.join("\n") : undefined;
              const canCreate = mostrar === "disp" && !!cell;
              return (
              <div
                key={i}
                title={title ?? (canCreate ? "Clicar para lançar disponibilidade" : undefined)}
                style={bgStyle}
                onClick={(e) => {
                  if (!canCreate) return;
                  if ((e.target as HTMLElement).closest("button,a")) return;
                  setCreateDate(cell!.iso);
                }}
                className={"border-t border-l border-border first:border-l-0 [&:nth-child(7n+1)]:border-l-0 p-1.5 min-h-[130px] " + (canCreate ? "cursor-pointer hover:bg-emerald-50/40" : "")}
              >
                {cell && (() => {
                  const renderSlot = (slot: any) => {
                    if (slot.kind === "sessao") {
                      return (
                        <Link
                          key={"s" + slot.id}
                          to="/cursos/$id"
                          params={{ id: slot.curso_id }}
                          className="block text-[11px] leading-tight rounded px-1.5 py-1 hover:opacity-80 transition"
                          style={{ background: `${slot.formador_cor}20`, color: slot.formador_cor, borderLeft: `2px solid ${slot.formador_cor}` }}
                          title={`${slot.curso_codigo} — ${slot.curso_nome}\n${slot.ufcd_codigo}\n${slot.formador_nome}`}
                        >
                          <div className="font-medium">{slot.hora_inicio?.slice(0,5)}–{slot.hora_fim?.slice(0,5)}</div>
                          <div className="truncate font-medium">{slot.curso_codigo}</div>
                          <div className="truncate opacity-80">{slot.formador_nome}</div>
                        </Link>
                      );
                    }
                    const isDisp = slot.tipo === "disponivel";
                    const isOverlap = isDisp && overlapDispIds.has(slot.id);
                    return (
                      <div
                        key={"d" + slot.id}
                        className={"relative group w-full text-left text-[11px] leading-tight rounded px-1.5 py-1 border-2 border-dashed transition bg-background/80 " +
                          (isDisp ? "hover:bg-emerald-50 cursor-pointer " : "opacity-80 ") +
                          (isOverlap ? "ring-2 ring-amber-500 ring-offset-1" : "")}
                        style={{
                          borderColor: isDisp ? "rgb(16,185,129)" : "rgb(244,63,94)",
                          color: slot.formador_cor,
                        }}
                        title={`${isDisp ? "Disponível" : "Indisponível"} — ${slot.formador_nome}${slot.curso_codigo ? "\nCurso: " + slot.curso_codigo : ""}${slot.notas ? "\n" + slot.notas : ""}${isOverlap ? "\n\n⚠ Outro formador deu disponibilidade sobreposta para o mesmo curso" : ""}${isDisp ? "\n\nClicar para criar sessão" : ""}`}
                        onClick={(e) => { e.stopPropagation(); if (isDisp) setConvertSlot(slot); }}
                      >
                        {isOverlap && (
                          <span className="absolute -top-1 -left-1 bg-amber-500 text-white rounded-full size-3.5 flex items-center justify-center text-[9px] font-bold leading-none print:hidden" title="Sobreposta">↔</span>
                        )}
                        <div className="font-medium">{slot.hora_inicio?.slice(0,5)}–{slot.hora_fim?.slice(0,5)}</div>
                        <div className="truncate font-medium">{slot.formador_nome}</div>
                        <div className="truncate opacity-80">
                          {isDisp ? "Disponível" : "Indisponível"}
                          {slot.curso_codigo ? ` · ${slot.curso_codigo}` : ""}
                        </div>
                        <div className="absolute top-0 right-0 flex opacity-0 group-hover:opacity-100 print:hidden">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setEditDisp(slot); }}
                            className="px-1 text-[10px] text-sky-600 hover:underline"
                            title="Editar disponibilidade"
                          >✎</button>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm("Apagar esta disponibilidade?")) return;
                              const { error } = await supabase.from("formador_disponibilidades" as any).delete().eq("id", slot.id);
                              if (error) return toast.error(error.message);
                              toast.success("Disponibilidade apagada");
                              qc.invalidateQueries({ queryKey: ["disp-geral"] });
                              qc.invalidateQueries({ queryKey: ["disponibilidades", slot.formador_id] });
                            }}
                            className="px-1 text-[10px] text-rose-600"
                            title="Apagar disponibilidade"
                          >✕</button>
                        </div>
                      </div>
                    );
                  };
                  const slots = slotsByDay.get(cell.iso) ?? [];
                  const fullSlots = slots.filter((s: any) => (s.hora_inicio ?? "") < "13:00" && (s.hora_fim ?? "") > "13:00");
                  const manhaSlots = slots.filter((s: any) => (s.hora_fim ?? "") <= "13:00");
                  const tardeSlots = slots.filter((s: any) => (s.hora_inicio ?? "") >= "13:00");
                  const dow = weekdayFromIso(cell.iso);
                  const isUtil = dow !== 0 && dow !== 6;
                  const feriasSet = feriasByDay.get(cell.iso);
                  const feriasCursos = feriasSet
                    ? (cursosTodos.data ?? []).filter((c: any) => feriasSet.has(c.id))
                    : [];
                  const emFerias = cursoFiltro ? feriasSet?.has(cursoFiltro) : (feriasCursos.length > 0);
                  const sc = sessoesCoverByDay.get(cell.iso) ?? { manha: false, tarde: false };
                  const diaIncompleto = !!cursoFiltro && isUtil && !emFerias && !(sc.manha && sc.tarde);
                  const semSessaoLabel = !sc.manha && !sc.tarde ? "sem sessão" : !sc.manha ? "sem sessão (manhã)" : "sem sessão (tarde)";
                  return (
                    <div className="flex flex-col gap-1 h-full min-h-[120px]">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs text-muted-foreground">{cell.d}</span>
                        {emFerias && (
                          <span
                            className="text-[9px] font-semibold uppercase tracking-wide px-1 py-px rounded bg-sky-100 text-sky-800 border border-sky-300 inline-flex items-center gap-0.5"
                            title={`Férias: ${feriasCursos.map((c: any) => c.codigo).join(", ") || "curso"}`}
                          ><Palmtree className="size-2.5" /> Férias</span>
                        )}
                        {!emFerias && diaIncompleto && (
                          <span
                            className="text-[9px] font-semibold uppercase tracking-wide px-1 py-px rounded bg-amber-100 text-amber-800 border border-amber-300"
                            title="Dia sem cobertura completa de sessões para o curso filtrado"
                          >{semSessaoLabel}</span>
                        )}

                      </div>
                      {fullSlots.length > 0 && <div className="space-y-1">{fullSlots.map(renderSlot)}</div>}
                      {manhaSlots.length > 0 && <div className="space-y-1">{manhaSlots.map(renderSlot)}</div>}
                      {tardeSlots.length > 0 && <div className="space-y-1 mt-auto">{tardeSlots.map(renderSlot)}</div>}
                    </div>
                  );

                })()}
              </div>
            );})}
          </div>
        </div>
      </CardContent></Card>

      {/* ÁREA DE IMPRESSÃO — uma folha A4 paisagem */}
      <div id="cronograma-print" className="hidden print:block">
        <div className="cronograma-page">
          <div className="cronograma-header mb-1.5">
            <div className="font-semibold text-sm leading-tight">Cronograma Geral</div>
            <div className="text-[10px] leading-tight">
              {MONTH_NAMES[mes.mes]} {mes.ano}
              {formadorFiltro ? ` · ${(formadores.data ?? []).find((f: any) => f.id === formadorFiltro)?.nome ?? ""}` : ""}
            </div>
          </div>
          <div className="cronograma-weekdays grid grid-cols-7 border border-gray-400 border-b-0 text-[8px]">
            {["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map(d => (
              <div key={d} className="border-r border-gray-400 last:border-r-0 bg-gray-100 px-1 py-[1px] font-semibold text-center uppercase leading-none">{d}</div>
            ))}
          </div>
          <div className="cronograma-grid grid grid-cols-7 border border-gray-400 text-[9px]">
            {grid.map((cell, i) => (
              <div key={i} className="cronograma-cell border-r border-b border-gray-300 last:border-r-0 p-1 align-top overflow-hidden" style={{ borderRight: (i % 7 === 6) ? "none" : undefined }}>
                {cell && (
                  <>
                    <div className="text-[10px] font-semibold mb-0.5 leading-none">{cell.d}</div>
                    <div className="space-y-0.5">
                      {(slotsByDay.get(cell.iso) ?? []).map((slot: any) => {
                        const cor = slot.formador_cor || "#888";
                        const isSessao = slot.kind === "sessao";
                        const tag = isSessao ? slot.curso_codigo : (slot.tipo === "disponivel" ? "Disp." : "Indisp.");
                        return (
                          <div key={slot.kind + slot.id} className="leading-tight" style={{ borderLeft: `2px solid ${cor}`, paddingLeft: "3px" }}>
                            <span className="tabular-nums font-semibold">{slot.hora_inicio?.slice(0,5)}-{slot.hora_fim?.slice(0,5)}</span>
                            {" "}{slot.formador_nome} ({tag})
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <ConvertDispDialog
        slot={convertSlot}
        onClose={() => setConvertSlot(null)}
      />
      <FeriasDialog
        open={feriasOpen}
        onClose={() => setFeriasOpen(false)}
        cursos={(cursosTodos.data ?? []) as any[]}
        defaultCursoId={cursoFiltro || null}
      />

      <CreateDispDialog
        data={createDate}
        formadores={(formadores.data ?? []) as any[]}
        defaultFormadorId={formadorFiltro || null}
        onClose={() => setCreateDate(null)}
      />
      <CreateDispDialog
        key={editDisp?.id ?? "edit"}
        data={editDisp?.data ?? null}
        formadores={(formadores.data ?? []) as any[]}
        defaultFormadorId={null}
        editing={editDisp}
        onClose={() => setEditDisp(null)}
      />
    </PageContainer>
  );
}

function ConvertDispDialog({ slot, onClose }: { slot: DispSlot | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [cursoId, setCursoId] = useState("");
  const [cursoUfcdId, setCursoUfcdId] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFim, setHoraFim] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [removerDisp, setRemoverDisp] = useState(true);
  const [saving, setSaving] = useState(false);

  // UFCDs onde o formador está atribuído, com horas em falta.
  const opcoes = useQuery({
    queryKey: ["ufcds-do-formador-conv", slot?.formador_id],
    enabled: !!slot,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("curso_ufcd_formadores")
        .select("curso_ufcd:curso_ufcds(id, horas_totais, concluida, ufcd:ufcds(codigo, designacao), curso:cursos(id, codigo, nome, estado))")
        .eq("formador_id", slot!.formador_id);
      if (error) throw error;
      const cus = (data ?? [])
        .map((r: any) => r.curso_ufcd)
        .filter((cu: any) => cu && cu.curso && !cu.concluida);
      if (cus.length === 0) return [];
      const ids = cus.map((cu: any) => cu.id);
      const { data: sess } = await supabase
        .from("sessoes")
        .select("curso_ufcd_id, horas")
        .in("curso_ufcd_id", ids);
      const dadas = new Map<string, number>();
      (sess ?? []).forEach((s: any) => {
        dadas.set(s.curso_ufcd_id, (dadas.get(s.curso_ufcd_id) ?? 0) + Number(s.horas ?? 0));
      });
      return cus
        .map((cu: any) => {
          const dadasH = dadas.get(cu.id) ?? 0;
          const faltam = Math.max(0, Number(cu.horas_totais ?? 0) - dadasH);
          return { ...cu, horas_dadas: dadasH, horas_faltam: faltam };
        })
        .filter((cu: any) => cu.horas_faltam > 0)
        .sort((a: any, b: any) => compareUfcdCodigo(a.ufcd?.codigo ?? "", b.ufcd?.codigo ?? ""));
    },
  });

  // Cursos distintos a partir das opções
  const cursosDisponiveis = useMemo(() => {
    const m = new Map<string, { id: string; codigo: string; nome: string }>();
    (opcoes.data ?? []).forEach((cu: any) => {
      if (!m.has(cu.curso.id)) m.set(cu.curso.id, { id: cu.curso.id, codigo: cu.curso.codigo, nome: cu.curso.nome });
    });
    return Array.from(m.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [opcoes.data]);

  const opcoesFiltradas = useMemo(() => {
    if (!cursoId) return [];
    return (opcoes.data ?? []).filter((cu: any) => cu.curso.id === cursoId);
  }, [opcoes.data, cursoId]);

  // reset on open
  useMemo(() => {
    if (slot) {
      setHoraInicio(slot.hora_inicio?.slice(0, 5) ?? "");
      setHoraFim(slot.hora_fim?.slice(0, 5) ?? "");
      setCursoId(slot.curso_id ?? "");
      setCursoUfcdId("");
      setObservacoes("");
      setRemoverDisp(true);
    }
  }, [slot?.id]);

  // Quando há apenas um curso disponível, pré-selecionar
  useMemo(() => {
    if (!cursoId && cursosDisponiveis.length === 1) setCursoId(cursosDisponiveis[0].id);
  }, [cursosDisponiveis, cursoId]);

  async function criar() {
    if (!slot) return;
    if (!cursoId) return toast.error("Escolhe o curso");
    if (!cursoUfcdId) return toast.error("Escolhe a UFCD");
    if (!horaInicio || !horaFim || horaFim <= horaInicio) return toast.error("Horário inválido");

    const cu = (opcoes.data ?? []).find((x: any) => x.id === cursoUfcdId) as any;
    if (!cu) return toast.error("UFCD inválida");

    // Conflito com sessão já agendada noutro curso à mesma hora
    const hiFull = horaInicio.length === 5 ? horaInicio + ":00" : horaInicio;
    const hfFull = horaFim.length === 5 ? horaFim + ":00" : horaFim;
    const { data: sess } = await supabase
      .from("sessoes")
      .select("hora_inicio, hora_fim, curso:cursos(codigo, nome)")
      .eq("formador_id", slot.formador_id)
      .eq("data", slot.data);
    const choque = ((sess ?? []) as any[]).find((s) => !(hfFull <= s.hora_inicio || hiFull >= s.hora_fim));
    if (choque) {
      return toast.error("Formador já tem sessão neste horário", {
        description: `${choque.curso?.codigo ?? ""} ${choque.curso?.nome ?? ""} (${String(choque.hora_inicio).slice(0,5)}–${String(choque.hora_fim).slice(0,5)}).`,
      });
    }

    setSaving(true);
    const horas = diffHoras(horaInicio, horaFim);
    const { error } = await supabase.from("sessoes").insert({
      curso_id: cu.curso.id,
      curso_ufcd_id: cursoUfcdId,
      formador_id: slot.formador_id,
      data: slot.data,
      hora_inicio: horaInicio,
      hora_fim: horaFim,
      horas,
      observacoes: observacoes || null,
    } as never);
    if (error) { setSaving(false); return toast.error(error.message); }

    if (removerDisp) {
      await supabase.from("formador_disponibilidades" as any).delete().eq("id", slot.id);
    }
    setSaving(false);
    toast.success("Sessão criada a partir da disponibilidade");
    qc.invalidateQueries({ queryKey: ["sessoes-geral"] });
    qc.invalidateQueries({ queryKey: ["disp-geral"] });
    qc.invalidateQueries({ queryKey: ["sessoes"] });
    qc.invalidateQueries({ queryKey: ["disponibilidades", slot.formador_id] });
    onClose();
  }

  const open = !!slot;
  const cursoLocked = !!slot?.curso_id;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarPlus className="size-4" /> Criar sessão a partir de disponibilidade</DialogTitle>
        </DialogHeader>
        {slot && (
          <div className="space-y-3">
            <div className="text-sm bg-muted/40 rounded-md px-3 py-2">
              <div><span className="text-muted-foreground">Formador:</span> <span className="font-medium">{slot.formador_nome}</span></div>
              <div><span className="text-muted-foreground">Data:</span> <span className="font-medium">{fmtDate(slot.data)}</span></div>
              <div><span className="text-muted-foreground">Janela:</span> <span className="font-medium">{slot.hora_inicio?.slice(0,5)}–{slot.hora_fim?.slice(0,5)}</span></div>
              {slot.notas && <div className="text-xs text-muted-foreground mt-1">"{slot.notas}"</div>}
            </div>

            <div className="space-y-1.5">
              <Label>Curso *</Label>
              <Select value={cursoId} onValueChange={(v) => { setCursoId(v); setCursoUfcdId(""); }} disabled={cursoLocked}>
                <SelectTrigger><SelectValue placeholder={cursosDisponiveis.length === 0 ? "Sem cursos com UFCDs por concluir" : "Escolher…"} /></SelectTrigger>
                <SelectContent>
                  {cursosDisponiveis.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.codigo} — {c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cursoLocked && <div className="text-xs text-muted-foreground">Curso definido na disponibilidade.</div>}
            </div>

            <div className="space-y-1.5">
              <Label>UFCD *</Label>
              <Select value={cursoUfcdId} onValueChange={setCursoUfcdId} disabled={!cursoId}>
                <SelectTrigger><SelectValue placeholder={!cursoId ? "Escolhe primeiro o curso" : (opcoesFiltradas.length === 0 ? "Sem UFCDs por concluir neste curso" : "Escolher…")} /></SelectTrigger>
                <SelectContent>
                  {opcoesFiltradas.map((cu: any) => (
                    <SelectItem key={cu.id} value={cu.id}>
                      {cu.ufcd?.codigo} — {cu.ufcd?.designacao} (faltam {cu.horas_faltam}h de {cu.horas_totais}h)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Início *</Label><Input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Fim *</Label><Input type="time" value={horaFim} onChange={e => setHoraFim(e.target.value)} /></div>
            </div>

            <div className="space-y-1.5"><Label>Observações</Label><Input value={observacoes} onChange={e => setObservacoes(e.target.value)} /></div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={removerDisp} onChange={e => setRemoverDisp(e.target.checked)} />
              Remover esta disponibilidade após criar a sessão
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={criar} disabled={saving || !cursoUfcdId}>{saving ? "A criar…" : "Criar sessão"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}





function CreateDispDialog({
  data,
  formadores,
  defaultFormadorId,
  editing,
  onClose,
}: {
  data: string | null;
  formadores: any[];
  defaultFormadorId: string | null;
  editing?: DispSlot | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!editing;
  const [formadorId, setFormadorId] = useState<string>("");
  const [tipo, setTipo] = useState<"disponivel" | "indisponivel">("disponivel");
  const [horaInicio, setHoraInicio] = useState("09:00");
  const [horaFim, setHoraFim] = useState("13:00");
  const [cursoId, setCursoId] = useState<string>("");
  const [notas, setNotas] = useState("");
  const [periodo, setPeriodo] = useState<"manha" | "tarde" | "dia" | "custom">("custom");
  const [dataEdit, setDataEdit] = useState<string>("");

  const [saving, setSaving] = useState(false);

  function aplicarPeriodo(p: "manha" | "tarde" | "dia" | "custom") {
    setPeriodo(p);
    if (p === "manha") { setHoraInicio("09:00"); setHoraFim("13:00"); }
    else if (p === "tarde") { setHoraInicio("14:00"); setHoraFim("17:00"); }
    else if (p === "dia") { setHoraInicio("09:00"); setHoraFim("17:00"); }
  }

  useMemo(() => {
    if (editing) {
      setFormadorId(editing.formador_id);
      setTipo(editing.tipo);
      setHoraInicio(editing.hora_inicio?.slice(0, 5) ?? "09:00");
      setHoraFim(editing.hora_fim?.slice(0, 5) ?? "13:00");
      setCursoId(editing.curso_id ?? "");
      setNotas(editing.notas ?? "");
      setPeriodo("custom");
      setDataEdit(editing.data ?? data ?? "");
    } else if (data) {
      setFormadorId(defaultFormadorId ?? "");
      setTipo("disponivel");
      setHoraInicio("09:00");
      setHoraFim("13:00");
      setCursoId("");
      setNotas("");
      setPeriodo("custom");
      setDataEdit(data);
    }
  }, [data, editing?.id]);




  // Cursos onde este formador tem UFCDs atribuídas e ainda por concluir
  const cursosDoFormador = useQuery({
    queryKey: ["cursos-formador-disp", formadorId],
    enabled: !!formadorId,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("curso_ufcd_formadores")
        .select("curso_ufcd:curso_ufcds(id, horas_totais, concluida, curso:cursos(id, codigo, nome, estado))")
        .eq("formador_id", formadorId);
      if (error) throw error;
      const map = new Map<string, { id: string; codigo: string; nome: string; estado: string; ufcds_abertas: number }>();
      (rows ?? []).forEach((r: any) => {
        const cu = r.curso_ufcd;
        if (!cu || !cu.curso || cu.concluida) return;
        const c = cu.curso;
        const cur = map.get(c.id) ?? { id: c.id, codigo: c.codigo, nome: c.nome, estado: c.estado, ufcds_abertas: 0 };
        cur.ufcds_abertas += 1;
        map.set(c.id, cur);
      });
      return Array.from(map.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
    },
  });

  async function criar() {
    if (!dataEdit) return toast.error("Escolhe a data");
    if (!formadorId) return toast.error("Escolhe o formador");
    const hi = horaInicio;
    const hf = horaFim;

    if (!hi || !hf || hf <= hi) return toast.error("Horário inválido");

    // Conflito com sessão já agendada (qualquer curso) à mesma hora
    if (tipo === "disponivel") {
      const { data: sess } = await supabase
        .from("sessoes")
        .select("hora_inicio, hora_fim, curso:cursos(codigo, nome)")
        .eq("formador_id", formadorId)
        .eq("data", dataEdit);
      const hiFull = hi.length === 5 ? hi + ":00" : hi;
      const hfFull = hf.length === 5 ? hf + ":00" : hf;
      const choque = ((sess ?? []) as any[]).find((s) => !(hfFull <= s.hora_inicio || hiFull >= s.hora_fim));
      if (choque) {
        return toast.error("Formador já tem sessão neste horário", {
          description: `${choque.curso?.codigo ?? ""} ${choque.curso?.nome ?? ""} (${String(choque.hora_inicio).slice(0,5)}–${String(choque.hora_fim).slice(0,5)}).`,
        });
      }
    }

    setSaving(true);
    const payload = {
      formador_id: formadorId,
      data: dataEdit,
      hora_inicio: hi,
      hora_fim: hf,
      tipo,
      notas: notas.trim() || null,
      curso_id: cursoId || null,
    };
    const { error } = isEdit
      ? await supabase.from("formador_disponibilidades" as any).update(payload as never).eq("id", editing!.id)
      : await supabase.from("formador_disponibilidades" as any).insert(payload as never);


    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(isEdit ? "Disponibilidade atualizada" : "Disponibilidade lançada");
    qc.invalidateQueries({ queryKey: ["disp-geral"] });
    qc.invalidateQueries({ queryKey: ["disponibilidades", formadorId] });
    onClose();
  }

  const open = !!data;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarPlus className="size-4" /> {isEdit ? "Editar disponibilidade" : "Lançar disponibilidade"}</DialogTitle>
        </DialogHeader>
        {data && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Data *</Label>
              <Input type="date" value={dataEdit} onChange={e => setDataEdit(e.target.value)} />
            </div>


            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Formador *</Label>
                <Select value={formadorId} onValueChange={setFormadorId}>
                  <SelectTrigger><SelectValue placeholder="Escolher…" /></SelectTrigger>
                  <SelectContent>
                    {formadores.map((f: any) => (
                      <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disponivel">Disponível</SelectItem>
                    <SelectItem value="indisponivel">Indisponível</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Período</Label>
              <div className="flex gap-2 flex-wrap">
                <Button type="button" size="sm" variant={periodo === "manha" ? "default" : "outline"} onClick={() => aplicarPeriodo("manha")}>Manhã (09:00–13:00)</Button>
                <Button type="button" size="sm" variant={periodo === "tarde" ? "default" : "outline"} onClick={() => aplicarPeriodo("tarde")}>Tarde (14:00–17:00)</Button>
                <Button type="button" size="sm" variant={periodo === "dia" ? "default" : "outline"} onClick={() => aplicarPeriodo("dia")}>Dia todo (09:00–17:00)</Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Início *</Label><Input type="time" value={horaInicio} onChange={e => { setHoraInicio(e.target.value); setPeriodo("custom"); }} /></div>
              <div className="space-y-1.5"><Label>Fim *</Label><Input type="time" value={horaFim} onChange={e => { setHoraFim(e.target.value); setPeriodo("custom"); }} /></div>
            </div>



            {formadorId && (
              <div className="space-y-1.5">
                <Label>Curso (opcional)</Label>
                <Select value={cursoId || "_none"} onValueChange={(v) => setCursoId(v === "_none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={cursosDoFormador.data?.length === 0 ? "Sem cursos com UFCDs por concluir" : "Escolher…"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Nenhum —</SelectItem>
                    {(cursosDoFormador.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.codigo} — {c.nome} ({c.ufcds_abertas} UFCD{c.ufcds_abertas === 1 ? "" : "s"} por concluir)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground">A UFCD é escolhida depois, ao converter a disponibilidade em sessão.</div>
              </div>
            )}

            <div className="space-y-1.5"><Label>Notas</Label><Input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" /></div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={criar} disabled={saving || !formadorId}>{saving ? "A guardar…" : (isEdit ? "Guardar" : "Lançar")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeriasDialog({ open, onClose, cursos, defaultCursoId }: {
  open: boolean;
  onClose: () => void;
  cursos: any[];
  defaultCursoId: string | null;
}) {
  const qc = useQueryClient();
  const [cursoId, setCursoId] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [motivo, setMotivo] = useState("Férias");
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const lista = useQuery({
    queryKey: ["curso-ferias-list", cursoId],
    enabled: open && !!cursoId,
    queryFn: async () => {
      const { data, error } = await supabase.from("curso_ferias" as any)
        .select("id, data_inicio, data_fim, motivo")
        .eq("curso_id", cursoId)
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  useEffect(() => {
    if (open) {
      setCursoId(defaultCursoId ?? "");
      reset();
    }
  }, [open, defaultCursoId]);

  function reset() {
    setDataInicio("");
    setDataFim("");
    setMotivo("Férias");
    setEditId(null);
  }

  function editar(f: any) {
    setEditId(f.id);
    setDataInicio(f.data_inicio);
    setDataFim(f.data_fim);
    setMotivo(f.motivo ?? "Férias");
  }

  async function apagar(id: string) {
    if (!confirm("Apagar este período de férias?")) return;
    const { error } = await supabase.from("curso_ferias" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Férias apagadas");
    qc.invalidateQueries({ queryKey: ["curso-ferias-list", cursoId] });
    qc.invalidateQueries({ queryKey: ["curso-ferias-all"] });
    qc.invalidateQueries({ queryKey: ["curso-ferias", cursoId] });
  }

  async function guardar() {
    if (!cursoId) return toast.error("Escolhe o curso");
    if (!dataInicio || !dataFim) return toast.error("Datas obrigatórias");
    if (dataFim < dataInicio) return toast.error("Data fim anterior ao início");
    setSaving(true);
    const payload = {
      curso_id: cursoId,
      data_inicio: dataInicio,
      data_fim: dataFim,
      motivo: motivo.trim() || "Férias",
    };
    const { error } = editId
      ? await supabase.from("curso_ferias" as any).update(payload).eq("id", editId)
      : await supabase.from("curso_ferias" as any).insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editId ? "Férias atualizadas" : "Férias registadas");
    qc.invalidateQueries({ queryKey: ["curso-ferias-list", cursoId] });
    qc.invalidateQueries({ queryKey: ["curso-ferias-all"] });
    qc.invalidateQueries({ queryKey: ["curso-ferias", cursoId] });
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Palmtree className="size-4" /> Férias do curso</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Curso *</Label>
            <Select value={cursoId} onValueChange={(v) => { setCursoId(v); reset(); }}>
              <SelectTrigger><SelectValue placeholder="Escolher…" /></SelectTrigger>
              <SelectContent>
                {cursos.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.codigo} — {c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Início *</Label><Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Fim *</Label><Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Férias" />
          </div>
          <div className="flex justify-end gap-2">
            {editId && <Button variant="ghost" size="sm" onClick={reset}>Cancelar edição</Button>}
            <Button size="sm" onClick={guardar} disabled={saving || !cursoId}>{saving ? "A guardar…" : (editId ? "Atualizar" : "Lançar")}</Button>
          </div>

          {cursoId && (
            <div className="border-t pt-3">
              <div className="text-xs font-semibold text-muted-foreground mb-2">Períodos registados</div>
              {(lista.data ?? []).length === 0 ? (
                <div className="text-xs text-muted-foreground italic">Sem férias registadas.</div>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {(lista.data ?? []).map((f: any) => (
                    <div key={f.id} className="flex items-center justify-between gap-2 text-xs border rounded px-2 py-1.5">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium tabular-nums">{fmtDate(f.data_inicio)} → {fmtDate(f.data_fim)}</div>
                        <div className="text-muted-foreground truncate">{f.motivo || "Férias"}</div>
                      </div>
                      <button onClick={() => editar(f)} className="text-sky-600 hover:underline">Editar</button>
                      <button onClick={() => apagar(f.id)} className="text-rose-600 hover:underline">Apagar</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ObservacoesPanel({ mes, cursos, obs, onSaved }: {
  mes: string;
  cursos: { id: string; codigo: string; nome: string }[];
  obs: any[];
  onSaved: () => void;
}) {
  if (cursos.length === 0) return null;
  const obsByCurso = useMemo(() => new Map(obs.map((o: any) => [o.curso_id, o.texto ?? ""])), [obs]);
  return (
    <div className={"grid gap-3 " + (cursos.length > 1 ? "md:grid-cols-2" : "grid-cols-1")}>
      {cursos.map(c => {
        return (
          <ObservacaoCard key={c.id} curso={c} mes={mes} initial={obsByCurso.get(c.id) ?? ""} onSaved={onSaved} />
        );
      })}
    </div>
  );
}

function ObservacaoCard({ curso, mes, initial, onSaved }: {
  curso: { id: string; codigo: string; nome: string };
  mes: string;
  initial: string;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (ref.current && document.activeElement !== ref.current) ref.current.value = initial; }, [initial, curso.id, mes]);

  const guardar = async () => {
    const valor = ref.current?.value ?? "";
    if (valor === initial) return;
    setSaving(true);
    const { error } = await supabase
      .from("cronograma_observacoes" as any)
      .upsert({ curso_id: curso.id, mes, texto: valor }, { onConflict: "curso_id,mes" });
    setSaving(false);
    if (error) { toast.error("Erro ao guardar observação"); return; }
    toast.success("Observação guardada");
    onSaved();
  };

  return (
    <div className="border rounded-md bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium truncate">
          <span className="text-muted-foreground">{curso.codigo}</span> — {curso.nome}
        </div>
        {saving && <span className="text-[10px] text-muted-foreground">a guardar…</span>}
      </div>
      <Textarea
        ref={ref}
        defaultValue={initial}
        onBlur={guardar}
        placeholder="Observações deste mês (ex.: formador X disponível o mês todo)…"
        rows={3}
        className="text-sm resize-y"
      />
    </div>
  );
}
