import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ChevronDown, ChevronRight } from "lucide-react";
import { useProjetoAtivo } from "@/lib/projeto-context";
import { NotasPainel } from "@/components/notas-painel";

export const Route = createFileRoute("/_authenticated/financeiro/processamentos/")({
  head: () => ({ meta: [{ title: "Financeiro — Processamentos" }] }),
  component: ProcessamentosPage,
});

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function ProcessamentosPage() {
  const { projetoId } = useProjetoAtivo();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const q = useQuery({
    queryKey: ["fin-procs-list", projetoId],
    queryFn: async () => {
      let query = supabase.from("fin_processamento")
        .select("id, ano, mes, estado, curso_id, total_bf, total_bfm, total_sa, total_tr, total_hn, total_geral, curso:curso_id(id, codigo, nome)")
        .order("ano", { ascending: false }).order("mes", { ascending: false });
      if (projetoId && projetoId !== "all") query = query.eq("projeto_id", projetoId);
      const { data } = await query; return data ?? [];
    },
  });

  // Agrupar por curso, à semelhança da listagem de formandos.
  const grupos = useMemo(() => {
    type Grupo = { key: string; label: string; cursoId: string | null; procs: any[]; total: number };
    const map = new Map<string, Grupo>();

    for (const p of (q.data ?? []) as any[]) {
      const key: string = p.curso?.id ?? "__sem_curso__";
      const label = p.curso ? `${p.curso.codigo} · ${p.curso.nome}` : "Sem curso associado";
      const g: Grupo = map.get(key) ?? { key, label, cursoId: p.curso?.id ?? null, procs: [] as any[], total: 0 };
      g.procs.push(p);
      g.total += Number(p.total_geral ?? 0);
      map.set(key, g);
    }

    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "pt"));
  }, [q.data]);

  return (
    <PageContainer>
      <PageHeader
        title="Processamentos Formandos"
        description="Processamentos dos formandos, por mês e por curso."
        actions={<Button asChild><Link to="/financeiro/processamentos/novo"><Plus className="size-4" />Novo</Link></Button>}
      />

      <NotasPainel chave="processamentos" titulo="Notas dos processamentos" placeholder="Notas sobre os processamentos…" />

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
                <div className="flex-1 min-w-0">
                  {g.cursoId ? (
                    <Link to="/cursos/$id" params={{ id: g.cursoId }} onClick={e => e.stopPropagation()} className="font-medium hover:underline">
                      {g.label}
                    </Link>
                  ) : (
                    <span className="font-medium">{g.label}</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{g.procs.length}</span>
                <span className="w-28 text-right text-sm font-semibold tabular-nums">{g.total.toFixed(2)} €</span>
              </button>
              {isOpen && (
                <ul className="divide-y divide-border border-t">
                  {g.procs.map((p: any) => (
                    <li key={p.id}>
                      <Link to="/financeiro/processamentos/$id" params={{ id: p.id }} className="px-4 py-3 flex items-center gap-4 text-sm hover:bg-muted/40 transition">
                        <div className="w-20 text-xs font-mono">{MESES[p.mes-1]}/{p.ano}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-muted-foreground">
                            BF {Number(p.total_bf).toFixed(0)} • BFM {Number(p.total_bfm).toFixed(0)} • SA {Number(p.total_sa).toFixed(0)} • TR {Number(p.total_tr).toFixed(0)} • HN {Number(p.total_hn).toFixed(0)}
                          </div>
                        </div>
                        <Badge variant={p.estado === "fechado" ? "default" : "secondary"}>{p.estado}</Badge>
                        <div className="w-28 text-right font-semibold tabular-nums">{Number(p.total_geral).toFixed(2)} €</div>
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

