import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search } from "lucide-react";
import { ESTADO_FORMANDO_LABEL } from "@/lib/format";
import { FormandoDialog } from "@/components/formando-dialog";

export const Route = createFileRoute("/_authenticated/formandos/")({
  head: () => ({ meta: [{ title: "Formandos — Gestão Pedagógica" }] }),
  component: FormandosPage,
});

export function EstadoFormandoBadge({ estado }: { estado: string }) {
  const tone =
    estado === "ativo" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    estado === "concluido" ? "bg-blue-50 text-blue-700 border-blue-200" :
    estado === "desistente" ? "bg-destructive/10 text-destructive border-destructive/30" :
    "bg-muted text-muted-foreground border-border";
  return <Badge variant="outline" className={tone}>{ESTADO_FORMANDO_LABEL[estado] ?? estado}</Badge>;
}

function FormandosPage() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const list = useQuery({
    queryKey: ["formandos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("formandos").select("*").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = (list.data ?? []).filter((f: any) =>
    !q || f.nome.toLowerCase().includes(q.toLowerCase()) ||
    (f.nif ?? "").includes(q) || (f.email ?? "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <PageContainer>
      <PageHeader
        title="Formandos"
        description="Base de dados de formandos e respetivas inscrições."
        actions={<Button onClick={() => setOpen(true)}><Plus className="size-4" /> Novo formando</Button>}
      />

      <div className="relative mb-4 max-w-md">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Procurar por nome, NIF ou email…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      <div className="border rounded-md bg-card">
        {list.isLoading && <div className="px-6 py-10 text-sm text-muted-foreground">A carregar…</div>}
        {!list.isLoading && filtered.length === 0 && (
          <div className="px-6 py-10 text-sm text-muted-foreground text-center">
            {list.data?.length ? "Sem resultados." : "Sem formandos. Crie o primeiro."}
          </div>
        )}
        <ul className="divide-y divide-border">
          {filtered.map((f: any) => (
            <li key={f.id}>
              <Link to="/formandos/$id" params={{ id: f.id }} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{f.nome}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[f.email, f.telemovel, f.nif && `NIF ${f.nif}`].filter(Boolean).join(" · ") || "Sem contacto"}
                  </div>
                </div>
                <EstadoFormandoBadge estado={f.estado} />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <FormandoDialog open={open} onOpenChange={setOpen} />
    </PageContainer>
  );
}
