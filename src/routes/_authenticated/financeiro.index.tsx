import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { PageHeader as _ } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { Wallet, Coins, UtensilsCrossed, Car, HandCoins, ClipboardList, AlertTriangle, Info, XCircle } from "lucide-react";
import { obterTotaisDashboard } from "@/lib/financeiro/services/dashboard";
import { calcularAlertas } from "@/lib/financeiro/services/alertas";

export const Route = createFileRoute("/_authenticated/financeiro/")({
  head: () => ({ meta: [{ title: "Financeiro — Painel" }] }),
  component: FinanceiroDashboard,
});

function eur(n: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n || 0);
}

function FinanceiroDashboard() {
  const totals = useQuery({ queryKey: ["fin-dashboard"], queryFn: obterTotaisDashboard });
  const alertas = useQuery({ queryKey: ["fin-alertas"], queryFn: calcularAlertas });

  const t = totals.data;
  const cards = [
    { label: "Bolsas de formação", value: t?.bolsas ?? 0, icon: Coins, to: "/financeiro/bolsas" as const },
    { label: "Subsídio de alimentação", value: t?.subsidios ?? 0, icon: UtensilsCrossed, to: "/financeiro/subsidios" as const },
    { label: "Quilómetros", value: t?.km ?? 0, icon: Car, to: "/financeiro/quilometros" as const },
    { label: "Honorários", value: t?.honorarios ?? 0, icon: HandCoins, to: "/financeiro/honorarios" as const },
  ];

  const nivelIcon = { info: Info, aviso: AlertTriangle, erro: XCircle } as const;

  return (
    <PageContainer>
      <PageHeader title="Painel Financeiro" description="Visão global de custos e alertas do módulo financeiro." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
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
            <div className="text-2xl font-bold">{(t?.processamentosAbertos ?? 0) + (t?.processamentosValidados ?? 0)}</div>
            <div className="text-xs text-muted-foreground">{t?.processamentosAbertos ?? 0} em aberto · {t?.processamentosValidados ?? 0} validados</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Rubricas ativas</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{t?.rubricasAtivas ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Alertas</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{alertas.data?.length ?? 0}</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
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

      <Card>
        <CardHeader><CardTitle className="text-base">Alertas ativos</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(alertas.data ?? []).map(a => {
            const Icon = nivelIcon[a.nivel as keyof typeof nivelIcon] ?? Info;
            const color = a.nivel === "erro" ? "text-destructive" : a.nivel === "aviso" ? "text-amber-600" : "text-muted-foreground";
            const content = (
              <div className="flex items-start gap-2 text-sm">
                <Icon className={`size-4 mt-0.5 ${color}`} />
                <div>
                  <div className="font-medium">{a.titulo}</div>
                  {a.detalhe && <div className="text-muted-foreground text-xs">{a.detalhe}</div>}
                </div>
              </div>
            );
            return a.href
              ? <Link key={a.id} to={a.href as any} className="block border rounded-md p-3 hover:bg-muted/40">{content}</Link>
              : <div key={a.id} className="border rounded-md p-3">{content}</div>;
          })}
          {!alertas.data?.length && <div className="text-muted-foreground text-sm">Sem alertas — está tudo em ordem.</div>}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
