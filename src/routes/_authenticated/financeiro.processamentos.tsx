import { createFileRoute, Link } from "@tanstack/react-router";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/financeiro/processamentos")({
  head: () => ({ meta: [{ title: "Financeiro — Processamentos" }] }),
  component: ProcessamentosPage,
});

function ProcessamentosPage() {
  return (
    <PageContainer>
      <PageHeader title="Processamentos" description="Lista mensal de processamentos por curso." />
      <Card><CardContent className="py-10 text-center space-y-4">
        <p className="text-sm text-muted-foreground">Motor de processamento a ser reconstruído na próxima iteração.</p>
        <Button asChild variant="outline"><Link to="/financeiro">Voltar ao painel</Link></Button>
      </CardContent></Card>
    </PageContainer>
  );
}
