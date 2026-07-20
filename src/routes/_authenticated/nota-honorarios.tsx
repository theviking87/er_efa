import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota consolidada — Nota de Honorários vive agora em Financeiro › Honorários.
// Mantemos este ficheiro apenas para redirecionar links antigos.
export const Route = createFileRoute("/_authenticated/nota-honorarios")({
  beforeLoad: () => {
    throw redirect({ to: "/financeiro/honorarios" });
  },
});
