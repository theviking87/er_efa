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
        .select("processamento_id, rubrica, valor, formador_id")
        .in("processamento_id", procs.map(p => p.id));
      const totais = new Map<string, { hn: number; out: number }>();
      ((linhas ?? []) as any[]).forEach(l => {
        const t = totais.get(l.processamento_id) ?? { hn: 0, out: 0 };
        if (l.rubrica === "HN") t.hn += Number(l.valor ?? 0);
        else if (l.rubrica === "OUT") t.out += Number(l.valor ?? 0);
        totais.set(l.processamento_id, t);
      });
      return procs.map(p => {
        const t = totais.get(p.id) ?? { hn: 0, out: 0 };
        return { ...p, total_hn: t.hn, total_out: t.out, total: t.hn + t.out };
      });
    },
  });

  const grupos = useMemo(() => {
    type Grupo = { key: string; label: string; cursoId: string | null; procs: any[]; total: number };
    const map = new Map<string, Grupo>();
    for (const p of (q.data ?? []) as any[]) {
      const key: string = p.curso?.id ?? "__sem_curso__";
      const label = p.curso ? `${p.curso.codigo} · ${p.curso.nome}` : "Sem curso associado";
      const g: Grupo = map.get(key) ?? { key, label, cursoId: p.curso?.id ?? null, procs: [], total: 0 };
      g.procs.push(p);
      g.total += p.total;
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "pt"));
  }, [q.data]);

  const totalGeral = useMemo(
    () => (q.data ?? []).reduce((s: number, p: any) => s + p.total, 0),
    [q.data],
  );
  const lucro = totalGeral * 0.4;

  return (
    <PageContainer>
      <PageHeader
        title="Processamentos Formadores"
        description="Honorários e outras despesas, por mês e por curso."
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
