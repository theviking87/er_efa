import { createFileRoute, redirect } from "@tanstack/react-router";

// Consolidado em Auditoria (aba "Utilizadores Locais").
export const Route = createFileRoute("/_authenticated/financeiro/utilizadores")({
  beforeLoad: () => { throw redirect({ to: "/financeiro/auditoria" }); },
});
