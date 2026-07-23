import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, ClipboardList, Settings2, Plus } from "lucide-react";
import { useProjetoAtivo } from "@/lib/projeto-context";

export const Route = createFileRoute("/_authenticated/financeiro/")({
  head: () => ({ meta: [{ title: "Financeiro — Painel" }] }),
  component: FinanceiroPainel,
});

function FinanceiroPainel() {
  const { projetoId } = useProjetoAtivo();
  const procs = useQuery({
    queryKey: ["fin-procs", projetoId],
    queryFn: async () => {
      let q = supabase.from("fin_processamento")
        .select("id, ano, mes, estado, total_geral, projeto_id, curso:curso_id(codigo, nome)")
        .order("ano", { ascending: false }).order("mes", { ascending: false }).limit(20);
      if (projetoId && projetoId !== "all") q = q.eq("projeto_id", projetoId);
      const { data } = await q;
      return data ?? [];
    },
  });

  const total = (procs.data ?? []).reduce((s, r: any) => s + Number(r.total_geral ?? 0), 0);

  return (
    <PageContainer>
      <PageHeader
        title="Financeiro"
        description="Processamentos mensais por curso, configuração e emissão de documentos."
        actions={
          <Button asChild><Link to="/financeiro/processamentos/novo"><Plus className="size-4" /> Novo processamento</Link></Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        <Stat icon={ClipboardList} label="Processamentos" value={String(procs.data?.length ?? 0)} />
        <Stat icon={Wallet} label="Valor total (€)" value={total.toFixed(2)} />
        <Stat icon={Settings2} label="Configuração" value="Editar" href="/financeiro/configuracao" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Últimos processamentos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {procs.isLoading && <div className="px-6 py-10 text-sm text-muted-foreground">A carregar…</div>}
          {!procs.isLoading && (procs.data?.length ?? 0) === 0 && (
            <div className="px-6 py-10 text-sm text-muted-foreground">Sem processamentos registados.</div>
          )}
          <ul className="divide-y divide-border">
            {(procs.data ?? []).map((p: any) => (
              <li key={p.id} className="px-6 py-3 flex items-center gap-4 text-sm">
                <div className="w-20 text-xs font-mono">{p.ano}/{String(p.mes).padStart(2, "0")}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.curso?.codigo} — {p.curso?.nome}</div>
                  <div className="text-xs text-muted-foreground">{p.estado}</div>
                </div>
                <div className="w-28 text-right text-sm font-medium">{Number(p.total_geral ?? 0).toFixed(2)} €</div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function Stat({ icon: Icon, label, value, href }: { icon: any; label: string; value: string; href?: string }) {
  const inner = (
    <Card className="hover:border-foreground/30 transition-colors">
      <CardContent className="p-4 flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-semibold tracking-tight mt-1">{value}</div>
        </div>
        <Icon className="size-4 text-muted-foreground" />
      </CardContent>
    </Card>
  );
  return href ? <Link to={href as any}>{inner}</Link> : inner;
}
