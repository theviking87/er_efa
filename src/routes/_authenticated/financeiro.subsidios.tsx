import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/financeiro/subsidios")({
  head: () => ({ meta: [{ title: "Financeiro — Subsídio de Alimentação" }] }),
  component: SubsidiosPage,
});

const eur = (n: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n || 0);

function SubsidiosPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fProc, setFProc] = useState<string>("all");
  const [form, setForm] = useState({ processamento_id: "", formando_id: "", dias: 0, valor_dia: 6 });

  const procs = useQuery({ queryKey: ["fin-procs-min"], queryFn: async () => {
    const { data, error } = await supabase.from("financeiro_processamentos").select("id, ano, mes, cursos(codigo)").order("ano", { ascending: false });
    if (error) throw error; return data ?? [];
  } });
  const formandos = useQuery({ queryKey: ["formandos-min"], queryFn: async () => {
    const { data, error } = await supabase.from("formandos").select("id, nome").order("nome");
    if (error) throw error; return data ?? [];
  } });
  const list = useQuery({ queryKey: ["financeiro-subsidios"], queryFn: async () => {
    const { data, error } = await supabase.from("financeiro_subsidios")
      .select("*, formandos(nome), financeiro_processamentos(ano, mes, cursos(codigo))").order("created_at", { ascending: false });
    if (error) throw error; return data ?? [];
  } });

  const rows = (list.data ?? []).filter((r: any) => fProc === "all" || r.processamento_id === fProc);
  const total = useMemo(() => rows.reduce((s: number, r: any) => s + Number(r.total || 0), 0), [rows]);

  const create = useMutation({
    mutationFn: async () => {
      if (!form.processamento_id || !form.formando_id) throw new Error("Escolhe processamento e formando");
      const total = Number(form.dias) * Number(form.valor_dia);
      const { error } = await supabase.from("financeiro_subsidios").insert({ ...form, total });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["financeiro-subsidios"] }); setOpen(false); toast.success("Subsídio registado"); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("financeiro_subsidios").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financeiro-subsidios"] }),
  });

  return (
    <PageContainer>
      <PageHeader title="Subsídio de Alimentação" description="Registo de dias e valor diário por formando." actions={
        <Button onClick={() => setOpen(true)}><Plus className="size-4 mr-1" /> Novo lançamento</Button>
      } />

      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-wrap gap-3 items-end">
          <div className="min-w-[260px]">
            <Label>Processamento</Label>
            <Select value={fProc} onValueChange={setFProc}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(procs.data ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.cursos?.codigo} — {p.ano}/{String(p.mes).padStart(2, "0")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto text-right"><div className="text-xs text-muted-foreground">Total</div><div className="text-xl font-bold">{eur(total)}</div></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{rows.length} lançamento(s)</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b">
              <tr><th className="py-2 pr-3">Formando</th><th className="py-2 pr-3">Curso/Mês</th><th className="py-2 pr-3 text-right">Dias</th><th className="py-2 pr-3 text-right">€/dia</th><th className="py-2 pr-3 text-right">Total</th><th className="w-10"></th></tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2 pr-3">{r.formandos?.nome ?? "—"}</td>
                  <td className="py-2 pr-3 text-xs">{r.financeiro_processamentos?.cursos?.codigo} · {r.financeiro_processamentos?.ano}/{String(r.financeiro_processamentos?.mes).padStart(2, "0")}</td>
                  <td className="py-2 pr-3 text-right">{r.dias}</td>
                  <td className="py-2 pr-3 text-right">{eur(Number(r.valor_dia))}</td>
                  <td className="py-2 pr-3 text-right font-medium">{eur(Number(r.total))}</td>
                  <td className="py-2 pr-3 text-right"><Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)}><Trash2 className="size-4 text-destructive" /></Button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Sem lançamentos.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo subsídio</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Processamento</Label>
              <Select value={form.processamento_id} onValueChange={v => setForm(f => ({ ...f, processamento_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Escolher…" /></SelectTrigger>
                <SelectContent>{(procs.data ?? []).map((p: any) => (<SelectItem key={p.id} value={p.id}>{p.cursos?.codigo} — {p.ano}/{String(p.mes).padStart(2, "0")}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div><Label>Formando</Label>
              <Select value={form.formando_id} onValueChange={v => setForm(f => ({ ...f, formando_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Escolher…" /></SelectTrigger>
                <SelectContent>{(formandos.data ?? []).map((f: any) => (<SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Dias</Label><Input type="number" value={form.dias} onChange={e => setForm(f => ({ ...f, dias: Number(e.target.value) }))} /></div>
              <div><Label>Valor / dia</Label><Input type="number" step="0.01" value={form.valor_dia} onChange={e => setForm(f => ({ ...f, valor_dia: Number(e.target.value) }))} /></div>
            </div>
            <div className="text-sm text-muted-foreground">Total: <b>{eur(form.dias * form.valor_dia)}</b></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>Registar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
