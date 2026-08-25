import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useProjetoAtivo } from "@/lib/projeto-context";
import { NotasPainel } from "@/components/notas-painel";

export const Route = createFileRoute("/_authenticated/financeiro/formadores/")({
  head: () => ({ meta: [{ title: "Financeiro — Processamentos Formadores" }] }),
  component: ProcFormadoresPage,
});

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function ProcFormadoresPage() {
  const { projetoId } = useProjetoAtivo();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const q = useQuery({
    queryKey: ["fin-procs-formadores", projetoId],
    queryFn: async () => {
      let query = supabase.from("fin_processamento")
        .select("id, ano, mes, estado, curso_id, curso:curso_id(id, codigo, nome)")
        .order("ano", { ascending: false }).order("mes", { ascending: false });
      if (projetoId && projetoId !== "all") query = query.eq("projeto_id", projetoId);
      const { data } = await query;
      const procs = (data ?? []) as any[];
      if (!procs.length) return [];
      const { data: linhas } = await supabase.from("fin_processamento_linha")
        .select("processamento_id, rubrica, valor, formador_id, memoria_calculo, formador:formador_id(retencao_percentagem, iva_percentagem)")
        .in("processamento_id", procs.map(p => p.id));
      const totais = new Map<string, { hn: number; out: number; doc: number; ret: number }>();
      ((linhas ?? []) as any[]).forEach(l => {
        const t = totais.get(l.processamento_id) ?? { hn: 0, out: 0, doc: 0, ret: 0 };
        if (l.rubrica === "HN") {
          const base = Number(l.valor ?? 0);
          const f: any = l.formador ?? {};
          const mc: any = l.memoria_calculo ?? {};
          const ivaPct = mc.aplica_iva === true ? Number(mc.iva_pct ?? f.iva_percentagem ?? 23) : 0;
          const seloPct = mc.aplica_selo === true ? Number(mc.selo_pct ?? 4) : 0;
          const retPct = mc.aplica_retencao === true ? Number(mc.retencao_pct ?? f.retencao_percentagem ?? 23) : 0;
          t.hn += base;
          t.doc += base + base * ivaPct / 100 + base * seloPct / 100;
          t.ret += base * retPct / 100;
        } else if (l.rubrica === "OUT") t.out += Number(l.valor ?? 0);
        totais.set(l.processamento_id, t);
      });
      return procs.map(p => {
        const t = totais.get(p.id) ?? { hn: 0, out: 0, doc: 0, ret: 0 };
        return { ...p, total_hn: t.hn, total_out: t.out, total_doc: t.doc, total_ret: t.ret, total: t.hn + t.out };
      });

    },
  });

  const grupos = useMemo(() => {
    type Grupo = { key: string; label: string; cursoId: string | null; procs: any[]; total: number; totalDoc: number; totalRet: number };
    const map = new Map<string, Grupo>();
    for (const p of (q.data ?? []) as any[]) {
      const key: string = p.curso?.id ?? "__sem_curso__";
      const label = p.curso ? `${p.curso.codigo} · ${p.curso.nome}` : "Sem curso associado";
      const g: Grupo = map.get(key) ?? { key, label, cursoId: p.curso?.id ?? null, procs: [], total: 0, totalDoc: 0, totalRet: 0 };
      g.procs.push(p);
      g.total += p.total;
      g.totalDoc += p.total_doc ?? 0;
      g.totalRet += p.total_ret ?? 0;
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "pt"));
  }, [q.data]);

  const totalGeral = useMemo(
    () => (q.data ?? []).reduce((s: number, p: any) => s + p.total, 0),
    [q.data],
  );
  const totalDocGeral = useMemo(
    () => (q.data ?? []).reduce((s: number, p: any) => s + (p.total_doc ?? 0), 0),
    [q.data],
  );
  const totalRetGeral = useMemo(
    () => (q.data ?? []).reduce((s: number, p: any) => s + (p.total_ret ?? 0), 0),
    [q.data],
  );
  const lucro = totalGeral * 0.4;


  // Meses disponíveis (a partir dos processamentos existentes)
  const mesesDisponiveis = useMemo(() => {
    const set = new Map<string, { ano: number; mes: number }>();
    for (const p of (q.data ?? []) as any[]) set.set(`${p.ano}-${p.mes}`, { ano: p.ano, mes: p.mes });
    return [...set.values()].sort((a, b) => b.ano - a.ano || b.mes - a.mes);
  }, [q.data]);

  const [periodo, setPeriodo] = useState<string>("");
  const [exportando, setExportando] = useState(false);
  const periodoSel = periodo || (mesesDisponiveis[0] ? `${mesesDisponiveis[0].ano}-${mesesDisponiveis[0].mes}` : "");

  async function exportarMes() {
    if (!periodoSel) { toast.error("Sem meses disponíveis."); return; }
    const [anoS, mesS] = periodoSel.split("-");
    const ano = Number(anoS), mes = Number(mesS);
    setExportando(true);
    try {
      let pq = supabase.from("fin_processamento")
        .select("id, curso:curso_id(codigo, nome)").eq("ano", ano).eq("mes", mes);
      if (projetoId && projetoId !== "all") pq = pq.eq("projeto_id", projetoId);
      const { data: procs, error: e1 } = await pq;
      if (e1) throw e1;
      const lista = (procs ?? []) as any[];
      if (!lista.length) throw new Error("Sem processamentos nesse mês.");

      const { data: linhas, error: e2 } = await supabase.from("fin_processamento_linha")
        .select("processamento_id, rubrica, formador_id, horas_frequentadas, valor_hora, valor, recibo_confirmado, memoria_calculo, formador:formador_id(nome, nif, iban, retencao_percentagem, iva_percentagem)")
        .in("processamento_id", lista.map(p => p.id));
      if (e2) throw e2;

      const cursoDe = new Map(lista.map(p => [p.id, p.curso ? `${p.curso.codigo} · ${p.curso.nome}` : "Sem curso"]));
      const map = new Map<string, any>();
      for (const l of ((linhas ?? []) as any[])) {
        if (l.rubrica !== "HN" || !l.formador_id) continue;
        const key = `${l.formador_id}|${l.processamento_id}`;
        const f = l.formador ?? {};
        const mc = (l.memoria_calculo ?? {}) as any;
        const g = map.get(key) ?? {
          nome: f.nome ?? "—", curso: cursoDe.get(l.processamento_id) ?? "—",
          nif: f.nif ?? null, iban: f.iban ?? null,
          ivaPct: mc.aplica_iva === true ? Number(mc.iva_pct ?? f.iva_percentagem ?? 23) : 0,
          seloPct: mc.aplica_selo === true ? Number(mc.selo_pct ?? 4) : 0,
          retencaoPct: mc.aplica_retencao === true ? Number(mc.retencao_pct ?? f.retencao_percentagem ?? 23) : 0,
          horas: 0, valorHora: Number(l.valor_hora ?? 0), base: 0, recibo: false,
        };
        g.horas += Number(l.horas_frequentadas ?? 0);
        g.base += Number(l.valor ?? 0);
        if (!g.valorHora) g.valorHora = Number(l.valor_hora ?? 0);
        if (l.recibo_confirmado) g.recibo = true;
        map.set(key, g);
      }
      const dados = [...map.values()];
      if (!dados.length) throw new Error("Sem honorários de formadores nesse mês.");

      const { data: cfg } = await supabase.from("fin_config").select("*").limit(1).maybeSingle();
      const c: any = cfg ?? {};
      const { exportFormadoresMesExcel } = await import("@/lib/financeiro/excel-formadores-mes");
      await exportFormadoresMesExcel({
        ano, mes, linhas: dados,
        empresa: cfg ? { nome: c.empresa_nome, nif: c.empresa_nif, morada: c.empresa_morada } : null,
      });
      toast.success("Excel gerado.");
    } catch (e: any) {
      toast.error(e.message ?? "Erro a exportar.");
    } finally {
      setExportando(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Processamentos Formadores"
        description="Honorários e outras despesas, por mês e por curso."
        actions={
          <div className="flex items-center gap-2">
            <Select value={periodoSel} onValueChange={setPeriodo}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Mês" /></SelectTrigger>
              <SelectContent>
                {mesesDisponiveis.map(m => (
                  <SelectItem key={`${m.ano}-${m.mes}`} value={`${m.ano}-${m.mes}`}>
                    {MESES[m.mes - 1]}/{m.ano}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportarMes} disabled={exportando || !periodoSel}>
              <FileSpreadsheet className="size-4" />{exportando ? "A exportar…" : "Exportar mês"}
            </Button>
          </div>
        }
      />


      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total processado (formadores + despesas)</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{totalGeral.toFixed(2)} €</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20">
          <CardContent className="p-4">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Taxa de lucro (40%)</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{lucro.toFixed(2)} €</div>
          </CardContent>
        </Card>
      </div>

      <NotasPainel
        chave="processamentos-formadores"
        titulo="Notas dos processamentos de formadores"
        placeholder="Notas sobre honorários, despesas, faturação…"
      />

      {q.isLoading && <div className="text-sm text-muted-foreground">A carregar…</div>}
      {!q.isLoading && grupos.length === 0 && (
        <div className="border rounded-md bg-card px-6 py-10 text-sm text-muted-foreground">Sem processamentos.</div>
      )}

      <div className="space-y-3">
        {grupos.map(g => {
          const isOpen = !collapsed[g.key];
          return (
            <div key={g.key} className="border rounded-md bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => setCollapsed(s => ({ ...s, [g.key]: isOpen }))}
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted/40 transition text-left"
              >
                {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                <div className="flex-1 min-w-0"><span className="font-medium">{g.label}</span></div>
                <span className="text-xs text-muted-foreground">{g.procs.length}</span>
                <span className="w-28 text-right text-sm font-semibold tabular-nums">{g.total.toFixed(2)} €</span>
              </button>
              {isOpen && (
                <ul className="divide-y divide-border border-t">
                  {g.procs.map((p: any) => (
                    <li key={p.id}>
                      <Link to="/financeiro/formadores/$id" params={{ id: p.id }} className="px-4 py-3 flex items-center gap-4 text-sm hover:bg-muted/40 transition">
                        <div className="w-20 text-xs font-mono">{MESES[p.mes-1]}/{p.ano}</div>
                        <div className="flex-1 min-w-0 text-xs text-muted-foreground">
                          HN {p.total_hn.toFixed(2)} € • Outras despesas {p.total_out.toFixed(2)} €
                        </div>
                        <Badge variant={p.estado === "fechado" ? "default" : "secondary"}>{p.estado}</Badge>
                        <div className="w-28 text-right font-semibold tabular-nums">{p.total.toFixed(2)} €</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </PageContainer>
  );
}
