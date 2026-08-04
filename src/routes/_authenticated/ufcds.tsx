import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { compareUfcdCodigo } from "@/lib/utils";

type UfcdRow = {
  id: string;
  codigo: string;
  designacao: string;
  horas_referencia: number;
};

function compareUfcds(a: UfcdRow, b: UfcdRow) {
  return compareUfcdCodigo(a.codigo, b.codigo);
}

export const Route = createFileRoute("/_authenticated/ufcds")({
  head: () => ({ meta: [{ title: "UFCD — Gestão Pedagógica" }] }),
  component: UfcdsPage,
});

function UfcdsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UfcdRow | null>(null);
  const [replacementId, setReplacementId] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [form, setForm] = useState({ codigo: "", designacao: "", horas_referencia: 25 });
  const [q, setQ] = useState("");



  const list = useQuery({
    queryKey: ["ufcds"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ufcds").select("*");
      if (error) throw error;
      return (data ?? []).sort(compareUfcds);
    },
  });

  const usageMap = useQuery({
    queryKey: ["ufcds-usage-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("curso_ufcds")
        .select("ufcd_id, cursos(id, codigo, nome)");
      if (error) throw error;
      const map = new Map<string, { id: string; codigo: string; nome: string }[]>();
      for (const row of (data ?? []) as any[]) {
        if (!row.cursos) continue;
        const arr = map.get(row.ufcd_id) ?? [];
        if (!arr.find((c) => c.id === row.cursos.id)) arr.push(row.cursos);
        map.set(row.ufcd_id, arr);
      }
      return map;
    },
  });

  const deleteUsage = useQuery({
    queryKey: ["ufcd-usage", deleteTarget?.id],
    enabled: !!deleteTarget,
    queryFn: async () => {
      const { count, error } = await supabase
      .from("curso_ufcds")
      .select("id", { count: "exact", head: true })
      .eq("ufcd_id", deleteTarget!.id);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, horas_referencia: Number(form.horas_referencia) };
      if (editingId) {
        const { error } = await supabase.from("ufcds").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ufcds").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ufcds"] }); closeDialog(); toast.success(editingId ? "UFCD atualizada" : "UFCD criada"); },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  function closeDialog() {
    setOpen(false);
    setEditingId(null);
    setForm({ codigo: "", designacao: "", horas_referencia: 25 });
  }

  function openEdit(u: any) {
    setEditingId(u.id);
    setForm({ codigo: u.codigo, designacao: u.designacao, horas_referencia: u.horas_referencia });
    setOpen(true);
  }

  function openDelete(u: UfcdRow) {
    setDeleteTarget(u);
    setReplacementId("");
    setDeleteError("");
  }

  function closeDeleteDialog() {
    if (remove.isPending) return;
    setDeleteTarget(null);
    setReplacementId("");
    setDeleteError("");
  }

  const remove = useMutation({
    mutationFn: async ({ ufcd, substituteId }: { ufcd: UfcdRow; substituteId?: string }) => {
      const { data: usages, error: usageError } = await supabase
      .from("curso_ufcds")
      .select("id, curso_id, horas_totais, concluida")
      .eq("ufcd_id", ufcd.id);
      if (usageError) throw usageError;
      if ((usages?.length ?? 0) > 0) {
        if (!substituteId) throw new Error("Escolhe uma UFCD substituta antes de eliminar.");
        if (substituteId === ufcd.id) throw new Error("A UFCD substituta tem de ser diferente da UFCD a eliminar.");

        for (const usage of usages ?? []) {
          const { data: existing, error: existingError } = await supabase
          .from("curso_ufcds")
          .select("id, horas_totais, concluida")
          .eq("curso_id", usage.curso_id)
          .eq("ufcd_id", substituteId)
          .maybeSingle();
          if (existingError) throw existingError;

          if (existing) {
            const sourceTrainers = await supabase.from("curso_ufcd_formadores").select("formador_id").eq("curso_ufcd_id", usage.id);
            if (sourceTrainers.error) throw sourceTrainers.error;
            const targetTrainers = await supabase.from("curso_ufcd_formadores").select("formador_id").eq("curso_ufcd_id", existing.id);
            if (targetTrainers.error) throw targetTrainers.error;

            const currentTrainerIds = new Set((targetTrainers.data ?? []).map((row) => row.formador_id));
            const trainersToAdd = (sourceTrainers.data ?? [])
            .filter((row) => !currentTrainerIds.has(row.formador_id))
            .map((row) => ({ curso_ufcd_id: existing.id, formador_id: row.formador_id }));

            const sessionUpdate = await supabase.from("sessoes").update({ curso_ufcd_id: existing.id }).eq("curso_ufcd_id", usage.id);
            if (sessionUpdate.error) throw sessionUpdate.error;
            if (trainersToAdd.length) {
              const trainerInsert = await supabase.from("curso_ufcd_formadores").insert(trainersToAdd as never);
              if (trainerInsert.error) throw trainerInsert.error;
            }

            const merge = await supabase
            .from("curso_ufcds")
            .update({
              horas_totais: Number(existing.horas_totais) + Number(usage.horas_totais),
              concluida: Boolean(existing.concluida) && Boolean(usage.concluida),
            })
            .eq("id", existing.id);
            if (merge.error) throw merge.error;

            const sourceDelete = await supabase.from("curso_ufcds").delete().eq("id", usage.id);
            if (sourceDelete.error) throw sourceDelete.error;
          } else {
            const reassigned = await supabase.from("curso_ufcds").update({ ufcd_id: substituteId }).eq("id", usage.id);
            if (reassigned.error) throw reassigned.error;
          }
        }
      }
      const { error } = await supabase.from("ufcds").delete().eq("id", ufcd.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("UFCD eliminada");
      setDeleteTarget(null);
      setReplacementId("");
      setDeleteError("");
      qc.invalidateQueries({ queryKey: ["ufcds"] });
      qc.invalidateQueries({ queryKey: ["ufcds-usage-map"] });
      qc.invalidateQueries({ queryKey: ["curso-ufcds"] });
      qc.invalidateQueries({ queryKey: ["curso-ufcds-flat"] });
      qc.invalidateQueries({ queryKey: ["curso-carga"] });
      qc.invalidateQueries({ queryKey: ["sessoes"] });
      qc.invalidateQueries({ queryKey: ["sessoes-geral"] });
      qc.invalidateQueries({ queryKey: ["cursos-ativos-mes"] });
    },
    onError: (e: any) => {
      const message = e.message ?? "Não foi possível eliminar a UFCD.";
      setDeleteError(message);
      toast.error("Erro ao eliminar", { description: message });
    },
  });



  const filtered = (list.data ?? []).filter(u => !q || u.codigo.includes(q) || u.designacao.toLowerCase().includes(q.toLowerCase())).sort(compareUfcds);
  const replacementOptions = (list.data ?? []).filter((u) => u.id !== deleteTarget?.id).sort(compareUfcds);
  const usageCount = deleteUsage.data ?? 0;

  return (
    <PageContainer>
      <PageHeader
        title="Catálogo UFCD"
        description="Unidades de Formação de Curta Duração disponíveis para atribuir a cursos."
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Nova UFCD</Button>
          </div>
        }
      />
      <Input placeholder="Pesquisar…" value={q} onChange={e => setQ(e.target.value)} className="max-w-xs mb-4" />

      <div className="border rounded-md bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr><th className="text-left font-medium px-4 py-2.5">Código</th><th className="text-left font-medium px-4 py-2.5">Designação</th><th className="text-left font-medium px-4 py-2.5">Cursos atribuídos</th><th className="text-right font-medium px-4 py-2.5">Horas ref.</th><th className="px-4 py-2.5"></th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(u => {
              const cursos = usageMap.data?.get(u.id) ?? [];
              return (
              <tr key={u.id} className="hover:bg-muted/30">
                <td className="px-4 py-2.5 font-mono text-xs">{u.codigo}</td>
                <td className="px-4 py-2.5">{u.designacao}</td>
                <td className="px-4 py-2.5">
                  {cursos.length === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {cursos.map((c) => (
                        <span key={c.id} className="inline-flex items-center rounded-md border bg-muted/40 px-1.5 py-0.5 text-xs">
                          <span className="font-mono mr-1">{c.codigo}</span>
                          <span className="text-muted-foreground">{c.nome}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">{u.horas_referencia} h</td>
                <td className="px-4 py-2.5 text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(u)}><Pencil className="size-3.5" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => openDelete(u)}><Trash2 className="size-3.5" /></Button>
                </td>
              </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Sem UFCD no catálogo.</td></tr>}
          </tbody>
        </table>
      </div>


      <Dialog open={open} onOpenChange={(o) => o ? setOpen(true) : closeDialog()}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Editar UFCD" : "Nova UFCD"}</DialogTitle></DialogHeader>
          <form id="ufcd-form" onSubmit={e => { e.preventDefault(); save.mutate(); }} className="grid gap-3">
            <div className="space-y-1.5"><Label>Código *</Label><Input required value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Designação *</Label><Input required value={form.designacao} onChange={e => setForm({ ...form, designacao: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Horas de referência</Label><Input type="number" min={1} value={form.horas_referencia} onChange={e => setForm({ ...form, horas_referencia: Number(e.target.value) })} /></div>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>Cancelar</Button>
            <Button type="submit" form="ufcd-form" disabled={save.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && closeDeleteDialog()}>
        <DialogContent>
          <DialogHeader><DialogTitle>Eliminar UFCD</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Eliminar UFCD {deleteTarget?.codigo}? Esta ação é irreversível.
            </p>
            {deleteUsage.isLoading && <p className="text-muted-foreground">A verificar atribuições…</p>}
            {usageCount > 0 && (
              <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <p>
                    Esta UFCD está atribuída a {usageCount} curso(s). Escolhe a UFCD que a vai substituir nesses cursos antes de eliminar.
                  </p>
                </div>
                <Select value={replacementId} onValueChange={(v) => { setReplacementId(v); setDeleteError(""); }} disabled={replacementOptions.length === 0}>
                  <SelectTrigger className="bg-background text-foreground">
                    <SelectValue placeholder="UFCD substituta…" />
                  </SelectTrigger>
                  <SelectContent>
                    {replacementOptions.map((u) => <SelectItem key={u.id} value={u.id}>{u.codigo} — {u.designacao}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {deleteError && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">{deleteError}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={closeDeleteDialog} disabled={remove.isPending}>Cancelar</Button>
            <Button
              variant="destructive"
              type="button"
              disabled={remove.isPending || deleteUsage.isLoading || !deleteTarget || (usageCount > 0 && !replacementId)}
              onClick={() => deleteTarget && remove.mutate({ ufcd: deleteTarget, substituteId: replacementId || undefined })}
            >
              {remove.isPending ? "A eliminar…" : usageCount > 0 ? "Substituir e eliminar" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
