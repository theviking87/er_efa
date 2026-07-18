import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, Coins, UtensilsCrossed, Car, HandCoins, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_authenticated/financeiro/")({
  head: () => ({ meta: [{ title: "Financeiro — Painel" }] }),
  component: FinanceiroDashboard,
});

function eur(n: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n || 0);
}

async function sum(table: string, col: string) {
  const { data, error } = await (supabase as any).from(table).select(col);
  if (error) throw error;
  return (data ?? []).reduce((acc: number, r: any) => acc + Number(r[col] ?? 0), 0);
}


function FinanceiroDashboard() {
  const totals = useQuery({
    queryKey: ["financeiro-totals"],
    queryFn: async () => {
      const [bolsas, subsidios, km, honor, procs] = await Promise.all([
        sum("financeiro_bolsas", "valor_final"),
        sum("financeiro_subsidios", "total"),
        sum("financeiro_quilometros", "total"),
        sum("financeiro_honorarios", "total"),
        supabase.from("financeiro_processamentos").select("id, estado"),
      ]);
      const procsData = procs.data ?? [];
      return {
        bolsas, subsidios, km, honor,
        procTotal: procsData.length,
        procAbertos: procsData.filter((p: any) => p.estado === "aberto").length,
        geral: bolsas + subsidios + km + honor,
      };
    },
  });

  const t = totals.data;
  const cards = [
    { label: "Bolsas de formação", value: t?.bolsas ?? 0, icon: Coins, to: "/financeiro/bolsas" },
    { label: "Subsídio de alimentação", value: t?.subsidios ?? 0, icon: UtensilsCrossed, to: "/financeiro/subsidios" },
    { label: "Quilómetros", value: t?.km ?? 0, icon: Car, to: "/financeiro/quilometros" },
    { label: "Honorários", value: t?.honor ?? 0, icon: HandCoins, to: "/financeiro/honorarios" },
  ] as const;

  return (
    <PageContainer>
      <PageHeader title="Painel Financeiro" description="Visão global de custos processados." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        <Card className="bg-primary/5 border-primary/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total geral</CardTitle>
            <Wallet className="size-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{eur(t?.geral ?? 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">Processamentos</CardTitle>
            <ClipboardList className="size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{t?.procTotal ?? 0}</div>
            <div className="text-xs text-muted-foreground">{t?.procAbertos ?? 0} em aberto</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <Link key={c.label} to={c.to} className="block">
              <Card className="hover:border-primary/50 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm text-muted-foreground">{c.label}</CardTitle>
                  <Icon className="size-4" />
                </CardHeader>
                <CardContent><div className="text-xl font-semibold">{eur(c.value)}</div></CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </PageContainer>
  );
}
