import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Lock, Unlock, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { listarRubricas } from "@/lib/financeiro/services/rubricas";

export const Route = createFileRoute("/_authenticated/financeiro/processamentos")({
  head: () => ({ meta: [{ title: "Financeiro — Processamentos" }] }),
  component: ProcessamentosPage,
});

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// Preparação para multi-projeto — por agora catálogo estático guardado
// como prefixo no campo observacoes ("[projeto: X] resto"). Migração futura
// substituirá isto por coluna dedicada.
const PROJETOS = ["Projeto principal"];
const PROJ_RE = /^\[projeto:\s*([^\]]+)\]\s*/i;
function parseObs(obs: string | null): { projeto: string; texto: string } {
  if (!obs) return { projeto: PROJETOS[0], texto: "" };
  const m = obs.match(PROJ_RE);
  return { projeto: m?.[1]?.trim() || PROJETOS[0], texto: m ? obs.replace(PROJ_RE, "") : obs };
}
function buildObs(projeto: string, texto: string): string | null {
  const t = (texto || "").trim();
  const p = (projeto || "").trim() || PROJETOS[0];
  const s = `[projeto: ${p}] ${t}`.trim();
  return s || null;
}

function ProcessamentosPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ projeto: PROJETOS[0], curso_id: "", ano: now.getFullYear(), mes: now.getMonth() + 1, observacoes: "" });
  const [fAno, setFAno] = useState<string>("all");
  const [fCurso, setFCurso] = useState<string>("all");
  const [fProjeto, setFProjeto] = useState<string>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const cursos = useQuery({
    queryKey: ["cursos-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cursos").select("id, codigo, nome").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const list = useQuery({
    queryKey: ["financeiro-processamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financeiro_processamentos")
        .select("*, cursos(id, codigo, nome)")
        .order("ano", { ascending: false })
        .order("mes", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.curso_id) throw new Error("Escolhe um curso");
      const { error } = await supabase.from("financeiro_processamentos").insert({
        curso_id: form.curso_id, ano: Number(form.ano), mes: Number(form.mes),
        observacoes: buildObs(form.projeto, form.observacoes),
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["financeiro-processamentos"] }); setOpen(false); toast.success("Processamento criado"); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (row: any) => {
      const novo = row.estado === "aberto" ? "fechado" : "aberto";
      const { error } = await supabase.from("financeiro_processamentos")
        .update({ estado: novo, data_fecho: novo === "fechado" ? new Date().toISOString() : null })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financeiro-processamentos"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financeiro_processamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["financeiro-processamentos"] }); toast.success("Removido"); },
  });

  const rows = (list.data ?? []).filter((r: any) => {
    const { projeto } = parseObs(r.observacoes);
    return (fAno === "all" || String(r.ano) === fAno)
      && (fCurso === "all" || r.curso_id === fCurso)
      && (fProjeto === "all" || projeto === fProjeto);
  });
  const anos = Array.from(new Set((list.data ?? []).map((r: any) => r.ano))).sort((a, b) => b - a);

  return (
    <PageContainer>
      <PageHeader
        title="Processamentos"
        description="Processamentos financeiros mensais por projeto e curso."
        actions={<Button onClick={() => setOpen(true)}><Plus className="size-4 mr-1" /> Novo processamento</Button>}
      />

      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-wrap gap-3">
          <div className="min-w-[180px]">
            <Label>Projeto</Label>
            <Select value={fProjeto} onValueChange={setFProjeto}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {PROJETOS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[160px]">
            <Label>Ano</Label>
            <Select value={fAno} onValueChange={setFAno}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {anos.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[220px]">
            <Label>Curso</Label>
            <Select value={fCurso} onValueChange={setFCurso}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(cursos.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.codigo} — {c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{rows.length} processamento(s)</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="w-8"></th>
                  <th className="py-2 pr-3">Projeto</th>
                  <th className="py-2 pr-3">Curso</th>
                  <th className="py-2 pr-3">Ano</th>
                  <th className="py-2 pr-3">Mês</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2 pr-3">Fecho</th>
                  <th className="py-2 pr-3 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => {
                  const { projeto } = parseObs(r.observacoes);
                  const isOpen = !!expanded[r.id];
                  return (
                    <>
                      <tr key={r.id} className="border-b">
                        <td className="py-2 pr-1">
                          <Button size="sm" variant="ghost" onClick={() => setExpanded(e => ({ ...e, [r.id]: !e[r.id] }))}>
                            {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </Button>
                        </td>
                        <td className="py-2 pr-3 text-xs">{projeto}</td>
                        <td className="py-2 pr-3">{r.cursos ? `${r.cursos.codigo} — ${r.cursos.nome}` : "—"}</td>
                        <td className="py-2 pr-3">{r.ano}</td>
                        <td className="py-2 pr-3">{MESES[r.mes - 1]}</td>
                        <td className="py-2 pr-3">
                          <Badge variant={r.estado === "aberto" ? "default" : "secondary"}>{r.estado}</Badge>
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">{r.data_fecho ? new Date(r.data_fecho).toLocaleDateString("pt-PT") : "—"}</td>
                        <td className="py-2 pr-3 text-right">
                          <Button size="sm" variant="ghost" onClick={() => toggle.mutate(r)} title={r.estado === "aberto" ? "Fechar" : "Reabrir"}>
                            {r.estado === "aberto" ? <Lock className="size-4" /> : <Unlock className="size-4" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { if (confirm("Remover processamento?")) remove.mutate(r.id); }}>
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${r.id}-det`} className="border-b bg-muted/30">
                          <td colSpan={8} className="p-4">
                            <ProcessamentoDetalhe cursoId={r.curso_id} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Sem registos.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo processamento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Projeto</Label>
              <Select value={form.projeto} onValueChange={v => setForm(f => ({ ...f, projeto: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PROJETOS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Curso</Label>
              <Select value={form.curso_id} onValueChange={v => setForm(f => ({ ...f, curso_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Escolher curso…" /></SelectTrigger>
                <SelectContent>
                  {(cursos.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.codigo} — {c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ano</Label>
                <Input type="number" value={form.ano} onChange={e => setForm(f => ({ ...f, ano: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>Mês</Label>
                <Select value={String(form.mes)} onValueChange={v => setForm(f => ({ ...f, mes: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Input value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function ProcessamentoDetalhe({ cursoId }: { cursoId: string }) {
  // Carrega formandos inscritos + rubricas elegíveis.
  // Placeholder — cálculos automáticos não implementados nesta fase.
  const formandos = useQuery({
    queryKey: ["proc-formandos", cursoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("curso_formandos")
        .select("estado, formandos(id, nome)")
        .eq("curso_id", cursoId);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const rubricasElegiveis = useQuery({
    queryKey: ["proc-formandos-rubs", cursoId, formandos.data?.length],
    enabled: !!formandos.data?.length,
    queryFn: async () => {
      const ids = (formandos.data ?? []).map((f: any) => f.formandos?.id).filter(Boolean);
      if (!ids.length) return new Map<string, any[]>();
      const { data } = await (supabase as any)
        .from("fin_formando_rubricas")
        .select("formando_id, elegivel, fin_rubricas(codigo, descricao)")
        .in("formando_id", ids)
        .eq("elegivel", true);
      const map = new Map<string, any[]>();
      (data ?? []).forEach((r: any) => {
        const arr = map.get(r.formando_id) ?? [];
        arr.push(r);
        map.set(r.formando_id, arr);
      });
      return map;
    },
  });

  const linhas = useMemo(() => (formandos.data ?? []).map((cf: any) => ({
    formando_id: cf.formandos?.id,
    nome: cf.formandos?.nome ?? "—",
    estado: cf.estado ?? "—",
    rubricas: rubricasElegiveis.data?.get(cf.formandos?.id) ?? [],
  })), [formandos.data, rubricasElegiveis.data]);

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Formandos deste processamento ({linhas.length})</div>
      <div className="overflow-x-auto rounded-md border bg-background">
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="py-2 px-2">Nome</th>
              <th className="py-2 px-2">Estado</th>
              <th className="py-2 px-2">Rubricas atribuídas</th>
              <th className="py-2 px-2 text-right">Horas previstas</th>
              <th className="py-2 px-2 text-right">Horas frequentadas</th>
              <th className="py-2 px-2 text-right">Valor calculado</th>
              <th className="py-2 px-2 text-right">Valor aprovado</th>
              <th className="py-2 px-2">Observações</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => (
              <tr key={l.formando_id} className="border-b">
                <td className="py-2 px-2">{l.nome}</td>
                <td className="py-2 px-2"><Badge variant="secondary">{l.estado}</Badge></td>
                <td className="py-2 px-2">
                  {l.rubricas.length
                    ? l.rubricas.map((r: any) => r.fin_rubricas?.codigo).filter(Boolean).join(", ")
                    : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="py-2 px-2 text-right text-muted-foreground">—</td>
                <td className="py-2 px-2 text-right text-muted-foreground">—</td>
                <td className="py-2 px-2 text-right text-muted-foreground">—</td>
                <td className="py-2 px-2 text-right text-muted-foreground">—</td>
                <td className="py-2 px-2 text-muted-foreground">—</td>
              </tr>
            ))}
            {!linhas.length && <tr><td colSpan={8} className="py-4 text-center text-muted-foreground">Sem formandos inscritos.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-muted-foreground">Cálculos automáticos ainda não ativos — colunas mostradas como placeholder.</div>
    </div>
  );
}
