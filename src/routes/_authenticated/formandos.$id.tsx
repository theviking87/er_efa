import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
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
