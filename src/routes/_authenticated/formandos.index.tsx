import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, ChevronDown, ChevronRight } from "lucide-react";
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

type Formando = { id: string; nome: string; nif?: string | null; email?: string | null; telemovel?: string | null; estado: string };
type Inscricao = { formando_id: string; curso: { id: string; codigo: string; nome: string } | null };

function FormandosPage() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const list = useQuery({
    queryKey: ["formandos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("formandos").select("*").order("nome");
      if (error) throw error;
      return (data ?? []) as Formando[];
    },
  });

  const inscricoes = useQuery({
    queryKey: ["formandos-inscricoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("curso_formandos")
        .select("formando_id, curso:cursos(id, codigo, nome)");
      if (error) throw error;
      return (data ?? []) as any as Inscricao[];
    },
  });

  const cursosPorFormando = useMemo(() => {
    const m = new Map<string, { id: string; codigo: string; nome: string }[]>();
    (inscricoes.data ?? []).forEach(i => {
      if (!i.curso) return;
      const arr = m.get(i.formando_id) ?? [];
      if (!arr.find(c => c.id === i.curso!.id)) arr.push(i.curso);
      m.set(i.formando_id, arr);
    });
    return m;
  }, [inscricoes.data]);

  const filtered = (list.data ?? []).filter((f) =>
    !q || f.nome.toLowerCase().includes(q.toLowerCase()) ||
    (f.nif ?? "").includes(q) || (f.email ?? "").toLowerCase().includes(q.toLowerCase())
  );

  // Agrupar por curso; formandos sem curso vão para "Avulso"
  const grupos = useMemo(() => {
    const map = new Map<string, { key: string; label: string; cursoId: string | null; formandos: Formando[] }>();
    const avulso = { key: "__avulso__", label: "Avulso (sem curso)", cursoId: null, formandos: [] as Formando[] };
    for (const f of filtered) {
      const cursos = cursosPorFormando.get(f.id) ?? [];
      if (!cursos.length) {
        avulso.formandos.push(f);
        continue;
      }
      for (const c of cursos) {
        const key = c.id;
        const g = map.get(key) ?? { key, label: `${c.codigo} · ${c.nome}`, cursoId: c.id, formandos: [] };
        g.formandos.push(f);
        map.set(key, g);
      }
    }
    const ordered = [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
    if (avulso.formandos.length) ordered.push(avulso);
    return ordered;
  }, [filtered, cursosPorFormando]);

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

      {list.isLoading && <div className="px-6 py-10 text-sm text-muted-foreground">A carregar…</div>}
      {!list.isLoading && grupos.length === 0 && (
        <div className="border rounded-md bg-card px-6 py-10 text-sm text-muted-foreground text-center">
          {list.data?.length ? "Sem resultados." : "Sem formandos. Crie o primeiro."}
        </div>
      )}

      <div className="space-y-3">
        {grupos.map(g => {
          const isOpen = !collapsed[g.key];
          return (
            <div key={g.key} className="border rounded-md bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => setCollapsed(s => ({ ...s, [g.key]: isOpen }))}
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted/40 transition text-left"
              >
                {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                <div className="flex-1 min-w-0">
                  {g.cursoId ? (
                    <Link to="/cursos/$id" params={{ id: g.cursoId }} onClick={e => e.stopPropagation()} className="font-medium hover:underline">
                      {g.label}
                    </Link>
                  ) : (
                    <span className="font-medium">{g.label}</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{g.formandos.length}</span>
              </button>
              {isOpen && (
                <ul className="divide-y divide-border border-t">
                  {g.formandos.map(f => (
                    <li key={`${g.key}-${f.id}`}>
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
              )}
            </div>
          );
        })}
      </div>

      <FormandoDialog open={open} onOpenChange={setOpen} />
    </PageContainer>
  );
}
