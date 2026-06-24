import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Pencil, Trash2, Download, Upload } from "lucide-react";
import { EstadoFormandoBadge } from "./formandos.index";
import { FormandoDialog } from "@/components/formando-dialog";
import { fmtDate, INSCRICAO_ESTADO_LABEL } from "@/lib/format";
import { compareUfcdCodigo } from "@/lib/utils";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/formandos/$id")({
  head: () => ({ meta: [{ title: "Formando — Gestão Pedagógica" }] }),
  component: FormandoDetail,
});

function FormandoDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const q = useQuery({
    queryKey: ["formando", id],
    queryFn: async () => {
      const [f, ins] = await Promise.all([
        supabase.from("formandos").select("*").eq("id", id).maybeSingle(),
        supabase.from("curso_formandos")
          .select("id, data_inscricao, estado, curso:cursos(id, nome, codigo, estado)")
          .eq("formando_id", id).order("data_inscricao", { ascending: false }),
      ]);
      if (f.error) throw f.error;
      return { f: f.data, inscricoes: ins.data ?? [] };
    },
  });

  async function remove() {
    const { error } = await supabase.from("formandos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Formando eliminado");
    qc.invalidateQueries({ queryKey: ["formandos"] });
    navigate({ to: "/formandos" });
  }

  if (q.isLoading) return <PageContainer><div className="text-muted-foreground">A carregar…</div></PageContainer>;
  if (!q.data?.f) return <PageContainer><div className="text-muted-foreground">Formando não encontrado.</div></PageContainer>;

  const f = q.data.f;

  return (
    <PageContainer>
      <div className="mb-4">
        <Link to="/formandos" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
          <ArrowLeft className="size-3.5" /> Formandos
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
                  <AlertDialogTitle>Eliminar formando?</AlertDialogTitle>
                  <AlertDialogDescription>Esta ação remove também todas as inscrições em cursos.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={remove}>Eliminar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        }
      />

      <div className="mb-6"><EstadoFormandoBadge estado={f.estado} /></div>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="inscricoes">Inscrições</TabsTrigger>
          <TabsTrigger value="pra">PRA</TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <Card><CardContent className="p-6 grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <Field label="NIF" value={f.nif} />
            <Field label="NISS" value={f.niss} />
            <Field label="Cartão de Cidadão" value={f.cc} />
            <Field label="Validade CC" value={fmtDate(f.validade_cc)} />
            <Field label="Data de nascimento" value={fmtDate(f.data_nascimento)} />
            <Field label="Telemóvel" value={f.telemovel} />
            <Field label="Email" value={f.email} />
            <Field label="Morada" value={f.morada} />
            <Field label="Código Postal" value={[f.codigo_postal, f.localidade].filter(Boolean).join(" ")} />
            <Field label="Habilitações" value={f.habilitacoes} />
            <Field label="Situação face ao emprego" value={f.situacao_emprego} />
            <div className="sm:col-span-2"><Field label="Observações" value={f.observacoes} /></div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="inscricoes">
          <Card><CardContent className="p-6">
            {q.data.inscricoes.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">Sem inscrições. Inscreva-o a partir do detalhe do curso.</div>
            ) : (
              <ul className="divide-y divide-border">
                {q.data.inscricoes.map((i: any) => (
                  <li key={i.id} className="py-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <Link to="/cursos/$id" params={{ id: i.curso.id }} className="font-medium hover:underline truncate block">
                        {i.curso.codigo} — {i.curso.nome}
                      </Link>
                      <div className="text-xs text-muted-foreground">Inscrito a {fmtDate(i.data_inscricao)}</div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{INSCRICAO_ESTADO_LABEL[i.estado] ?? i.estado}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="pra">
          <Card><CardContent className="p-6 space-y-6">
            {q.data.inscricoes.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">Sem inscrições. Os PRA aparecem aqui após inscrever o formando num curso.</div>
            ) : (
              q.data.inscricoes.map((i: any) => (
                <PraCurso key={i.id} cursoFormandoId={i.id} curso={i.curso} />
              ))
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <FormandoDialog open={editing} onOpenChange={setEditing} initial={f as any} />
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

function PraCurso({ cursoFormandoId, curso }: { cursoFormandoId: string; curso: { id: string; nome: string; codigo: string } }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["pra-curso", cursoFormandoId],
    queryFn: async () => {
      const [cu, pra] = await Promise.all([
        supabase.from("curso_ufcds")
          .select("id, ufcd:ufcds(id, codigo, designacao)")
          .eq("curso_id", curso.id),
        supabase.from("formando_pra" as any)
          .select("id, curso_ufcd_id, nome, storage_path, nota")
          .eq("curso_formando_id", cursoFormandoId),
      ]);
      const praMap = new Map<string, any>();
      ((pra.data ?? []) as any[]).forEach((p) => praMap.set(p.curso_ufcd_id, p));
      return (cu.data ?? [])
        .map((u: any) => ({ ...u, pra: praMap.get(u.id) ?? null }))
        .sort((a: any, b: any) => compareUfcdCodigo(a.ufcd?.codigo ?? "", b.ufcd?.codigo ?? ""));
    },
  });

  async function upload(cursoUfcdId: string, file: File) {
    const path = `${cursoFormandoId}/${cursoUfcdId}/${Date.now()}_${file.name}`;
    const up = await supabase.storage.from("formando-pra").upload(path, file);
    if (up.error) return toast.error(up.error.message);
    const { error } = await supabase.from("formando_pra" as any).upsert(
      { curso_formando_id: cursoFormandoId, curso_ufcd_id: cursoUfcdId, nome: file.name, storage_path: path } as any,
      { onConflict: "curso_formando_id,curso_ufcd_id" } as any,
    );
    if (error) return toast.error(error.message);
    toast.success("PRA carregado");
    qc.invalidateQueries({ queryKey: ["pra-curso", cursoFormandoId] });
  }

  async function download(p: any) {
    const { data, error } = await supabase.storage.from("formando-pra").createSignedUrl(p.storage_path, 60);
    if (error || !data) return toast.error("Erro a abrir documento");
    window.open(data.signedUrl, "_blank");
  }

  async function remove(p: any) {
    await supabase.storage.from("formando-pra").remove([p.storage_path]);
    await supabase.from("formando_pra" as any).delete().eq("id", p.id);
    qc.invalidateQueries({ queryKey: ["pra-curso", cursoFormandoId] });
  }

  const ufcds = q.data ?? [];
  const comDoc = ufcds.filter((u: any) => u.pra).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Link to="/cursos/$id" params={{ id: curso.id }} className="font-medium hover:underline">
          {curso.codigo} — {curso.nome}
        </Link>
        <div className="text-xs text-muted-foreground">{comDoc} / {ufcds.length} PRA carregados</div>
      </div>
      {ufcds.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">Sem UFCD atribuídas a este curso.</div>
      ) : (
        <div className="space-y-1.5">
          {ufcds.map((u: any) => {
            const hasDoc = !!u.pra;
            return (
              <div
                key={u.id}
                className={
                  "rounded-md border px-3 py-2 flex items-center gap-3 text-sm transition-colors " +
                  (hasDoc
                    ? "bg-green-500/10 border-green-500/40"
                    : "bg-red-500/10 border-red-500/40")
                }
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{u.ufcd?.codigo}</span>
                    <span className="truncate">{u.ufcd?.designacao}</span>
                  </div>
                  {hasDoc && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{u.pra.nome}</div>
                  )}
                </div>
                {hasDoc ? (
                  <>
                    <Button type="button" variant="ghost" size="sm" onClick={() => download(u.pra)}>
                      <Download className="size-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => remove(u.pra)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                    <label className="cursor-pointer">
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border hover:bg-muted">
                        <Upload className="size-3.5" /> Substituir
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(u.id, f); e.target.value = ""; }}
                      />
                    </label>
                  </>
                ) : (
                  <label className="cursor-pointer">
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border hover:bg-background">
                      <Upload className="size-3.5" /> Carregar PRA
                    </span>
                    <Input
                      type="file"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(u.id, f); e.target.value = ""; }}
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
