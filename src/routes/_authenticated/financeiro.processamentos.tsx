import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Lock, Unlock, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/financeiro/processamentos")({
  head: () => ({ meta: [{ title: "Financeiro — Processamentos" }] }),
  component: ProcessamentosPage,
});

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function ProcessamentosPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ curso_id: "", ano: now.getFullYear(), mes: now.getMonth() + 1, observacoes: "" });
  const [fAno, setFAno] = useState<string>("all");
  const [fCurso, setFCurso] = useState<string>("all");

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
        curso_id: form.curso_id, ano: Number(form.ano), mes: Number(form.mes), observacoes: form.observacoes || null,
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

  const rows = (list.data ?? []).filter((r: any) =>
    (fAno === "all" || String(r.ano) === fAno) &&
    (fCurso === "all" || r.curso_id === fCurso)
  );
  const anos = Array.from(new Set((list.data ?? []).map((r: any) => r.ano))).sort((a, b) => b - a);

  return (
    <PageContainer>
      <PageHeader
        title="Processamentos"
        description="Processamentos financeiros mensais por curso."
        actions={<Button onClick={() => setOpen(true)}><Plus className="size-4 mr-1" /> Novo processamento</Button>}
      />

      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-wrap gap-3">
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
                  <th className="py-2 pr-3">Curso</th>
                  <th className="py-2 pr-3">Ano</th>
                  <th className="py-2 pr-3">Mês</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2 pr-3">Fecho</th>
                  <th className="py-2 pr-3 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id} className="border-b">
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
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm("Remover processamento e todos os lançamentos associados?")) remove.mutate(r.id); }}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Sem registos.</td></tr>}
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
