import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search } from "lucide-react";
import { ESTADO_FORMADOR_LABEL, fmtDate } from "@/lib/format";
import { FormadorDialog } from "@/components/formador-dialog";

export const Route = createFileRoute("/_authenticated/formadores/")({
  head: () => ({ meta: [{ title: "Formadores — Gestão Pedagógica" }] }),
  component: FormadoresPage,
});

function FormadoresPage() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const list = useQuery({
    queryKey: ["formadores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formadores")
        .select("*")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const filtered = (list.data ?? []).filter(f =>
    !q || f.nome.toLowerCase().includes(q.toLowerCase()) ||
    (f.nif ?? "").includes(q) || (f.email ?? "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <PageContainer>
      <PageHeader
        title="Formadores"
        description="Gestão de formadores, contactos, CCP e documentos."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Novo formador
          </Button>
        }
      />

      <div className="flex items-center gap-3 mb-4">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar por nome, NIF ou email…" className="pl-8" />
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} {filtered.length === 1 ? "formador" : "formadores"}</span>
      </div>

      <div className="border border-border rounded-md overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Nome</th>
              <th className="text-left font-medium px-4 py-2.5">NIF</th>
              <th className="text-left font-medium px-4 py-2.5">Contacto</th>
              <th className="text-left font-medium px-4 py-2.5">CCP</th>
              <th className="text-left font-medium px-4 py-2.5">Estado</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.isLoading && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">A carregar…</td></tr>}
            {!list.isLoading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Sem formadores. Adicione o primeiro.</td></tr>
            )}
            {filtered.map(f => (
              <tr key={f.id} className="hover:bg-muted/30">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-block size-2.5 rounded-full" style={{ background: f.cor }} />
                    <Link to="/formadores/$id" params={{ id: f.id }} className="font-medium hover:underline">{f.nome}</Link>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{f.nif ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{f.email ?? f.telemovel ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {f.ccp ?? "—"}{f.validade_ccp && <span className="text-xs"> · até {fmtDate(f.validade_ccp)}</span>}
                </td>
                <td className="px-4 py-2.5"><EstadoBadge estado={f.estado} /></td>
                <td className="px-4 py-2.5 text-right">
                  <Link to="/formadores/$id" params={{ id: f.id }} className="text-xs text-muted-foreground hover:text-foreground">Abrir →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FormadorDialog open={open} onOpenChange={setOpen} />
    </PageContainer>
  );
}

export function EstadoBadge({ estado }: { estado: string }) {
  const variant = estado === "ativo" ? "default"
    : estado === "arquivado" || estado === "inativo" ? "secondary"
    : "outline";
  return <Badge variant={variant as any} className="text-[11px] font-normal">{ESTADO_FORMADOR_LABEL[estado] ?? estado}</Badge>;
}
