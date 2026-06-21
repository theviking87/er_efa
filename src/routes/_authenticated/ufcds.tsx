import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ufcds")({
  head: () => ({ meta: [{ title: "UFCD — Gestão Pedagógica" }] }),
  component: UfcdsPage,
});

function UfcdsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ codigo: "", designacao: "", horas_referencia: 25 });
  const [q, setQ] = useState("");

  const list = useQuery({
    queryKey: ["ufcds"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ufcds").select("*").order("codigo");
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("ufcds").insert({ ...form, horas_referencia: Number(form.horas_referencia) });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ufcds"] }); setOpen(false); setForm({ codigo: "", designacao: "", horas_referencia: 25 }); toast.success("UFCD criada"); },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  async function del(id: string) {
    const { error } = await supabase.from("ufcds").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["ufcds"] });
  }

  const filtered = (list.data ?? []).filter(u => !q || u.codigo.includes(q) || u.designacao.toLowerCase().includes(q.toLowerCase()));

  return (
    <PageContainer>
      <PageHeader
        title="Catálogo UFCD"
        description="Unidades de Formação de Curta Duração disponíveis para atribuir a cursos."
        actions={<Button onClick={() => setOpen(true)}><Plus className="size-4" /> Nova UFCD</Button>}
      />
      <Input placeholder="Pesquisar…" value={q} onChange={e => setQ(e.target.value)} className="max-w-xs mb-4" />

      <div className="border rounded-md bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr><th className="text-left font-medium px-4 py-2.5">Código</th><th className="text-left font-medium px-4 py-2.5">Designação</th><th className="text-right font-medium px-4 py-2.5">Horas ref.</th><th className="px-4 py-2.5"></th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(u => (
              <tr key={u.id} className="hover:bg-muted/30">
                <td className="px-4 py-2.5 font-mono text-xs">{u.codigo}</td>
                <td className="px-4 py-2.5">{u.designacao}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">{u.horas_referencia} h</td>
                <td className="px-4 py-2.5 text-right"><Button variant="ghost" size="sm" onClick={() => del(u.id)}><Trash2 className="size-3.5" /></Button></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">Sem UFCD no catálogo.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova UFCD</DialogTitle></DialogHeader>
          <form id="ufcd-form" onSubmit={e => { e.preventDefault(); save.mutate(); }} className="grid gap-3">
            <div className="space-y-1.5"><Label>Código *</Label><Input required value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Designação *</Label><Input required value={form.designacao} onChange={e => setForm({ ...form, designacao: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Horas de referência</Label><Input type="number" min={1} value={form.horas_referencia} onChange={e => setForm({ ...form, horas_referencia: Number(e.target.value) })} /></div>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" form="ufcd-form" disabled={save.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
