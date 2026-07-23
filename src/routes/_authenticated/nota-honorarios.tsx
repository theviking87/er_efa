import { createFileRoute } from "@tanstack/react-router";
import { NotaHonorariosCard } from "@/components/financeiro/nota-honorarios-card";

export const Route = createFileRoute("/_authenticated/nota-honorarios")({
  head: () => ({
    meta: [
      { title: "Nota de Honorários — Gestão Financeira" },
      { name: "description", content: "Emissão de notas de honorários para formadores registados ou externos, com IRS, IVA e logótipos institucionais." },
      { property: "og:title", content: "Nota de Honorários" },
      { property: "og:description", content: "Emissão de notas de honorários com logótipos e dados da empresa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotaHonorariosPage,
});

function NotaHonorariosPage() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nota de Honorários</h1>
        <p className="text-sm text-muted-foreground">Emite um recibo de honorários com dados e logótipos institucionais.</p>
      </div>
      <NotaHonorariosCard />
    </div>
  );
}
