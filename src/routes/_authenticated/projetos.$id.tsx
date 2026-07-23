import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookOpen, Users, ListChecks, UserSquare2, Wallet, CalendarDays, FileBarChart2, FileText, Pencil, Filter } from "lucide-react";
import { toast } from "sonner";
import { useProjetoAtivo } from "@/lib/projeto-context";
import { ESTADO_PROJETO } from "./projetos.index";

export const Route = createFileRoute("/_authenticated/projetos/$id")({
  head: () => ({ meta: [{ title: "Projeto" }] }),
  component: ProjetoDetalhe,
});

function ProjetoDetalhe() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { setProjetoId } = useProjetoAtivo();
  const [editing, setEditing] = useState(false);

  const projeto = useQuery({
    queryKey: ["projeto", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projetos").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const cursos = useQuery({
    queryKey: ["projeto-cursos", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("cursos").select("id, codigo, nome, estado, data_inicio, data_fim").eq("projeto_id", id).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const processamentos = useQuery({
    queryKey: ["projeto-processamentos", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("fin_processamento")
        .select("id, ano, mes, estado, total_geral, cursos:curso_id(codigo)")
        .eq("projeto_id", id).order("ano", { ascending: false }).order("mes", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const p = projeto.data;
  const cursoIds = (cursos.data ?? []).map(c => c.id);

  const formandosCount = useQuery({
    queryKey: ["projeto-formandos-count", id, cursoIds.join(",")],
    enabled: cursoIds.length > 0,
    queryFn: async () => {
      const { data } = await (supabase as any).from("curso_formandos").select("formando_id").in("curso_id", cursoIds);
      return new Set((data ?? []).map((r: any) => r.formando_id)).size;
    },
  });

  const ufcdsCount = useQuery({
    queryKey: ["projeto-ufcds-count", id, cursoIds.join(",")],
    enabled: cursoIds.length > 0,
    queryFn: async () => {
      const { data } = await (supabase as any).from("curso_ufcds").select("id").in("curso_id", cursoIds);
      return (data ?? []).length;
    },
  });

  const formadoresCount = useQuery({
    queryKey: ["projeto-formadores-count", id, cursoIds.join(",")],
    enabled: cursoIds.length > 0,
    queryFn: async () => {
      const { data: ufcdRows } = await (supabase as any).from("curso_ufcds").select("id").in("curso_id", cursoIds);
      const cufcdIds = (ufcdRows ?? []).map((r: any) => r.id);
      if (!cufcdIds.length) return 0;
      const { data } = await (supabase as any).from("curso_ufcd_formadores").select("formador_id").in("curso_ufcd_id", cufcdIds);
      return new Set((data ?? []).map((r: any) => r.formador_id)).size;
    },
  });

  if (projeto.isLoading) return <PageContainer><div className="text-muted-foreground">A carregar…</div></PageContainer>;
  if (!p) return <PageContainer><div className="text-muted-foreground">Projeto não encontrado.</div></PageContainer>;

  return (
    <PageContainer>
      <PageHeader
        title={p.nome}
        description={`${p.codigo}${p.entidade_promotora ? ` · ${p.entidade_promotora}` : ""}`}
        actions={
          <>
            <Button variant="outline" onClick={() => { setProjetoId(id); toast.success("Filtro aplicado ao projeto"); navigate({ to: "/dashboard" }); }}>
              <Filter className="size-4 mr-1" /> Ativar filtro
            </Button>
            <Button onClick={() => setEditing(true)}><Pencil className="size-4 mr-1" /> Editar</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <MiniStat icon={BookOpen} label="Cursos" value={cursos.data?.length ?? 0} />
        <MiniStat icon={ListChecks} label="UFCD" value={ufcdsCount.data ?? 0} />
        <MiniStat icon={Users} label="Formadores" value={formadoresCount.data ?? 0} />
        <MiniStat icon={UserSquare2} label="Formandos" value={formandosCount.data ?? 0} />
        <MiniStat icon={Wallet} label="Processamentos" value={processamentos.data?.length ?? 0} />
        <MiniStat icon={CalendarDays} label="Estado" value={ESTADO_PROJETO[p.estado as keyof typeof ESTADO_PROJETO] ?? p.estado} />
      </div>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados gerais</TabsTrigger>
          <TabsTrigger value="cursos">Cursos</TabsTrigger>
          <TabsTrigger value="ufcd">UFCD</TabsTrigger>
          <TabsTrigger value="formadores">Formadores</TabsTrigger>
          <TabsTrigger value="formandos">Formandos</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <Card><CardContent className="pt-6 grid sm:grid-cols-2 gap-4 text-sm">
            <Field label="Código" value={p.codigo} />
            <Field label="Estado" value={ESTADO_PROJETO[p.estado as keyof typeof ESTADO_PROJETO] ?? p.estado} />
            <Field label="Entidade promotora" value={p.entidade_promotora} />
            <Field label="Programa de financiamento" value={p.programa_financiamento} />
            <Field label="Início" value={p.data_inicio} />
            <Field label="Fim" value={p.data_fim} />
            <div className="sm:col-span-2"><Field label="Descrição" value={p.descricao} /></div>
            <div className="sm:col-span-2"><Field label="Observações" value={p.observacoes} /></div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="cursos">
          <Card><CardHeader><CardTitle className="text-base">Cursos do projeto</CardTitle></CardHeader>
            <CardContent>
              <div className="divide-y">
                {(cursos.data ?? []).map(c => (
                  <Link key={c.id} to="/cursos/$id" params={{ id: c.id }} className="flex items-center justify-between py-2 hover:bg-muted/40 px-2 rounded">
                    <div><div className="font-medium text-sm">{c.nome}</div><div className="text-xs text-muted-foreground font-mono">{c.codigo}</div></div>
                    <Badge variant="secondary">{c.estado}</Badge>
                  </Link>
                ))}
                {!cursos.data?.length && <div className="text-sm text-muted-foreground py-6 text-center">Sem cursos.</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financeiro">
          <Card><CardHeader><CardTitle className="text-base">Processamentos</CardTitle></CardHeader>
            <CardContent>
              <div className="divide-y text-sm">
                {(processamentos.data ?? []).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between py-2">
                    <div>{r.cursos?.codigo ?? "—"} — {r.ano}/{String(r.mes).padStart(2, "0")}</div>
                    <Badge variant={r.estado === "aberto" ? "default" : "secondary"}>{r.estado}</Badge>
                  </div>
                ))}
                {!processamentos.data?.length && <div className="text-sm text-muted-foreground py-6 text-center">Sem processamentos.</div>}
              </div>
              <div className="mt-4"><Link to="/financeiro/processamentos" className="text-xs text-primary hover:underline">Abrir módulo Financeiro →</Link></div>
            </CardContent>
          </Card>
        </TabsContent>

        {["ufcd", "formadores", "formandos", "cronograma", "relatorios", "documentos"].map(k => (
          <TabsContent key={k} value={k}>
            <Card><CardContent className="pt-6 text-sm text-muted-foreground flex items-center gap-2">
              <FileText className="size-4" />
              Vista dedicada em preparação. Use o filtro "Ativar filtro" para navegar toda a aplicação já restrita a este projeto.
            </CardContent></Card>
          </TabsContent>
        ))}
      </Tabs>

      {editing && <EditDialog id={id} open={editing} onClose={() => setEditing(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["projeto", id] }); qc.invalidateQueries({ queryKey: ["projetos"] }); }} initial={p} />}
    </PageContainer>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <Card><CardContent className="pt-4 pb-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{label}</span><Icon className="size-3.5" /></div>
      <div className="text-lg font-semibold mt-1">{value ?? "—"}</div>
    </CardContent></Card>
  );
}
function Field({ label, value }: { label: string; value: any }) {
  return <div><div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div><div>{value || "—"}</div></div>;
}

function EditDialog({ id, initial, open, onClose, onSaved }: { id: string; initial: any; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    codigo: initial.codigo ?? "", nome: initial.nome ?? "", descricao: initial.descricao ?? "",
    entidade_promotora: initial.entidade_promotora ?? "", programa_financiamento: initial.programa_financiamento ?? "",
    data_inicio: initial.data_inicio ?? "", data_fim: initial.data_fim ?? "",
    estado: initial.estado ?? "ativo", observacoes: initial.observacoes ?? "", ativo: initial.ativo ?? true,
  });
  const save = useMutation({
    mutationFn: async () => {
      const payload: any = { ...f };
      if (!payload.data_inicio) payload.data_inicio = null;
      if (!payload.data_fim) payload.data_fim = null;
      const { error } = await supabase.from("projetos").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { onSaved(); onClose(); toast.success("Projeto atualizado"); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Editar projeto</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Código *</Label><Input value={f.codigo} onChange={e => setF({ ...f, codigo: e.target.value })} /></div>
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={f.estado} onValueChange={v => setF({ ...f, estado: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(ESTADO_PROJETO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5"><Label>Nome *</Label><Input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Entidade promotora</Label><Input value={f.entidade_promotora} onChange={e => setF({ ...f, entidade_promotora: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Programa de financiamento</Label><Input value={f.programa_financiamento} onChange={e => setF({ ...f, programa_financiamento: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Início</Label><Input type="date" value={f.data_inicio ?? ""} onChange={e => setF({ ...f, data_inicio: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Fim</Label><Input type="date" value={f.data_fim ?? ""} onChange={e => setF({ ...f, data_fim: e.target.value })} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Descrição</Label><Textarea rows={2} value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Observações</Label><Textarea rows={2} value={f.observacoes} onChange={e => setF({ ...f, observacoes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
