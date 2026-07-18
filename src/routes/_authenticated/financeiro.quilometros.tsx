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

export const Route = createFileRoute("/_authenticated/financeiro/quilometros")({
  head: () => ({ meta: [{ title: "Financeiro — Quilómetros" }] }),
  component: QuilometrosPage,
});

const eur = (n: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n || 0);

function QuilometrosPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fProc, setFProc] = useState<string>("all");
  const [form, setForm] = useState({
    processamento_id: "", formando_id: "", data: new Date().toISOString().slice(0, 10),
    origem: "", destino: "", km: 0, valor_km: 0.4,
  });

  const procs = useQuery({ queryKey: ["fin-procs-min"], queryFn: async () => {
    const { data, error } = await supabase.from("financeiro_processamentos").select("id, ano, mes, cursos(codigo)").order("ano", { ascending: false });
    if (error) throw error; return data ?? [];
  } });
  const formandos = useQuery({ queryKey: ["formandos-min"], queryFn: async () => {
    const { data, error } = await supabase.from("formandos").select("id, nome").order("nome"); if (error) throw error; return data ?? [];
  } });
  const list = useQuery({ queryKey: ["financeiro-km"], queryFn: async () => {
    const { data, error } = await supabase.from("financeiro_quilometros")
      .select("*, formandos(nome), financeiro_processamentos(ano, mes, cursos(codigo))").order("data", { ascending: false });
    if (error) throw error; return data ?? [];
  } });

  const rows = (list.data ?? []).filter((r: any) => fProc === "all" || r.processamento_id === fProc);
  const total = useMemo(() => rows.reduce((s: number, r: any) => s + Number(r.total || 0), 0), [rows]);

  const create = useMutation({
    mutationFn: async () => {
      if (!form.processamento_id || !form.formando_id) throw new Error("Escolhe processamento e formando");
      const total = Number(form.km) * Number(form.valor_km);
      const { error } = await supabase.from("financeiro_quilometros").insert({ ...form, total });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["financeiro-km"] }); setOpen(false); toast.success("Deslocação registada"); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("financeiro_quilometros").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financeiro-km"] }),
  });

  return (
    <PageContainer>
      <PageHeader title="Quilómetros" description="Deslocações reembolsadas por formando." actions={
        <Button onClick={() => setOpen(true)}><Plus className="size-4 mr-1" /> Nova deslocação</Button>
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
        <CardHeader><CardTitle className="text-base">{rows.length} deslocação(ões)</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr><th className="py-2 pr-3">Data</th><th className="py-2 pr-3">Formando</th><th className="py-2 pr-3">Origem → Destino</th><th className="py-2 pr-3 text-right">Km</th><th className="py-2 pr-3 text-right">€/km</th><th className="py-2 pr-3 text-right">Total</th><th className="w-10"></th></tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id} className="border-b">
                    <td className="py-2 pr-3">{new Date(r.data).toLocaleDateString("pt-PT")}</td>
                    <td className="py-2 pr-3">{r.formandos?.nome ?? "—"}</td>
                    <td className="py-2 pr-3">{r.origem} → {r.destino}</td>
                    <td className="py-2 pr-3 text-right">{Number(r.km)}</td>
                    <td className="py-2 pr-3 text-right">{eur(Number(r.valor_km))}</td>
                    <td className="py-2 pr-3 text-right font-medium">{eur(Number(r.total))}</td>
                    <td className="py-2 pr-3 text-right"><Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)}><Trash2 className="size-4 text-destructive" /></Button></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Sem deslocações.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova deslocação</DialogTitle></DialogHeader>
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
              <div><Label>Data</Label><Input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} /></div>
              <div><Label>Km</Label><Input type="number" step="0.1" value={form.km} onChange={e => setForm(f => ({ ...f, km: Number(e.target.value) }))} /></div>
              <div><Label>Origem</Label><Input value={form.origem} onChange={e => setForm(f => ({ ...f, origem: e.target.value }))} /></div>
              <div><Label>Destino</Label><Input value={form.destino} onChange={e => setForm(f => ({ ...f, destino: e.target.value }))} /></div>
              <div><Label>€ / Km</Label><Input type="number" step="0.001" value={form.valor_km} onChange={e => setForm(f => ({ ...f, valor_km: Number(e.target.value) }))} /></div>
            </div>
            <div className="text-sm text-muted-foreground">Total: <b>{eur(form.km * form.valor_km)}</b></div>
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
