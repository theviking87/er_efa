import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { MONTH_NAMES, fmtHoras } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/cronograma")({
  head: () => ({ meta: [{ title: "Cronograma Geral — Gestão Pedagógica" }] }),
  component: CronogramaGeral,
});

function CronogramaGeral() {
  const [mes, setMes] = useState(() => { const d = new Date(); return { ano: d.getFullYear(), mes: d.getMonth() }; });
  const [formadorFiltro, setFormadorFiltro] = useState<string>("");

  const inicioMes = new Date(mes.ano, mes.mes, 1).toISOString().slice(0, 10);
  const fimMes = new Date(mes.ano, mes.mes + 1, 0).toISOString().slice(0, 10);

  const formadores = useQuery({
    queryKey: ["formadores-todos"],
    queryFn: async () => (await supabase.from("formadores").select("id, nome, cor").order("nome")).data ?? [],
  });

  const sessoes = useQuery({
    queryKey: ["sessoes-geral", inicioMes, fimMes, formadorFiltro],
    queryFn: async () => {
      let q = supabase.from("sessoes")
        .select("id, data, hora_inicio, hora_fim, horas, formador:formadores(id,nome,cor), curso:cursos(id,nome,codigo), curso_ufcd:curso_ufcds(id, ufcd:ufcds(codigo, designacao))")
        .gte("data", inicioMes).lte("data", fimMes)
        .order("data").order("hora_inicio");
      if (formadorFiltro) q = q.eq("formador_id", formadorFiltro);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const sessoesByDay = useMemo(() => {
    const m = new Map<string, any[]>();
    (sessoes.data ?? []).forEach((s: any) => {
      const arr = m.get(s.data) ?? [];
      arr.push(s); m.set(s.data, arr);
    });
    return m;
  }, [sessoes.data]);

  const grid = useMemo(() => {
    const first = new Date(mes.ano, mes.mes, 1);
    const last = new Date(mes.ano, mes.mes + 1, 0);
    const startDow = (first.getDay() + 6) % 7;
    const days: ({ d: number; iso: string } | null)[] = [];
    for (let i = 0; i < startDow; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) {
      const iso = new Date(mes.ano, mes.mes, d).toISOString().slice(0, 10);
      days.push({ d, iso });
    }
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [mes]);

  const totalHoras = (sessoes.data ?? []).reduce((acc, s: any) => acc + Number(s.horas), 0);

  function prev() { setMes(m => m.mes === 0 ? { ano: m.ano - 1, mes: 11 } : { ano: m.ano, mes: m.mes - 1 }); }
  function next() { setMes(m => m.mes === 11 ? { ano: m.ano + 1, mes: 0 } : { ano: m.ano, mes: m.mes + 1 }); }
  function hoje() { const d = new Date(); setMes({ ano: d.getFullYear(), mes: d.getMonth() }); }

  return (
    <PageContainer>
      <PageHeader
        title="Cronograma Geral"
        description="Visão consolidada de todas as sessões. Útil para detetar conflitos entre cursos."
        actions={
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Imprimir
          </Button>
        }
      />

      <Card><CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prev}><ChevronLeft className="size-4" /></Button>
            <div className="font-semibold text-lg min-w-[170px] text-center">{MONTH_NAMES[mes.mes]} {mes.ano}</div>
            <Button variant="outline" size="icon" onClick={next}><ChevronRight className="size-4" /></Button>
            <Button variant="ghost" size="sm" onClick={hoje}>Hoje</Button>
          </div>
          <div className="flex items-center gap-3">
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
              {sessoes.data?.length ?? 0} sessões · {fmtHoras(totalHoras)}
            </div>
          </div>
        </div>

        <div className="border rounded-md overflow-hidden bg-card">
          <div className="grid grid-cols-7 bg-muted/40 text-xs uppercase text-muted-foreground">
            {["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map(d => <div key={d} className="px-2 py-1.5 text-center font-medium">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 auto-rows-[minmax(120px,auto)]">
            {grid.map((cell, i) => (
              <div key={i} className="border-t border-l border-border first:border-l-0 [&:nth-child(7n+1)]:border-l-0 p-1.5 min-h-[120px] bg-card">
                {cell && (
                  <>
                    <div className="text-xs text-muted-foreground mb-1">{cell.d}</div>
                    <div className="space-y-1">
                      {(sessoesByDay.get(cell.iso) ?? []).map((s: any) => (
                        <Link
                          key={s.id}
                          to="/cursos/$id"
                          params={{ id: s.curso.id }}
                          className="block text-[11px] leading-tight rounded px-1.5 py-1 hover:opacity-80 transition"
                          style={{ background: `${s.formador?.cor}15`, color: s.formador?.cor, borderLeft: `2px solid ${s.formador?.cor}` }}
                          title={`${s.curso?.codigo} — ${s.curso?.nome}\n${s.curso_ufcd?.ufcd?.codigo} ${s.curso_ufcd?.ufcd?.designacao}\n${s.formador?.nome}`}
                        >
                          <div className="font-medium">{s.hora_inicio?.slice(0,5)}–{s.hora_fim?.slice(0,5)}</div>
                          <div className="truncate font-medium">{s.curso?.codigo}</div>
                          <div className="truncate opacity-80">{s.formador?.nome}</div>
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent></Card>
    </PageContainer>
  );
}
