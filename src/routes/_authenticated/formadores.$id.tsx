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
import { EstadoBadge } from "./formadores.index";
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
          <TabsTrigger value="competencias">Competências</TabsTrigger>
          <TabsTrigger value="disponibilidades">Disponibilidades</TabsTrigger>
          <TabsTrigger value="inatividades">Inatividades</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <Card><CardContent className="p-6 grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <Field label="NIF" value={f.nif} />
            <Field label="Cartão de Cidadão" value={f.cc} />
            <Field label="Validade CC" value={fmtDate(f.validade_cc)} />
            <Field label="Data de Nascimento" value={fmtDate((f as any).data_nascimento)} />
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

        <TabsContent value="competencias">
          <CompetenciasTab formadorId={id} />
        </TabsContent>

        <TabsContent value="disponibilidades">
          <DisponibilidadesTab formadorId={id} />
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

function DisponibilidadesTab({ formadorId }: { formadorId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ data: "", hora_inicio: "09:00", hora_fim: "18:00", tipo: "disponivel" as "disponivel" | "indisponivel", notas: "", curso_id: "" });

  const q = useQuery({
    queryKey: ["disponibilidades", formadorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formador_disponibilidades" as any)
        .select("*, curso:cursos(id, codigo, nome)")
        .eq("formador_id", formadorId)
        .order("data", { ascending: false })
        .order("hora_inicio");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Cursos ativos (para associar a disponibilidade)
  const cursosFormador = useQuery({
    queryKey: ["cursos-ativos-para-disp"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cursos")
        .select("id, codigo, nome")
        .eq("estado", "ativo")
        .order("codigo");
      if (error) throw error;
      return (data ?? []) as { id: string; codigo: string; nome: string }[];
    },
  });

  async function add() {
    if (!form.data) { toast.error("Data obrigatória"); return; }
    if (form.hora_fim <= form.hora_inicio) { toast.error("Hora fim tem de ser depois da hora início"); return; }
    // verificar sobreposição com disponibilidades já lançadas nesse dia
    const { data: existentes } = await supabase
      .from("formador_disponibilidades" as any)
      .select("hora_inicio, hora_fim, tipo")
      .eq("formador_id", formadorId)
      .eq("data", form.data);
    const hi = form.hora_inicio + (form.hora_inicio.length === 5 ? ":00" : "");
    const hf = form.hora_fim + (form.hora_fim.length === 5 ? ":00" : "");
    const sobreposta = ((existentes ?? []) as any[]).find(
      (d) => !(hf <= d.hora_inicio || hi >= d.hora_fim)
    );
    if (sobreposta) {
      toast.error("Já existe disponibilidade neste período", {
        description: `${sobreposta.tipo === "disponivel" ? "Disponível" : "Indisponível"} ${String(sobreposta.hora_inicio).slice(0,5)}–${String(sobreposta.hora_fim).slice(0,5)} já registado neste dia.`,
      });
      return;
    }
    const payload = {
      formador_id: formadorId,
      data: form.data,
      hora_inicio: form.hora_inicio,
      hora_fim: form.hora_fim,
      tipo: form.tipo,
      notas: form.notas,
      curso_id: form.curso_id || null,
    };
    const { error } = await supabase.from("formador_disponibilidades" as any).insert(payload as any);
    if (error) return toast.error(error.message);
    toast.success("Disponibilidade adicionada");
    setForm({ data: "", hora_inicio: "09:00", hora_fim: "18:00", tipo: "disponivel", notas: "", curso_id: "" });
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["disponibilidades", formadorId] });
    qc.invalidateQueries({ queryKey: ["disp-geral"] });
  }


  async function del(id: string) {
    const { error } = await supabase.from("formador_disponibilidades" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["disponibilidades", formadorId] });
  }

  const items = q.data ?? [];

  return (
    <Card><CardContent className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">{items.length} {items.length === 1 ? "registo" : "registos"}</div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" /> Adicionar</Button>
      </div>

      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">Sem disponibilidades registadas.</div>
      ) : (
        <div className="border rounded-md divide-y">
          {items.map((i: any) => (
            <div key={i.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <span className={"inline-block size-2 rounded-full " + (i.tipo === "disponivel" ? "bg-emerald-500" : "bg-rose-500")} />
                <div>
                  <div className="font-medium">{fmtDate(i.data)} · {i.hora_inicio?.slice(0,5)}–{i.hora_fim?.slice(0,5)}</div>
                  <div className="text-xs text-muted-foreground">
                    {i.tipo === "disponivel" ? "Disponível" : "Indisponível"}
                    {i.curso?.codigo && ` · ${i.curso.codigo}`}
                    {i.notas && ` · ${i.notas}`}
                  </div>

                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => del(i.id)}><Trash2 className="size-3.5" /></Button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Nova disponibilidade</AlertDialogTitle></AlertDialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5"><Label>Data *</Label><Input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Início *</Label><Input type="time" value={form.hora_inicio} onChange={e => setForm({ ...form, hora_inicio: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Fim *</Label><Input type="time" value={form.hora_fim} onChange={e => setForm({ ...form, hora_fim: e.target.value })} /></div>
            <div className="col-span-2 space-y-1.5">
              <Label>Tipo</Label>
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as any })}>
                <option value="disponivel">Disponível</option>
                <option value="indisponivel">Indisponível</option>
              </select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Curso (opcional)</Label>
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.curso_id} onChange={e => setForm({ ...form, curso_id: e.target.value })}>
                <option value="">— Nenhum —</option>
                {(cursosFormador.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2 space-y-1.5"><Label>Notas</Label><Input value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} /></div>
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

function CompetenciasTab({ formadorId }: { formadorId: string }) {
  const qc = useQueryClient();
  const [ufcdId, setUfcdId] = useState("");

  const q = useQuery({
    queryKey: ["formador-competencias", formadorId],
    queryFn: async () => {
      const [comp, sess] = await Promise.all([
        supabase.from("formador_ufcds" as any).select("id, ufcd_id, ufcd:ufcds(id, codigo, designacao)").eq("formador_id", formadorId),
        supabase.from("sessoes").select("horas, curso_ufcd:curso_ufcds(ufcd_id)").eq("formador_id", formadorId),
      ]);
      const horasPorUfcd = new Map<string, number>();
      for (const s of (sess.data ?? []) as any[]) {
        const uid = s.curso_ufcd?.ufcd_id;
        if (!uid) continue;
        horasPorUfcd.set(uid, (horasPorUfcd.get(uid) ?? 0) + Number(s.horas ?? 0));
      }
      const items = ((comp.data ?? []) as any[]).map(c => ({
        id: c.id,
        ufcd_id: c.ufcd_id,
        codigo: c.ufcd?.codigo ?? "",
        designacao: c.ufcd?.designacao ?? "",
        horas_lecionadas: horasPorUfcd.get(c.ufcd_id) ?? 0,
      }));
      items.sort((a, b) => {
        const ac = a.codigo, bc = b.codigo;
        const aIsLetter = /^[A-Za-z]/.test(ac), bIsLetter = /^[A-Za-z]/.test(bc);
        if (aIsLetter !== bIsLetter) return aIsLetter ? -1 : 1;
        return ac.localeCompare(bc, "pt", { numeric: true });
      });
      return items;
    },
  });

  const ufcdsQ = useQuery({
    queryKey: ["ufcds-all"],
    queryFn: async () => (await supabase.from("ufcds").select("id, codigo, designacao").order("codigo")).data ?? [],
  });

  const taken = new Set((q.data ?? []).map(i => i.ufcd_id));
  const disponiveis = (ufcdsQ.data ?? []).filter((u: any) => !taken.has(u.id));

  async function add() {
    if (!ufcdId) return toast.error("Escolha uma UFCD");
    const { error } = await supabase.from("formador_ufcds" as any).insert({ formador_id: formadorId, ufcd_id: ufcdId } as any);
    if (error) return toast.error(error.message);
    toast.success("Competência adicionada");
    setUfcdId("");
    qc.invalidateQueries({ queryKey: ["formador-competencias", formadorId] });
  }

  async function del(id: string) {
    const { error } = await supabase.from("formador_ufcds" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["formador-competencias", formadorId] });
  }

  return (
    <Card><CardContent className="p-6 space-y-4">
      <div className="flex gap-2 items-end">
        <div className="flex-1 space-y-1.5">
          <Label>Adicionar UFCD</Label>
          <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={ufcdId} onChange={e => setUfcdId(e.target.value)}>
            <option value="">Escolher…</option>
            {disponiveis.map((u: any) => <option key={u.id} value={u.id}>{u.codigo} — {u.designacao}</option>)}
          </select>
        </div>
        <Button onClick={add} disabled={!ufcdId}><Plus className="size-4" /> Adicionar</Button>
      </div>

      {(q.data ?? []).length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">Sem UFCDs registadas.</div>
      ) : (
        <div className="border rounded-md divide-y">
          <div className="px-4 py-2 grid grid-cols-[1fr_auto_auto] gap-4 items-center text-xs uppercase tracking-wide text-muted-foreground">
            <div>UFCD</div>
            <div>Horas lecionadas</div>
            <div></div>
          </div>
          {(q.data ?? []).map((i) => (
            <div key={i.id} className="px-4 py-2.5 grid grid-cols-[1fr_auto_auto] gap-4 items-center text-sm">
              <div><span className="font-medium">{i.codigo}</span> — {i.designacao}</div>
              <div className="tabular-nums text-right">{i.horas_lecionadas.toFixed(1)} h</div>
              <Button variant="ghost" size="sm" onClick={() => del(i.id)}><Trash2 className="size-3.5" /></Button>
            </div>
          ))}
        </div>
      )}
    </CardContent></Card>
  );
}
