import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Upload, Sparkles, Check, AlertCircle, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { extrairReferencialPdf, importarReferencial } from "@/lib/import-referencial.functions";

export const Route = createFileRoute("/_authenticated/ufcds")({
  head: () => ({ meta: [{ title: "UFCD — Gestão Pedagógica" }] }),
  component: UfcdsPage,
});

type ExtractedUfcd = {
  codigo: string;
  designacao: string;
  horas: number;
  existe: boolean;
  existente: { id: string; designacao: string; horas_referencia: number } | null;
  incluir: boolean;
};

function UfcdsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ codigo: "", designacao: "", horas_referencia: 25 });
  const [q, setQ] = useState("");

  // Importação referencial
  const [impOpen, setImpOpen] = useState(false);
  const [impFile, setImpFile] = useState<File | null>(null);
  const [impLoading, setImpLoading] = useState(false);
  const [impSaving, setImpSaving] = useState(false);
  const [impRows, setImpRows] = useState<ExtractedUfcd[]>([]);
  const extrair = useServerFn(extrairReferencialPdf);
  const importar = useServerFn(importarReferencial);

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

  async function del(id: string) {
    const { error } = await supabase.from("ufcds").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["ufcds"] });
  }

  async function onExtract() {
    if (!impFile) return toast.error("Seleciona um PDF");
    setImpLoading(true);
    try {
      const b64 = await fileToBase64(impFile);
      const r = await extrair({ data: { pdfBase64: b64, filename: impFile.name } });
      setImpRows(r.ufcds.map((u) => ({ ...u, incluir: !u.existe })));
      toast.success(`${r.ufcds.length} UFCD encontradas`);
    } catch (e: any) {
      toast.error(e.message ?? "Falhou a extração");
    } finally {
      setImpLoading(false);
    }
  }

  async function onImport() {
    const novos = impRows.filter((r) => r.incluir && !r.existe);
    if (!novos.length) return toast.error("Nada para importar");
    setImpSaving(true);
    try {
      const r = await importar({ data: { ufcds: novos.map((n) => ({ codigo: n.codigo, designacao: n.designacao, horas: n.horas })) } });
      toast.success(`${r.criados} UFCD criadas`);
      qc.invalidateQueries({ queryKey: ["ufcds"] });
      setImpOpen(false); setImpFile(null); setImpRows([]);
    } catch (e: any) {
      toast.error(e.message ?? "Falhou a importação");
    } finally {
      setImpSaving(false);
    }
  }

  const filtered = (list.data ?? []).filter(u => !q || u.codigo.includes(q) || u.designacao.toLowerCase().includes(q.toLowerCase()));
  const novosCount = impRows.filter((r) => !r.existe).length;
  const existentesCount = impRows.filter((r) => r.existe).length;

  return (
    <PageContainer>
      <PageHeader
        title="Catálogo UFCD"
        description="Unidades de Formação de Curta Duração disponíveis para atribuir a cursos."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImpOpen(true)}><Upload className="size-4" /> Importar referencial</Button>
            <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Nova UFCD</Button>
          </div>
        }
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

      <Dialog open={impOpen} onOpenChange={(o) => { setImpOpen(o); if (!o) { setImpFile(null); setImpRows([]); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Importar referencial de formação</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2 border-b pb-3">
            <Input type="file" accept="application/pdf" onChange={(e) => setImpFile(e.target.files?.[0] ?? null)} />
            <Button onClick={onExtract} disabled={!impFile || impLoading}>
              <Sparkles className="size-4" /> {impLoading ? "A ler…" : "Extrair"}
            </Button>
          </div>

          {impRows.length > 0 && (
            <>
              <div className="flex gap-3 text-xs text-muted-foreground py-2">
                <span className="flex items-center gap-1"><Check className="size-3 text-green-600" /> {novosCount} novas</span>
                <span className="flex items-center gap-1"><AlertCircle className="size-3 text-amber-600" /> {existentesCount} já existem</span>
              </div>
              <div className="overflow-auto border rounded-md flex-1">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground sticky top-0">
                    <tr>
                      <th className="px-2 py-2 w-10"></th>
                      <th className="px-2 py-2 text-left">Código</th>
                      <th className="px-2 py-2 text-left">Designação</th>
                      <th className="px-2 py-2 text-right">Horas</th>
                      <th className="px-2 py-2 text-left">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {impRows.map((r, i) => (
                      <tr key={i} className={r.existe ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}>
                        <td className="px-2 py-1.5 text-center">
                          <input type="checkbox" disabled={r.existe} checked={r.incluir && !r.existe}
                            onChange={(e) => setImpRows(rs => rs.map((x, idx) => idx === i ? { ...x, incluir: e.target.checked } : x))} />
                        </td>
                        <td className="px-2 py-1.5 font-mono text-xs">
                          <Input value={r.codigo} onChange={(e) => setImpRows(rs => rs.map((x, idx) => idx === i ? { ...x, codigo: e.target.value } : x))} className="h-7 text-xs" />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input value={r.designacao} onChange={(e) => setImpRows(rs => rs.map((x, idx) => idx === i ? { ...x, designacao: e.target.value } : x))} className="h-7 text-xs" />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <Input type="number" min={1} value={r.horas} onChange={(e) => setImpRows(rs => rs.map((x, idx) => idx === i ? { ...x, horas: Number(e.target.value) } : x))} className="h-7 text-xs w-20 ml-auto" />
                        </td>
                        <td className="px-2 py-1.5">
                          {r.existe ? (
                            <span className="text-xs text-amber-700 dark:text-amber-400">Já existe ({r.existente?.horas_referencia}h)</span>
                          ) : (
                            <span className="text-xs text-green-700 dark:text-green-400">Nova</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setImpOpen(false)}>Fechar</Button>
            <Button onClick={onImport} disabled={impSaving || !impRows.some(r => r.incluir && !r.existe)}>
              {impSaving ? "A importar…" : `Criar ${impRows.filter(r => r.incluir && !r.existe).length} UFCD`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result ?? "");
      resolve(s.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
