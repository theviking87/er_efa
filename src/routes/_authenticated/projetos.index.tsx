import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FolderKanban, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/projetos/")({
  head: () => ({ meta: [{ title: "Projetos" }] }),
  component: ProjetosPage,
});

export const ESTADO_PROJETO = {
  planeado: "Planeado",
  ativo: "Ativo",
  concluido: "Concluído",
  arquivado: "Arquivado",
} as const;

function ProjetosPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [fEstado, setFEstado] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    codigo: "", nome: "", descricao: "", entidade_promotora: "", programa_financiamento: "",
    data_inicio: "", data_fim: "", estado: "ativo" as keyof typeof ESTADO_PROJETO, observacoes: "",
  });

  const list = useQuery({
    queryKey: ["projetos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projetos").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.codigo || !form.nome) throw new Error("Código e nome obrigatórios");
      const payload: any = { ...form };
      if (!payload.data_inicio) payload.data_inicio = null;
      if (!payload.data_fim) payload.data_fim = null;
      const { error } = await supabase.from("projetos").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projetos"] });
      qc.invalidateQueries({ queryKey: ["projetos-list"] });
      setOpen(false);
      toast.success("Projeto criado");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rows = (list.data ?? []).filter(p =>
    (fEstado === "all" || p.estado === fEstado) &&
    (!q || p.nome.toLowerCase().includes(q.toLowerCase()) || p.codigo.toLowerCase().includes(q.toLowerCase())));

  return (
    <PageContainer>
      <PageHeader
        title="Projetos"
        description="Cada projeto agrupa cursos, formandos, sessões e o respetivo financeiro."
        actions={<Button onClick={() => setOpen(true)}><Plus className="size-4 mr-1" /> Novo projeto</Button>}
      />

      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-wrap gap-3 items-end">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar por nome ou código…" className="pl-8" />
          </div>
          <div className="min-w-[160px]">
            <Label>Estado</Label>
            <Select value={fEstado} onValueChange={setFEstado}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(ESTADO_PROJETO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.isLoading && <div className="text-muted-foreground text-sm">A carregar…</div>}
        {!list.isLoading && rows.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground text-sm">Sem projetos.</div>
        )}
        {rows.map(p => (
          <Link key={p.id} to="/projetos/$id" params={{ id: p.id }}
            className="block border border-border rounded-lg p-4 hover:border-foreground/30 transition-colors bg-card">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <FolderKanban className="size-4 text-primary shrink-0" />
                <div className="font-mono text-[11px] text-muted-foreground truncate">{p.codigo}</div>
              </div>
              <Badge variant={p.estado === "ativo" ? "default" : "secondary"} className="text-[10px]">
                {ESTADO_PROJETO[p.estado as keyof typeof ESTADO_PROJETO] ?? p.estado}
              </Badge>
            </div>
            <div className="font-medium leading-snug mb-2 line-clamp-2">{p.nome}</div>
            {p.entidade_promotora && <div className="text-xs text-muted-foreground truncate">{p.entidade_promotora}</div>}
          </Link>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Novo projeto</DialogTitle></DialogHeader>
          <form id="proj-form" onSubmit={e => { e.preventDefault(); create.mutate(); }} className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Código *</Label><Input required value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={form.estado} onValueChange={v => setForm({ ...form, estado: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ESTADO_PROJETO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5"><Label>Nome *</Label><Input required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Entidade promotora</Label><Input value={form.entidade_promotora} onChange={e => setForm({ ...form, entidade_promotora: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Programa de financiamento</Label><Input value={form.programa_financiamento} onChange={e => setForm({ ...form, programa_financiamento: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Início</Label><Input type="date" value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Fim</Label><Input type="date" value={form.data_fim} onChange={e => setForm({ ...form, data_fim: e.target.value })} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Descrição</Label><Textarea rows={2} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Observações</Label><Textarea rows={2} value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" form="proj-form" disabled={create.isPending}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
