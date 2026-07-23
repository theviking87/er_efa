import { createFileRoute, Link } from "@tanstack/react-router";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/financeiro/processamentos/novo")({
  head: () => ({ meta: [{ title: "Financeiro — Novo processamento" }] }),
  component: NovoProcessamento,
});

function NovoProcessamento() {
  return (
    <PageContainer>
      <PageHeader title="Novo processamento" description="Criar um processamento mensal para um curso." />
      <Card><CardContent className="py-10 text-center space-y-4">
        <p className="text-sm text-muted-foreground">
          Motor de cálculo (Bolsa, BFM, SA, Transporte, Honorários) a ser implementado na próxima iteração,
          com base na configuração global e nas UCs frequentadas de cada formando.
        </p>
        <Button asChild variant="outline"><Link to="/financeiro">Voltar</Link></Button>
      </CardContent></Card>
    </PageContainer>
  );
}
