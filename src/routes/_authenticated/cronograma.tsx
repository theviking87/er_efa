import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, CalendarPlus, Printer } from "lucide-react";
import { MONTH_NAMES, fmtDate, fmtHoras, diffHoras, dateOnlyIso, weekdayFromIso } from "@/lib/format";
import { toast } from "sonner";

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
  const [mostrar, setMostrar] = useState<"ambos" | "sessoes" | "disp">("ambos");
  const [convertSlot, setConvertSlot] = useState<DispSlot | null>(null);
  const [createDate, setCreateDate] = useState<string | null>(null);

  useEffect(() => {
    const ch = supabase
      .channel("cronograma-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "cursos" }, () => qc.invalidateQueries({ queryKey: ["cursos-ativos-mes"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "curso_ufcds" }, () => qc.invalidateQueries({ queryKey: ["cursos-ativos-mes"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "curso_ufcd_formadores" }, () => qc.invalidateQueries({ queryKey: ["cursos-ativos-mes"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "formador_disponibilidades" }, () => { qc.invalidateQueries({ queryKey: ["disp-geral"] }); })
      .on("postgres_changes", { event: "*", schema: "public", table: "sessoes" }, () => { qc.invalidateQueries({ queryKey: ["sessoes-geral"] }); })
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
    enabled: isProximoMes,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cursos")
        .select("id, codigo, nome, data_inicio, data_fim, estado, curso_ufcds(curso_ufcd_formadores(formador_id))")
        .eq("estado", "ativo")
        .lte("data_inicio", fimMes)
        .or(`data_fim.gte.${inicioMes},data_fim.is.null`);
      if (error) throw error;
      return (data ?? []).map((c: any) => ({
        id: c.id,
        codigo: c.codigo,
        nome: c.nome,
        formadores: Array.from(new Set(
          (c.curso_ufcds ?? []).flatMap((cu: any) => (cu.curso_ufcd_formadores ?? []).map((f: any) => f.formador_id))
        )) as string[],
      }));
    },
  });

  const formadores = useQuery({
    queryKey: ["formadores-todos"],
    queryFn: async () => (await supabase.from("formadores").select("id, nome, cor").order("nome")).data ?? [],
  });

  const sessoes = useQuery({
    queryKey: ["sessoes-geral", inicioMes, fimMes, formadorFiltro],
    queryFn: async () => {
      let q = supabase.from("sessoes")
        .select("id, data, hora_inicio, hora_fim, horas, formador_id, formador:formadores(id,nome,abreviatura,cor), curso:cursos(id,nome,codigo), curso_ufcd:curso_ufcds(id, ufcd:ufcds(codigo, designacao))")
        .gte("data", inicioMes).lte("data", fimMes)
        .order("data").order("hora_inicio");
      if (formadorFiltro) q = q.eq("formador_id", formadorFiltro);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const disp = useQuery({
    queryKey: ["disp-geral", inicioMes, fimMes, formadorFiltro],
    queryFn: async () => {
      let q = supabase.from("formador_disponibilidades" as any)
        .select("id, formador_id, data, hora_inicio, hora_fim, tipo, notas, formador:formadores(id,nome,abreviatura,cor)")
        .gte("data", inicioMes).lte("data", fimMes)
        .order("data").order("hora_inicio");
      if (formadorFiltro) q = q.eq("formador_id", formadorFiltro);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

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
      (disp.data ?? []).forEach((d: any) => {
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
        };
        const arr = m.get(d.data) ?? [];
        arr.push(slot); m.set(d.data, arr);
      });
    }
    // sort each day by hora_inicio
    for (const arr of m.values()) arr.sort((a, b) => (a.hora_inicio ?? "").localeCompare(b.hora_inicio ?? ""));
    return m;
  }, [sessoes.data, disp.data, mostrar]);

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

  // Map data -> set de formador_ids com disponibilidade nesse dia (apenas tipo 'disponivel')
  const dispByDay = useMemo(() => {
    const m = new Map<string, Set<string>>();
    (disp.data ?? []).forEach((d: any) => {
      if (d.tipo !== "disponivel") return;
      const s = m.get(d.data) ?? new Set<string>();
      s.add(d.formador_id);
      m.set(d.data, s);
    });
    return m;
  }, [disp.data]);

  const PALETA = ["#fde68a", "#bbf7d0", "#fbcfe8", "#bfdbfe", "#ddd6fe", "#fed7aa", "#a7f3d0", "#fecaca"];
  const cursosComCor = useMemo(() => {
    return (cursosAtivos.data ?? []).map((c, i) => ({ ...c, cor: PALETA[i % PALETA.length] }));
  }, [cursosAtivos.data]);

  // Para cada dia: lista de cursos ativos sem qualquer formador disponível
  const dayMissing = useMemo(() => {
    const r = new Map<string, { todos: boolean; cursos: { id: string; codigo: string; cor: string }[] }>();
    if (!isProximoMes) return r;
    const cursos = cursosComCor;
    if (cursos.length === 0) return r;
    for (const cell of grid) {
      if (!cell) continue;
      const dow = weekdayFromIso(cell.iso);
      if (dow === 0 || dow === 6) continue;
      const dispSet = dispByDay.get(cell.iso) ?? new Set<string>();
      const semDisp = cursos.filter(c => c.formadores.length === 0 || !c.formadores.some(f => dispSet.has(f)));
      if (semDisp.length === 0) continue;
      r.set(cell.iso, {
        todos: semDisp.length === cursos.length,
        cursos: semDisp.map(c => ({ id: c.id, codigo: c.codigo, cor: c.cor })),
      });
    }
    return r;
  }, [isProximoMes, cursosComCor, dispByDay, grid]);

  const totalSessoes = (sessoes.data ?? []).length;
  const totalHoras = (sessoes.data ?? []).reduce((acc, s: any) => acc + Number(s.horas), 0);
  const totalDisp = (disp.data ?? []).filter((d: any) => d.tipo === "disponivel").length;

  function prev() { setMes(m => m.mes === 0 ? { ano: m.ano - 1, mes: 11 } : { ano: m.ano, mes: m.mes - 1 }); }
  function next() { setMes(m => m.mes === 11 ? { ano: m.ano + 1, mes: 0 } : { ano: m.ano, mes: m.mes + 1 }); }
  function hoje() { const d = new Date(); setMes({ ano: d.getFullYear(), mes: d.getMonth() }); }

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
            <div className="text-xs text-muted-foreground">
              {totalSessoes} sessões · {fmtHoras(totalHoras)} · {totalDisp} dispon.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-foreground" /> Sessão</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm border-2 border-emerald-500 border-dashed" /> Disponível</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm border-2 border-rose-500 border-dashed" /> Indisponível</span>
          {isProximoMes && cursosComCor.length > 0 && (
            <>
              <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-red-500" /> Nenhum curso com disponibilidade</span>
              {cursosComCor.map(c => (
                <span key={c.id} className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-sm" style={{ background: c.cor }} /> {c.codigo} sem disponibilidade
                </span>
              ))}
            </>
          )}
        </div>

        <div className="border rounded-md overflow-hidden bg-card">
          <div className="grid grid-cols-7 bg-muted/40 text-xs uppercase text-muted-foreground">
            {["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map(d => <div key={d} className="px-2 py-1.5 text-center font-medium">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 auto-rows-[minmax(130px,auto)]">
            {grid.map((cell, i) => {
              const miss = cell ? dayMissing.get(cell.iso) : undefined;
              let bgStyle: React.CSSProperties | undefined;
              if (miss) {
                if (miss.todos) {
                  bgStyle = { background: "rgba(239,68,68,0.35)" };
                } else {
                  const n = miss.cursos.length;
                  const stops = miss.cursos.map((c, idx) => {
                    const a = (idx * 100) / n;
                    const b = ((idx + 1) * 100) / n;
                    return `${c.cor} ${a}%, ${c.cor} ${b}%`;
                  }).join(", ");
                  bgStyle = { background: `linear-gradient(135deg, ${stops})` };
                }
              }
              const title = miss ? (miss.todos ? "Nenhum curso ativo tem formador disponível" : "Sem disponibilidade: " + miss.cursos.map(c => c.codigo).join(", ")) : undefined;
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
                {cell && (
                  <>
                    <div className="text-xs text-muted-foreground mb-1">{cell.d}</div>
                    <div className="space-y-1">
                      {(slotsByDay.get(cell.iso) ?? []).map((slot) => {
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
                        return (
                          <button
                            key={"d" + slot.id}
                            onClick={(e) => { e.stopPropagation(); if (isDisp) setConvertSlot(slot); }}
                            disabled={!isDisp}
                            className={"block w-full text-left text-[11px] leading-tight rounded px-1.5 py-1 border-2 border-dashed transition " +
                              (isDisp ? "hover:bg-emerald-50 cursor-pointer" : "cursor-not-allowed opacity-80")}
                            style={{
                              borderColor: isDisp ? "rgb(16,185,129)" : "rgb(244,63,94)",
                              color: slot.formador_cor,
                            }}
                            title={`${isDisp ? "Disponível" : "Indisponível"} — ${slot.formador_nome}${slot.notas ? "\n" + slot.notas : ""}${isDisp ? "\n\nClicar para criar sessão" : ""}`}
                          >
                            <div className="font-medium">{slot.hora_inicio?.slice(0,5)}–{slot.hora_fim?.slice(0,5)}</div>
                            <div className="truncate font-medium">{slot.formador_nome}</div>
                            <div className="truncate opacity-80">{isDisp ? "Disponível" : "Indisponível"}</div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
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
      <CreateDispDialog
        data={createDate}
        formadores={(formadores.data ?? []) as any[]}
        defaultFormadorId={formadorFiltro || null}
        onClose={() => setCreateDate(null)}
      />
    </PageContainer>
  );
}

function ConvertDispDialog({ slot, onClose }: { slot: DispSlot | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [cursoUfcdId, setCursoUfcdId] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFim, setHoraFim] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [removerDisp, setRemoverDisp] = useState(true);
  const [saving, setSaving] = useState(false);

  // UFCD onde este formador está atribuído
  const opcoes = useQuery({
    queryKey: ["ufcds-do-formador", slot?.formador_id],
    enabled: !!slot,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("curso_ufcd_formadores")
        .select("curso_ufcd:curso_ufcds(id, ufcd:ufcds(codigo, designacao), curso:cursos(id, codigo, nome, estado))")
        .eq("formador_id", slot!.formador_id);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.curso_ufcd).filter((x: any) => x && x.curso);
    },
  });

  // reset on open
  useMemo(() => {
    if (slot) {
      setHoraInicio(slot.hora_inicio?.slice(0, 5) ?? "");
      setHoraFim(slot.hora_fim?.slice(0, 5) ?? "");
      setCursoUfcdId("");
      setObservacoes("");
      setRemoverDisp(true);
    }
  }, [slot?.id]);

  async function criar() {
    if (!slot) return;
    if (!cursoUfcdId) return toast.error("Escolhe a UFCD");
    if (!horaInicio || !horaFim || horaFim <= horaInicio) return toast.error("Horário inválido");

    const cu = (opcoes.data ?? []).find((x: any) => x.id === cursoUfcdId) as any;
    if (!cu) return toast.error("UFCD inválida");

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
              {slot.notas && <div className="text-xs text-muted-foreground mt-1">“{slot.notas}”</div>}
            </div>

            <div className="space-y-1.5">
              <Label>UFCD / Curso *</Label>
              <Select value={cursoUfcdId} onValueChange={setCursoUfcdId}>
                <SelectTrigger><SelectValue placeholder={opcoes.data?.length === 0 ? "Sem UFCD atribuídas a este formador" : "Escolher…"} /></SelectTrigger>
                <SelectContent>
                  {(opcoes.data ?? []).map((cu: any) => (
                    <SelectItem key={cu.id} value={cu.id}>
                      {cu.curso?.codigo} · {cu.ufcd?.codigo} — {cu.ufcd?.designacao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {opcoes.data?.length === 0 && (
                <div className="text-xs text-muted-foreground">Atribui primeiro este formador a uma UFCD num curso.</div>
              )}
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


function CreateDispDialog({
  data,
  formadores,
  defaultFormadorId,
  onClose,
}: {
  data: string | null;
  formadores: any[];
  defaultFormadorId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [formadorId, setFormadorId] = useState<string>("");
  const [tipo, setTipo] = useState<"disponivel" | "indisponivel">("disponivel");
  const [horaInicio, setHoraInicio] = useState("09:00");
  const [horaFim, setHoraFim] = useState("13:00");
  const [cursoUfcdId, setCursoUfcdId] = useState<string>("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (data) {
      setFormadorId(defaultFormadorId ?? "");
      setTipo("disponivel");
      setHoraInicio("09:00");
      setHoraFim("13:00");
      setCursoUfcdId("");
      setNotas("");
    }
  }, [data]);

  // UFCDs atribuídas ao formador, não concluídas, com horas dadas vs totais
  const ufcdsAtribuidas = useQuery({
    queryKey: ["ufcds-formador-disp", formadorId],
    enabled: !!formadorId,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("curso_ufcd_formadores")
        .select("curso_ufcd:curso_ufcds(id, horas_totais, concluida, ufcd:ufcds(codigo, designacao), curso:cursos(id, codigo, nome, estado, data_inicio, data_fim))")
        .eq("formador_id", formadorId);
      if (error) throw error;
      const cus = (rows ?? [])
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
      return cus.map((cu: any) => {
        const dadasH = dadas.get(cu.id) ?? 0;
        const faltam = Math.max(0, Number(cu.horas_totais ?? 0) - dadasH);
        return { ...cu, horas_dadas: dadasH, horas_faltam: faltam };
      });
    },
  });

  async function criar() {
    if (!data) return;
    if (!formadorId) return toast.error("Escolhe o formador");
    if (!horaInicio || !horaFim || horaFim <= horaInicio) return toast.error("Horário inválido");

    setSaving(true);
    let notasFinais = notas.trim();
    if (cursoUfcdId) {
      const cu = (ufcdsAtribuidas.data ?? []).find((x: any) => x.id === cursoUfcdId) as any;
      if (cu) {
        const ctx = `${cu.curso.codigo} · ${cu.ufcd.codigo} (faltam ${cu.horas_faltam}h)`;
        notasFinais = notasFinais ? `${ctx} — ${notasFinais}` : ctx;
      }
    }

    const { error } = await supabase.from("formador_disponibilidades" as any).insert({
      formador_id: formadorId,
      data,
      hora_inicio: horaInicio,
      hora_fim: horaFim,
      tipo,
      notas: notasFinais || null,
    } as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Disponibilidade lançada");
    qc.invalidateQueries({ queryKey: ["disp-geral"] });
    qc.invalidateQueries({ queryKey: ["disponibilidades", formadorId] });
    onClose();
  }

  const open = !!data;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarPlus className="size-4" /> Lançar disponibilidade</DialogTitle>
        </DialogHeader>
        {data && (
          <div className="space-y-3">
            <div className="text-sm bg-muted/40 rounded-md px-3 py-2">
              <span className="text-muted-foreground">Data:</span> <span className="font-medium">{fmtDate(data)}</span>
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Início *</Label><Input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Fim *</Label><Input type="time" value={horaFim} onChange={e => setHoraFim(e.target.value)} /></div>
            </div>

            {formadorId && (
              <div className="space-y-1.5">
                <Label>UFCD / Curso (opcional)</Label>
                <Select value={cursoUfcdId || "_none"} onValueChange={(v) => setCursoUfcdId(v === "_none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={ufcdsAtribuidas.data?.length === 0 ? "Sem UFCDs atribuídas em aberto" : "Escolher…"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Nenhuma —</SelectItem>
                    {(ufcdsAtribuidas.data ?? []).map((cu: any) => {
                      const ativo = cu.curso?.estado === "ativo";
                      return (
                        <SelectItem key={cu.id} value={cu.id}>
                          {cu.curso.codigo} · {cu.ufcd.codigo} — {ativo ? "a decorrer · " : ""}faltam {cu.horas_faltam}h de {cu.horas_totais}h
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground">Apenas UFCDs atribuídas a este formador e ainda não concluídas.</div>
              </div>
            )}

            <div className="space-y-1.5"><Label>Notas</Label><Input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" /></div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={criar} disabled={saving || !formadorId}>{saving ? "A guardar…" : "Lançar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
