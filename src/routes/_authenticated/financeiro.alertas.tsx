import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Info, XCircle } from "lucide-react";
import { calcularAlertas } from "@/lib/financeiro/services/alertas";

export const Route = createFileRoute("/_authenticated/financeiro/alertas")({
  head: () => ({ meta: [{ title: "Financeiro — Alertas" }] }),
  component: AlertasPage,
});

const nivelIcon = { info: Info, aviso: AlertTriangle, erro: XCircle } as const;

function AlertasPage() {
  const alertas = useQuery({ queryKey: ["fin-alertas"], queryFn: calcularAlertas });
  const lista = alertas.data ?? [];

  return (
    <PageContainer>
      <PageHeader title="Alertas Financeiros" description="Deteções não-bloqueantes: configuração, rubricas sem regra, IBANs em falta, entre outras." />
      <Card>
        <CardHeader><CardTitle className="text-base">{lista.length} alerta(s) ativo(s)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {lista.map(a => {
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
          {lista.length === 0 && <div className="text-muted-foreground text-sm">Sem alertas — está tudo em ordem.</div>}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
