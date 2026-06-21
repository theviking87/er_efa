import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Pencil, Trash2, Plus } from "lucide-react";
import { EstadoBadge } from "./formadores";
import { FormadorDialog } from "@/components/formador-dialog";
import { fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/formadores/$id")({
  head: () => ({ meta: [{ title: "Formador — Gestão Pedagógica" }] }),
  component: FormadorDetail,
});

function FormadorDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const q = useQuery({
    queryKey: ["formador", id],
    queryFn: async () => {
      const [f, inat, docs] = await Promise.all([
        supabase.from("formadores").select("*").eq("id", id).maybeSingle(),
        supabase.from("formador_inatividades").select("*").eq("formador_id", id).order("data_inicio", { ascending: false }),
        supabase.from("formador_documentos").select("*").eq("formador_id", id).order("created_at", { ascending: false }),
      ]);
      if (f.error) throw f.error;
      return { f: f.data, inatividades: inat.data ?? [], documentos: docs.data ?? [] };
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("formadores").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Formador eliminado");
      qc.invalidateQueries({ queryKey: ["formadores"] });
      navigate({ to: "/formadores" });
    },
    onError: (e: any) => toast.error("Erro a eliminar", { description: e.message }),
  });

  if (q.isLoading) return <PageContainer><div className="text-muted-foreground">A carregar…</div></PageContainer>;
  if (!q.data?.f) return <PageContainer><div className="text-muted-foreground">Formador não encontrado.</div></PageContainer>;

  const f = q.data.f;

  return (
    <PageContainer>
      <div className="mb-4">
        <Link to="/formadores" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
          <ArrowLeft className="size-3.5" /> Formadores
        </Link>
      </div>
      <PageHeader
        title={f.nome}
        description={f.email ?? f.telemovel ?? "Sem contacto registado"}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="size-4" /> Editar</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-destructive hover:text-destructive"><Trash2 className="size-4" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminar formador?</AlertDialogTitle>
                  <AlertDialogDescription>Esta ação não pode ser revertida. Os documentos e períodos de inatividade serão também removidos.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => remove.mutate()}>Eliminar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        }
      />

      <div className="flex items-center gap-3 mb-6">
        <EstadoBadge estado={f.estado} />
        <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block size-2.5 rounded-full" style={{ background: f.cor }} />
          Cor de cronograma
        </div>
      </div>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="inatividades">Inatividades</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <Card><CardContent className="p-6 grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <Field label="NIF" value={f.nif} />
            <Field label="Cartão de Cidadão" value={f.cc} />
            <Field label="Validade CC" value={fmtDate(f.validade_cc)} />
            <Field label="Telemóvel" value={f.telemovel} />
            <Field label="Email" value={f.email} />
            <Field label="IBAN" value={f.iban} />
            <Field label="Morada" value={f.morada} />
            <Field label="Código Postal" value={[f.codigo_postal, f.localidade].filter(Boolean).join(" ")} />
            <Field label="Habilitações" value={f.habilitacoes} />
            <Field label="CCP" value={f.ccp} />
            <Field label="Validade CCP" value={fmtDate(f.validade_ccp)} />
            <div className="sm:col-span-2"><Field label="Observações" value={f.observacoes} /></div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="inatividades">
          <InatividadesTab formadorId={id} items={q.data.inatividades} onChange={() => qc.invalidateQueries({ queryKey: ["formador", id] })} />
        </TabsContent>

        <TabsContent value="documentos">
          <DocumentosTab formadorId={id} items={q.data.documentos} onChange={() => qc.invalidateQueries({ queryKey: ["formador", id] })} />
        </TabsContent>
      </Tabs>

      <FormadorDialog open={editing} onOpenChange={setEditing} initial={f as any} />
    </PageContainer>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

function InatividadesTab({ formadorId, items, onChange }: { formadorId: string; items: any[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ data_inicio: "", data_fim: "", motivo: "" });

  async function add() {
    if (!form.data_inicio || !form.data_fim) { toast.error("Datas obrigatórias"); return; }
    const { error } = await supabase.from("formador_inatividades").insert({ formador_id: formadorId, ...form });
    if (error) return toast.error(error.message);
    toast.success("Período adicionado");
    setForm({ data_inicio: "", data_fim: "", motivo: "" });
    setOpen(false); onChange();
  }
  async function del(id: string) {
    const { error } = await supabase.from("formador_inatividades").delete().eq("id", id);
    if (error) return toast.error(error.message);
    onChange();
  }

  return (
    <Card><CardContent className="p-6 space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" /> Adicionar período</Button>
      </div>
      {items.length === 0 ? <div className="text-sm text-muted-foreground text-center py-8">Sem períodos registados.</div> : (
        <div className="border rounded-md divide-y">
          {items.map(i => (
            <div key={i.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
              <div><span className="font-medium">{fmtDate(i.data_inicio)} → {fmtDate(i.data_fim)}</span>{i.motivo && <span className="text-muted-foreground"> · {i.motivo}</span>}</div>
              <Button variant="ghost" size="sm" onClick={() => del(i.id)}><Trash2 className="size-3.5" /></Button>
            </div>
          ))}
        </div>
      )}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Período de inatividade</AlertDialogTitle></AlertDialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Início *</Label><Input type="date" value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Fim *</Label><Input type="date" value={form.data_fim} onChange={e => setForm({ ...form, data_fim: e.target.value })} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Motivo</Label><Input value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} /></div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={add}>Adicionar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CardContent></Card>
  );
}

function DocumentosTab({ formadorId, items, onChange }: { formadorId: string; items: any[]; onChange: () => void }) {
  const [tipo, setTipo] = useState("CC");
  const [validade, setValidade] = useState("");
  const [uploading, setUploading] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `${formadorId}/${Date.now()}_${file.name}`;
    const up = await supabase.storage.from("formador-documentos").upload(path, file);
    if (up.error) { toast.error(up.error.message); setUploading(false); return; }
    const { error } = await supabase.from("formador_documentos").insert({
      formador_id: formadorId, tipo, nome: file.name, storage_path: path, validade: validade || null,
    });
    setUploading(false);
    e.target.value = "";
    if (error) return toast.error(error.message);
    toast.success("Documento carregado");
    setValidade("");
    onChange();
  }

  async function download(d: any) {
    const { data, error } = await supabase.storage.from("formador-documentos").createSignedUrl(d.storage_path, 60);
    if (error || !data) return toast.error("Erro a abrir documento");
    window.open(data.signedUrl, "_blank");
  }
  async function del(d: any) {
    await supabase.storage.from("formador-documentos").remove([d.storage_path]);
    await supabase.from("formador_documentos").delete().eq("id", d.id);
    onChange();
  }

  return (
    <Card><CardContent className="p-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_2fr] gap-3 items-end">
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={tipo} onChange={e => setTipo(e.target.value)}>
            {["CC","CCP","Habilitações","CV","Certificado","Outro"].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-1.5"><Label>Validade</Label><Input type="date" value={validade} onChange={e => setValidade(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Ficheiro</Label><Input type="file" onChange={onFile} disabled={uploading} /></div>
      </div>
      {uploading && <div className="text-xs text-muted-foreground">A carregar…</div>}
      {items.length === 0 ? <div className="text-sm text-muted-foreground text-center py-8">Sem documentos.</div> : (
        <div className="border rounded-md divide-y">
          {items.map(d => (
            <div key={d.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
              <div>
                <div className="font-medium">{d.tipo} · {d.nome}</div>
                <div className="text-xs text-muted-foreground">{fmtDate(d.created_at)}{d.validade && ` · válido até ${fmtDate(d.validade)}`}</div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => download(d)}>Abrir</Button>
                <Button variant="ghost" size="sm" onClick={() => del(d)}><Trash2 className="size-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </CardContent></Card>
  );
}
