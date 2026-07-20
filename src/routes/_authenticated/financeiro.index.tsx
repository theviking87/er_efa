import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Tags, HandCoins, Bell, Settings2, AlertTriangle, Info, XCircle, History } from "lucide-react";
import { calcularAlertas } from "@/lib/financeiro/services/alertas";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/financeiro/")({
  head: () => ({ meta: [{ title: "Financeiro — Dashboard" }] }),
  component: FinanceiroDashboard,
});

function FinanceiroDashboard() {
  const alertas = useQuery({ queryKey: ["fin-alertas"], queryFn: calcularAlertas });

  const procs = useQuery({
    queryKey: ["fin-procs-count"],
    queryFn: async () => {
      const { data } = await supabase.from("financeiro_processamentos").select("id, estado");
      const arr = data ?? [];
      return {
        total: arr.length,
        abertos: arr.filter((p: any) => p.estado === "aberto").length,
        fechados: arr.filter((p: any) => p.estado === "fechado" || p.estado === "validado").length,
      };
    },
  });

  const rubricas = useQuery({
    queryKey: ["fin-rubs-count"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("fin_rubricas").select("id, ativo");
      const arr = data ?? [];
      return { total: arr.length, ativas: arr.filter((r: any) => r.ativo).length };
    },
  });

  const honor = useQuery({
    queryKey: ["fin-hon-count"],
    queryFn: async () => {
      const { data } = await supabase.from("financeiro_honorarios").select("id");
      return { total: (data ?? []).length };
    },
  });

  const configs = useQuery({
    queryKey: ["fin-cfg-count"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("fin_configuracao_global").select("id, ativo");
      const arr = data ?? [];
      return { total: arr.length, ativa: arr.some((c: any) => c.ativo) };
    },
  });

  const historico = useQuery({
    queryKey: ["fin-audit-recent"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("fin_auditoria")
        .select("id, created_at, nome_utilizador, operacao, entidade, campo_alterado")
        .order("created_at", { ascending: false })
        .limit(8);
      return (data ?? []) as any[];
    },
  });

  const nivelIcon = { info: Info, aviso: AlertTriangle, erro: XCircle } as const;
  const alertasCount = alertas.data?.length ?? 0;

  const cards = [
    { label: "Processamentos", value: procs.data?.total ?? 0, extra: `${procs.data?.abertos ?? 0} abertos · ${procs.data?.fechados ?? 0} fechados`, icon: ClipboardList, to: "/financeiro/processamentos" as const },
    { label: "Rubricas", value: rubricas.data?.ativas ?? 0, extra: `${rubricas.data?.total ?? 0} no catálogo`, icon: Tags, to: "/financeiro/rubricas" as const },
    { label: "Honorários", value: honor.data?.total ?? 0, extra: "Lançamentos + notas", icon: HandCoins, to: "/financeiro/honorarios" as const },
    { label: "Alertas", value: alertasCount, extra: alertasCount ? "A rever" : "Sem alertas", icon: Bell, to: "/financeiro/alertas" as const },
    { label: "Configurações", value: configs.data?.ativa ? "Ativa" : "Em falta", extra: `${configs.data?.total ?? 0} versão(ões)`, icon: Settings2, to: "/financeiro/configuracao" as const },
  ];

  return (
    <PageContainer>
      <PageHeader title="Dashboard Financeira" description="Visão global do módulo — valores calculados serão apresentados numa fase posterior." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-6">
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <Link key={c.label} to={c.to} className="block">
              <Card className="hover:border-primary/50 transition-colors h-full">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm text-muted-foreground">{c.label}</CardTitle>
                  <Icon className="size-4" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{c.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{c.extra}</div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Alertas ativos</CardTitle>
            <Link to="/financeiro/alertas" className="text-xs text-primary hover:underline">Ver todos</Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {(alertas.data ?? []).slice(0, 5).map(a => {
              const Icon = nivelIcon[a.nivel as keyof typeof nivelIcon] ?? Info;
              const color = a.nivel === "erro" ? "text-destructive" : a.nivel === "aviso" ? "text-amber-600" : "text-muted-foreground";
              return (
                <div key={a.id} className="flex items-start gap-2 text-sm border rounded-md p-3">
                  <Icon className={`size-4 mt-0.5 ${color}`} />
                  <div>
                    <div className="font-medium">{a.titulo}</div>
                    {a.detalhe && <div className="text-muted-foreground text-xs">{a.detalhe}</div>}
                  </div>
                </div>
              );
            })}
            {!alertas.data?.length && <div className="text-muted-foreground text-sm">Sem alertas — está tudo em ordem.</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><History className="size-4" /> Últimas alterações</CardTitle>
            <Link to="/financeiro/auditoria" className="text-xs text-primary hover:underline">Ver auditoria</Link>
          </CardHeader>
          <CardContent className="space-y-1">
            {(historico.data ?? []).map(h => (
              <div key={h.id} className="flex items-center gap-2 text-xs border-b py-1.5 last:border-0">
                <span className="text-muted-foreground w-32 shrink-0">{new Date(h.created_at).toLocaleString("pt-PT")}</span>
                <Badge variant="secondary" className="capitalize">{h.operacao}</Badge>
                <span className="truncate">{h.entidade}{h.campo_alterado ? ` · ${h.campo_alterado}` : ""}</span>
                <span className="ml-auto text-muted-foreground">{h.nome_utilizador ?? "—"}</span>
              </div>
            ))}
            {!historico.data?.length && <div className="text-muted-foreground text-sm">Sem histórico registado.</div>}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
