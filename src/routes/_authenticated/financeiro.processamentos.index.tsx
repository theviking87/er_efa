import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { useProjetoAtivo } from "@/lib/projeto-context";

export const Route = createFileRoute("/_authenticated/financeiro/processamentos/")({
  head: () => ({ meta: [{ title: "Financeiro — Processamentos" }] }),
  component: ProcessamentosPage,
});

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function ProcessamentosPage() {
  const { projetoId } = useProjetoAtivo();
  const q = useQuery({
    queryKey: ["fin-procs-list", projetoId],
    queryFn: async () => {
      let query = supabase.from("fin_processamento")
        .select("id, ano, mes, estado, total_bf, total_bfm, total_sa, total_tr, total_hn, total_geral, curso:curso_id(codigo, nome)")
        .order("ano", { ascending: false }).order("mes", { ascending: false });
      if (projetoId && projetoId !== "all") query = query.eq("projeto_id", projetoId);
      const { data } = await query; return data ?? [];
    },
  });

  return (
    <PageContainer>
      <PageHeader
        title="Processamentos"
        description="Lista mensal de processamentos por curso."
        actions={<Button asChild><Link to="/financeiro/processamentos/novo"><Plus className="size-4" />Novo</Link></Button>}
      />
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Todos os processamentos</CardTitle></CardHeader>
        <CardContent className="p-0">
          {q.isLoading && <div className="px-6 py-10 text-sm text-muted-foreground">A carregar…</div>}
          {!q.isLoading && !q.data?.length && <div className="px-6 py-10 text-sm text-muted-foreground">Sem processamentos.</div>}
          <ul className="divide-y divide-border">
            {(q.data ?? []).map((p: any) => (
              <li key={p.id}>
                <Link to="/financeiro/processamentos/$id" params={{ id: p.id }} className="px-6 py-3 flex items-center gap-4 text-sm hover:bg-muted/40">
                  <div className="w-20 text-xs font-mono">{MESES[p.mes-1]}/{p.ano}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.curso?.codigo} — {p.curso?.nome}</div>
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
        </CardContent>
      </Card>
    </PageContainer>
  );
}
