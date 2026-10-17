import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Gestão de Formação — Início" },
    { name: "description", content: "Acesso à gestão de cursos, formandos, cronogramas e relatórios de formação." },
    { property: "og:title", content: "Gestão de Formação — Início" },
    { property: "og:description", content: "Organização pedagógica e financeira da formação." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: IndexRedirect,
});

function IndexRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      navigate({ to: data.session ? "/dashboard" : "/auth", replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);
  return <div className="min-h-screen bg-background" />;
}
