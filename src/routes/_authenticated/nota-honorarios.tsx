import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { NotaHonorariosCard } from "./relatorios";

export const Route = createFileRoute("/_authenticated/nota-honorarios")({
  head: () => ({ meta: [{ title: "Nota de Honorários — Gestão Pedagógica" }] }),
  component: NotaHonorariosPage,
});

function NotaHonorariosPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Nota de Honorários"
        description="Gera notas de honorários por mês ou por UFCD ministrada, com pré-visualização em tempo real."
      />
      <div className="grid gap-4">
        <NotaHonorariosCard />
      </div>
    </PageContainer>
  );
}
