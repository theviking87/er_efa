import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Search } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ESTADO_CURSO_LABEL, TIPOLOGIA_LABEL, fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { useProjetoAtivo, useProjetosList } from "@/lib/projeto-context";


export const Route = createFileRoute("/_authenticated/cursos/")({
  head: () => ({ meta: [{ title: "Cursos — Gestão Pedagógica" }] }),
  component: CursosPage,
});

function CursosPage() {
  const qc = useQueryClient();
  const { projetoId } = useProjetoAtivo();
  const projetos = useProjetosList();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [fEstado, setFEstado] = useState<string>("all");
  const [fProjeto, setFProjeto] = useState<string>("all");
  const [form, setForm] = useState({ codigo: "", nome: "", tipologia: "EFA", data_inicio: "", data_fim: "", estado: "planeado", projeto_id: "", acao: "", codigo_operacao: "", codigo_sigo: "" });

  const list = useQuery({
    queryKey: ["cursos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cursos").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form };
      if (!payload.data_inicio) payload.data_inicio = null;
      if (!payload.data_fim) payload.data_fim = null;
      if (!payload.projeto_id) throw new Error("Projeto é obrigatório");
      const { error } = await supabase.from("cursos").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cursos"] });
      setOpen(false);
      setForm({ codigo: "", nome: "", tipologia: "EFA", data_inicio: "", data_fim: "", estado: "planeado", projeto_id: "", acao: "", codigo_operacao: "", codigo_sigo: "" });
      toast.success("Curso criado");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const projetoFiltro = projetoId !== "all" ? projetoId : (fProjeto !== "all" ? fProjeto : null);
  const filtered = (list.data ?? []).filter(c =>
    (!projetoFiltro || (c as any).projeto_id === projetoFiltro) &&
    (fEstado === "all" || c.estado === fEstado) &&
    (!q || c.nome.toLowerCase().includes(q.toLowerCase()) || c.codigo.toLowerCase().includes(q.toLowerCase())));

  return (
    <PageContainer>
      <PageHeader
        title="Cursos"
        description="Cursos de formação ativos, planeados e concluídos."
        actions={<Button onClick={() => setOpen(true)}><Plus className="size-4" /> Novo curso</Button>}
      />

      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div className="relative max-w-xs flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar…" className="pl-8" />
        </div>
        {projetoId === "all" && (
          <div className="min-w-[180px]">
            <Label className="text-xs">Projeto</Label>
            <Select value={fProjeto} onValueChange={setFProjeto}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(projetos.data ?? []).map(p => <SelectItem key={p.id} value={p.id}>{p.codigo}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="min-w-[160px]">
          <Label className="text-xs">Estado</Label>
          <Select value={fEstado} onValueChange={setFEstado}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(ESTADO_CURSO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>


      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.isLoading && <div className="text-muted-foreground">A carregar…</div>}
        {!list.isLoading && filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground text-sm">Sem cursos. Crie o primeiro.</div>
        )}
        {filtered.map(c => (
          <Link key={c.id} to="/cursos/$id" params={{ id: c.id }}
            className="block border border-border rounded-lg p-4 hover:border-foreground/30 transition-colors bg-card">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="font-mono text-[11px] text-muted-foreground">{c.codigo}</div>
              <Badge variant="outline" className="text-[10px]">{TIPOLOGIA_LABEL[c.tipologia]}</Badge>
            </div>
            <div className="font-medium leading-snug mb-3">{c.nome}</div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{fmtDate(c.data_inicio)} — {fmtDate(c.data_fim)}</span>
              <Badge variant="secondary" className="text-[10px] font-normal">{ESTADO_CURSO_LABEL[c.estado]}</Badge>
            </div>
          </Link>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo curso</DialogTitle></DialogHeader>
          <form id="curso-form" onSubmit={e => { e.preventDefault(); save.mutate(); }} className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Código *</Label><Input required value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Tipologia</Label>
              <Select value={form.tipologia} onValueChange={v => setForm({ ...form, tipologia: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPOLOGIA_LABEL).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5"><Label>Nome *</Label><Input required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="col-span-2 space-y-1.5">
              <Label>Projeto *</Label>
              <Select value={form.projeto_id || (projetoId !== "all" ? projetoId : "")} onValueChange={v => setForm({ ...form, projeto_id: v })}>
                <SelectTrigger><SelectValue placeholder="Escolher projeto…" /></SelectTrigger>
                <SelectContent>
                  {(projetos.data ?? []).map(p => <SelectItem key={p.id} value={p.id}>{p.codigo} — {p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Início</Label><Input type="date" value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Fim</Label><Input type="date" value={form.data_fim} onChange={e => setForm({ ...form, data_fim: e.target.value })} /></div>
            <div className="col-span-2 space-y-1.5">
              <Label>Estado</Label>
              <Select value={form.estado} onValueChange={v => setForm({ ...form, estado: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ESTADO_CURSO_LABEL).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5"><Label>Ação</Label><Input value={form.acao} onChange={e => setForm({ ...form, acao: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Código da Operação</Label><Input value={form.codigo_operacao} onChange={e => setForm({ ...form, codigo_operacao: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Código SIGO</Label><Input value={form.codigo_sigo} onChange={e => setForm({ ...form, codigo_sigo: e.target.value })} /></div>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" form="curso-form" disabled={save.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
