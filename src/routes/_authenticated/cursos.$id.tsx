import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Trash2, Plus, ChevronLeft, ChevronRight, Printer, FileSpreadsheet, Upload, Users, FileText, Clock } from "lucide-react";
import { exportSigoCurso, exportFaltasCurso } from "@/lib/exports";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ESTADO_CURSO_LABEL, TIPOLOGIA_LABEL, fmtDate, fmtHoras, diffHoras, MONTH_NAMES, dateOnlyIso,
  INSCRICAO_ESTADO_LABEL, FALTA_TIPO_LABEL, formadorLabel,
} from "@/lib/format";
import { toast } from "sonner";
import { compareUfcdCodigo } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { PresencasDialog } from "@/components/presencas-dialog";

export const Route = createFileRoute("/_authenticated/cursos/$id")({
  head: () => ({ meta: [{ title: "Curso — Gestão Pedagógica" }] }),
  component: CursoDetail,
});

function CursoDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const curso = useQuery({
    queryKey: ["curso", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("cursos").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const remove = async () => {
    const { error } = await supabase.from("cursos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Curso eliminado");
    qc.invalidateQueries({ queryKey: ["cursos"] });
    navigate({ to: "/cursos" });
  };

  if (curso.isLoading) return <PageContainer><div className="text-muted-foreground">A carregar…</div></PageContainer>;
  if (!curso.data) return <PageContainer><div className="text-muted-foreground">Curso não encontrado.</div></PageContainer>;

  const c = curso.data;

  return (
    <PageContainer>
      <div className="mb-4">
        <Link to="/cursos" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
          <ArrowLeft className="size-3.5" /> Cursos
        </Link>
      </div>
      <PageHeader
        title={c.nome}
        description={`${c.codigo} · ${TIPOLOGIA_LABEL[c.tipologia]} · ${ESTADO_CURSO_LABEL[c.estado]}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/cursos/$id/importar" params={{ id }}>
                <Upload className="size-4" /> Importar cronograma
              </Link>
            </Button>
            <Button variant="outline" onClick={() => exportSigoCurso(id).then(() => toast.success("Exportado")).catch(e => toast.error(e.message))}>
              <FileSpreadsheet className="size-4" /> SIGO
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="outline" className="text-destructive hover:text-destructive"><Trash2 className="size-4" /> Eliminar</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Eliminar curso?</AlertDialogTitle><AlertDialogDescription>Esta ação remove também todas as UFCD atribuídas e sessões.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={remove}>Eliminar</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        }
      />

      <Tabs defaultValue="ufcds">
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="ufcds">UFCD</TabsTrigger>
          <TabsTrigger value="formandos">Formandos</TabsTrigger>
          <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
          <TabsTrigger value="faltas">Faltas</TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <Card><CardContent className="p-6 grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <Field label="Código" value={c.codigo} />
            <Field label="Tipologia" value={TIPOLOGIA_LABEL[c.tipologia]} />
            <Field label="Início" value={fmtDate(c.data_inicio)} />
            <Field label="Fim" value={fmtDate(c.data_fim)} />
            <Field label="Estado" value={ESTADO_CURSO_LABEL[c.estado]} />
            <div className="sm:col-span-2"><Field label="Observações" value={c.observacoes} /></div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="ufcds">
          <UfcdsTab cursoId={id} />
        </TabsContent>

        <TabsContent value="formandos">
          <FormandosTab cursoId={id} />
        </TabsContent>

        <TabsContent value="cronograma">
          <CronogramaTab cursoId={id} cursoNome={c.nome} cursoCodigo={c.codigo} />
        </TabsContent>

        <TabsContent value="faltas">
          <FaltasTab cursoId={id} />
        </TabsContent>
      </Tabs>
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

// ---------------- UFCD TAB ----------------
function UfcdsTab({ cursoId }: { cursoId: string }) {
  const [manageUfcd, setManageUfcd] = useState<{ cursoUfcdId: string; ufcdId: string; codigo: string; designacao: string; assigned: string[] } | null>(null);
  const [sessoesUfcd, setSessoesUfcd] = useState<{ cursoUfcdId: string; codigo: string; designacao: string } | null>(null);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");


  const data = useQuery({
    queryKey: ["curso-ufcds", cursoId],
    queryFn: async () => {
      const [cu, sess] = await Promise.all([
        supabase.from("curso_ufcds")
          .select("id, horas_totais, ordem, concluida, ufcd:ufcds(id, codigo, designacao, horas_referencia), formadores:curso_ufcd_formadores(formador:formadores(id, nome, abreviatura, cor))")
          .eq("curso_id", cursoId).order("ordem"),
        supabase.from("sessoes").select("curso_ufcd_id, horas").eq("curso_id", cursoId),
      ]);
      if (cu.error) throw cu.error;
      const horasRealizadasMap = new Map<string, number>();
      (sess.data ?? []).forEach((s: any) => {
        horasRealizadasMap.set(s.curso_ufcd_id, (horasRealizadasMap.get(s.curso_ufcd_id) ?? 0) + Number(s.horas));
      });
      return (cu.data ?? [])
        .map((u: any) => ({
          ...u,
          horas_realizadas: horasRealizadasMap.get(u.id) ?? 0,
        }))
        .sort((a: any, b: any) => compareUfcdCodigo(a.ufcd?.codigo ?? "", b.ufcd?.codigo ?? ""));
    },
  });

  async function del(id: string) {
    const { error } = await supabase.from("curso_ufcds").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["curso-ufcds", cursoId] });
  }

  async function toggleConcluida(u: any) {
    await supabase.from("curso_ufcds").update({ concluida: !u.concluida }).eq("id", u.id);
    qc.invalidateQueries({ queryKey: ["curso-ufcds", cursoId] });
  }

  function imprimirSemFormador() {
    const lista = (data.data ?? []).filter((u: any) => (u.formadores ?? []).length === 0);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>UFCD sem formador</title>
      <style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}h1{font-size:16px;margin:0 0 4px}h2{font-size:12px;font-weight:normal;color:#555;margin:0 0 16px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #999;padding:6px 8px;text-align:left}th{background:#eee}</style>
      </head><body>
      <h1>UFCD sem formador atribuído</h1>
      <h2>Total: ${lista.length} UFCD${lista.length === 1 ? "" : "s"}</h2>
      <table><thead><tr><th style="width:90px">Código</th><th>Designação</th><th style="width:70px;text-align:right">Horas</th></tr></thead>
      <tbody>${lista.length === 0
        ? '<tr><td colspan="3" style="text-align:center;color:#666">Todas as UFCD têm formador atribuído.</td></tr>'
        : lista.map((u: any) => `<tr><td>${u.ufcd?.codigo ?? ""}</td><td>${u.ufcd?.designacao ?? ""}</td><td style="text-align:right">${u.horas_totais}h</td></tr>`).join("")}
      </tbody></table>
      <script>window.onload=()=>setTimeout(()=>window.print(),100)</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return toast.error("Bloqueado pelo navegador");
    w.document.write(html); w.document.close();
  }

  return (
    <Card><CardContent className="p-6 space-y-4">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div className="text-sm text-muted-foreground">{data.data?.length ?? 0} UFCD atribuídas · {fmtHoras((data.data ?? []).reduce((a: number, u: any) => a + Number(u.horas_totais ?? 0), 0))} totais</div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Pesquisar UFCD…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-56"
          />
          <Button variant="outline" size="sm" onClick={imprimirSemFormador}><FileText className="size-4" /> UFCD sem formador</Button>
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" /> Atribuir UFCD</Button>
        </div>
      </div>
      {(data.data?.length ?? 0) === 0 && <div className="text-sm text-muted-foreground text-center py-8">Sem UFCD atribuídas. Atribua a primeira.</div>}
      <div className="space-y-2">
        {(data.data ?? []).filter((u: any) => {
          const q = search.trim().toLowerCase();
          if (!q) return true;
          return (u.ufcd?.codigo ?? "").toLowerCase().includes(q) || (u.ufcd?.designacao ?? "").toLowerCase().includes(q);
        }).map((u: any) => {

          const pct = u.horas_totais > 0 ? Math.min(100, (u.horas_realizadas / u.horas_totais) * 100) : 0;
          const emFalta = Math.max(0, u.horas_totais - u.horas_realizadas);
          return (
            <div key={u.id} className="border rounded-md p-3">
              <div className="flex items-start gap-3">
                <Checkbox checked={u.concluida} onCheckedChange={() => toggleConcluida(u)} className="mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground">{u.ufcd.codigo}</span>
                    <span className="font-medium">{u.ufcd.designacao}</span>
                    {u.concluida && <Badge variant="secondary" className="text-[10px]">Concluída</Badge>}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{fmtHoras(u.horas_realizadas)} / {u.horas_totais} h</span>
                    {emFalta > 0 && <span>· {fmtHoras(emFalta)} em falta</span>}
                  </div>
                  <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-foreground transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {u.formadores.length === 0 && <span className="text-xs text-muted-foreground italic">Sem formador atribuído</span>}
                    {u.formadores.map((ff: any) => (
                      <span key={ff.formador.id} className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-muted">
                        <span className="size-1.5 rounded-full" style={{ background: ff.formador.cor }} />
                        {ff.formador.nome}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="sm" title="Ver sessões contabilizadas" onClick={() => setSessoesUfcd({ cursoUfcdId: u.id, codigo: u.ufcd.codigo, designacao: u.ufcd.designacao })}><Clock className="size-3.5" /></Button>
                  <Button variant="ghost" size="sm" title="Gerir formadores" onClick={() => setManageUfcd({
                    cursoUfcdId: u.id,
                    ufcdId: u.ufcd.id,
                    codigo: u.ufcd.codigo,
                    designacao: u.ufcd.designacao,
                    assigned: (u.formadores ?? []).map((ff: any) => ff.formador.id),
                  })}><Users className="size-3.5" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => del(u.id)}><Trash2 className="size-3.5" /></Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <AtribuirUfcdDialog open={open} onOpenChange={setOpen} cursoId={cursoId} onSaved={() => qc.invalidateQueries({ queryKey: ["curso-ufcds", cursoId] })} />
      <GerirFormadoresUfcdDialog
        info={manageUfcd}
        cursoId={cursoId}
        onOpenChange={(v) => { if (!v) setManageUfcd(null); }}
        onSaved={() => qc.invalidateQueries({ queryKey: ["curso-ufcds", cursoId] })}
      />
      <SessoesUfcdDialog info={sessoesUfcd} onOpenChange={(v) => { if (!v) setSessoesUfcd(null); }} />
    </CardContent></Card>
  );
}

function SessoesUfcdDialog({
  info, onOpenChange,
}: {
  info: { cursoUfcdId: string; codigo: string; designacao: string } | null;
  onOpenChange: (v: boolean) => void;
}) {
  const sessoes = useQuery({
    queryKey: ["sessoes-ufcd", info?.cursoUfcdId],
    enabled: !!info,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessoes")
        .select("id, data, hora_inicio, hora_fim, horas, formador:formadores(nome, abreviatura, cor)")
        .eq("curso_ufcd_id", info!.cursoUfcdId)
        .order("data", { ascending: true })
        .order("hora_inicio", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const total = (sessoes.data ?? []).reduce((a: number, s: any) => a + Number(s.horas ?? 0), 0);

  return (
    <Dialog open={!!info} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Sessões contabilizadas</DialogTitle>
          {info && (
            <div className="text-sm text-muted-foreground">
              <span className="font-mono">{info.codigo}</span> — {info.designacao}
            </div>
          )}
        </DialogHeader>
        <div className="flex-1 overflow-auto border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Data</th>
                <th className="px-3 py-2 text-left">Horário</th>
                <th className="px-3 py-2 text-left">Formador</th>
                <th className="px-3 py-2 text-right">Horas</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sessoes.isLoading && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">A carregar…</td></tr>}
              {!sessoes.isLoading && (sessoes.data ?? []).length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Sem sessões lançadas.</td></tr>
              )}
              {(sessoes.data ?? []).map((s: any) => (
                <tr key={s.id} className="hover:bg-muted/30">
                  <td className="px-3 py-1.5">{fmtDate(s.data)}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{s.hora_inicio?.slice(0,5)}–{s.hora_fim?.slice(0,5)}</td>
                  <td className="px-3 py-1.5">
                    {s.formador ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full" style={{ background: s.formador.cor }} />
                        {s.formador.nome}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right">{fmtHoras(Number(s.horas))}</td>
                </tr>
              ))}
            </tbody>
            {(sessoes.data ?? []).length > 0 && (
              <tfoot className="bg-muted/20 font-medium">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right">Total</td>
                  <td className="px-3 py-2 text-right">{fmtHoras(total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GerirFormadoresUfcdDialog({
  info, cursoId, onOpenChange, onSaved,
}: {
  info: { cursoUfcdId: string; ufcdId: string; codigo: string; designacao: string; assigned: string[] } | null;
  cursoId: string;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (info) setSelected(info.assigned); }, [info]);

  const candidatos = useQuery({
    queryKey: ["gerir-form-ufcd", info?.ufcdId, info?.assigned.join(",")],
    enabled: !!info,
    queryFn: async () => {
      const { data: comp } = await supabase.from("formador_ufcds" as any).select("formador_id").eq("ufcd_id", info!.ufcdId);
      const compIds = ((comp ?? []) as any[]).map((r) => r.formador_id);
      const ids = Array.from(new Set([...compIds, ...(info?.assigned ?? [])]));
      if (ids.length === 0) return [];
      const { data } = await supabase.from("formadores").select("id, nome, cor, estado").in("id", ids).order("nome");
      // keep ativos + qualquer já atribuído (mesmo que inativo/sem competência)
      const assignedSet = new Set(info?.assigned ?? []);
      return (data ?? []).filter((f: any) => f.estado === "ativo" || assignedSet.has(f.id));
    },
  });

  const horasNoCurso = useQuery({
    queryKey: ["form-horas-curso", cursoId],
    enabled: !!info,
    queryFn: async () => {
      const { data } = await supabase
        .from("curso_ufcd_formadores")
        .select("formador_id, curso_ufcd:curso_ufcds!inner(curso_id, horas_totais)")
        .eq("curso_ufcd.curso_id", cursoId);
      const m = new Map<string, number>();
      ((data ?? []) as any[]).forEach((r) => {
        m.set(r.formador_id, (m.get(r.formador_id) ?? 0) + Number(r.curso_ufcd?.horas_totais ?? 0));
      });
      return m;
    },
  });

  async function save() {
    if (!info) return;
    setSaving(true);
    try {
      const original = new Set(info.assigned);
      const novo = new Set(selected);
      const toAdd = [...novo].filter((x) => !original.has(x));
      const toRemove = [...original].filter((x) => !novo.has(x));
      if (toRemove.length) {
        const { error } = await supabase.from("curso_ufcd_formadores").delete()
          .eq("curso_ufcd_id", info.cursoUfcdId).in("formador_id", toRemove);
        if (error) throw error;
      }
      if (toAdd.length) {
        const { error } = await supabase.from("curso_ufcd_formadores")
          .insert(toAdd.map((fid) => ({ curso_ufcd_id: info.cursoUfcdId, formador_id: fid })) as never);
        if (error) throw error;
      }
      toast.success("Formadores atualizados");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Falhou guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!info} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Formadores — {info?.codigo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">{info?.designacao}</div>
          <div className="border rounded-md max-h-60 overflow-y-auto p-2 space-y-1">
            {(candidatos.data ?? []).length === 0 && (
              <div className="text-xs text-muted-foreground px-1 py-2">
                Nenhum formador ativo com competência para esta UFCD. Atribua a competência na área do formador.
              </div>
            )}
            {(candidatos.data ?? []).map((f: any) => {
              const h = horasNoCurso.data?.get(f.id) ?? 0;
              return (
                <label key={f.id} className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-muted cursor-pointer">
                  <Checkbox
                    checked={selected.includes(f.id)}
                    onCheckedChange={(c) => setSelected(c ? [...selected, f.id] : selected.filter((x) => x !== f.id))}
                  />
                  <span className="size-2 rounded-full" style={{ background: f.cor }} />
                  <span className="flex-1 truncate">{f.nome}</span>
                  <Badge variant="secondary" className="text-[10px] tabular-nums">{fmtHoras(h)} no curso</Badge>
                </label>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AtribuirUfcdDialog({ open, onOpenChange, cursoId, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; cursoId: string; onSaved: () => void }) {
  const [ufcdId, setUfcdId] = useState("");
  const [horas, setHoras] = useState(25);
  const [formadores, setFormadores] = useState<string[]>([]);
  const [conflict, setConflict] = useState<{ cursos: { id: string; codigo: string; nome: string }[] } | null>(null);

  const ufcds = useQuery({ queryKey: ["ufcds"], queryFn: async () => ((await supabase.from("ufcds").select("*")).data ?? []).sort((a: any, b: any) => compareUfcdCodigo(a.codigo, b.codigo)) });
  const formadoresList = useQuery({
    queryKey: ["formadores-ativos-ufcd", ufcdId],
    enabled: !!ufcdId,
    queryFn: async () => {
      const { data: comp } = await supabase.from("formador_ufcds" as any).select("formador_id").eq("ufcd_id", ufcdId);
      const ids = (comp ?? []).map((r: any) => r.formador_id);
      if (ids.length === 0) return [];
      const { data } = await supabase.from("formadores").select("id, nome, cor, estado").eq("estado", "ativo").in("id", ids).order("nome");
      return data ?? [];
    },
  });

  const horasNoCurso = useQuery({
    queryKey: ["form-horas-curso", cursoId],
    queryFn: async () => {
      const { data } = await supabase
        .from("curso_ufcd_formadores")
        .select("formador_id, curso_ufcd:curso_ufcds!inner(curso_id, horas_totais)")
        .eq("curso_ufcd.curso_id", cursoId);
      const m = new Map<string, number>();
      ((data ?? []) as any[]).forEach((r) => {
        m.set(r.formador_id, (m.get(r.formador_id) ?? 0) + Number(r.curso_ufcd?.horas_totais ?? 0));
      });
      return m;
    },
  });

  async function doInsert() {
    const { data, error } = await supabase.from("curso_ufcds").insert({ curso_id: cursoId, ufcd_id: ufcdId, horas_totais: horas } as never).select().single();
    if (error) return toast.error(error.message);
    if (formadores.length) {
      const cu = data as any;
      await supabase.from("curso_ufcd_formadores").insert(formadores.map(fid => ({ curso_ufcd_id: cu.id, formador_id: fid })) as never);
    }
    toast.success("UFCD atribuída");
    onOpenChange(false);
    setUfcdId(""); setHoras(25); setFormadores([]); setConflict(null);
    onSaved();
  }

  async function save() {
    if (!ufcdId) return toast.error("Escolha uma UFCD");
    const { data: existing, error: exErr } = await supabase
      .from("curso_ufcds")
      .select("curso_id")
      .eq("ufcd_id", ufcdId);
    if (exErr) return toast.error(exErr.message);
    const rows = existing ?? [];
    if (rows.some((r: any) => r.curso_id === cursoId)) {
      return toast.error("Esta UFCD já está atribuída a este curso");
    }
    const ids = Array.from(new Set(rows.map((r: any) => r.curso_id).filter((id: string) => id && id !== cursoId)));
    if (ids.length > 0) {
      const { data: cs } = await supabase.from("cursos").select("id, codigo, nome").in("id", ids);
      setConflict({ cursos: (cs ?? []) as any });
      return;
    }
    await doInsert();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader><DialogTitle>Atribuir UFCD ao curso</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>UFCD *</Label>
              <Select value={ufcdId} onValueChange={(v) => { setUfcdId(v); const u = (ufcds.data ?? []).find((x: any) => x.id === v); if (u) setHoras((u as any).horas_referencia); }}>
                <SelectTrigger><SelectValue placeholder="Escolher…" /></SelectTrigger>
                <SelectContent>{(ufcds.data ?? []).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.codigo} — {u.designacao}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Horas totais</Label><Input type="number" min={1} value={horas} onChange={e => setHoras(Number(e.target.value))} /></div>
            <div className="space-y-1.5">
              <Label>Formadores com competência</Label>
              <div className="border rounded-md max-h-40 overflow-y-auto p-2 space-y-1">
                {!ufcdId && <div className="text-xs text-muted-foreground px-1">Escolha primeiro uma UFCD.</div>}
                {ufcdId && (formadoresList.data ?? []).length === 0 && <div className="text-xs text-muted-foreground px-1">Nenhum formador ativo com competência para esta UFCD.</div>}
                {(formadoresList.data ?? []).map((f: any) => {
                  const h = horasNoCurso.data?.get(f.id) ?? 0;
                  return (
                    <label key={f.id} className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-muted cursor-pointer">
                      <Checkbox checked={formadores.includes(f.id)} onCheckedChange={(c) => setFormadores(c ? [...formadores, f.id] : formadores.filter(x => x !== f.id))} />
                      <span className="size-2 rounded-full" style={{ background: f.cor }} />
                      <span className="flex-1 truncate">{f.nome}</span>
                      <Badge variant="secondary" className="text-[10px] tabular-nums">{fmtHoras(h)} no curso</Badge>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={save}>Atribuir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!conflict} onOpenChange={(v) => { if (!v) setConflict(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>UFCD já atribuída</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <div>Esta UFCD já está atribuída {conflict && conflict.cursos.length === 1 ? "ao curso" : "aos cursos"}:</div>
                <ul className="mt-2 list-disc pl-5">
                  {conflict?.cursos.map((c) => (
                    <li key={c.id}>{c.codigo} — {c.nome}</li>
                  ))}
                </ul>
                <div className="mt-3">Deseja atribuir também a este curso?</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConflict(null); doInsert(); }}>Atribuir mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------- CRONOGRAMA TAB ----------------
function CronogramaTab({ cursoId, cursoNome, cursoCodigo }: { cursoId: string; cursoNome: string; cursoCodigo: string }) {
  const qc = useQueryClient();
  const [mes, setMes] = useState(() => { const d = new Date(); return { ano: d.getFullYear(), mes: d.getMonth() }; });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogData, setDialogData] = useState<string | null>(null);
  const [presencasSessao, setPresencasSessao] = useState<any | null>(null);
  const [substituirSessao, setSubstituirSessao] = useState<any | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const inicioMes = dateOnlyIso(mes.ano, mes.mes, 1);
  const fimMes = dateOnlyIso(mes.ano, mes.mes + 1, 0);

  const sessoes = useQuery({
    queryKey: ["sessoes", cursoId, inicioMes, fimMes],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessoes")
        .select("id, data, hora_inicio, hora_fim, horas, formador_id, formador:formadores(id,nome,abreviatura,cor), curso_ufcd:curso_ufcds(id, ufcd:ufcds(codigo, designacao))")
        .eq("curso_id", cursoId).gte("data", inicioMes).lte("data", fimMes)
        .order("data").order("hora_inicio");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Carga global do curso (todas as UFCD e total de horas já dadas em todos os meses)
  const cargaCurso = useQuery({
    queryKey: ["curso-carga", cursoId],
    queryFn: async () => {
      const [cu, allSess] = await Promise.all([
        supabase.from("curso_ufcds")
          .select("id, horas_totais, ufcd:ufcds(codigo, designacao), formadores:curso_ufcd_formadores(formador:formadores(id,nome,abreviatura,cor))")
          .eq("curso_id", cursoId),
        supabase.from("sessoes").select("curso_ufcd_id, formador_id, horas").eq("curso_id", cursoId),
      ]);
      const horasPorCuf = new Map<string, number>();
      (allSess.data ?? []).forEach((s: any) => {
        horasPorCuf.set(s.curso_ufcd_id, (horasPorCuf.get(s.curso_ufcd_id) ?? 0) + Number(s.horas));
      });
      return (cu.data ?? []).map((u: any) => ({
        ...u,
        horas_realizadas: horasPorCuf.get(u.id) ?? 0,
        horas_em_falta: Math.max(0, Number(u.horas_totais) - (horasPorCuf.get(u.id) ?? 0)),
      }));
    },
  });

  const sessoesByDay = useMemo(() => {
    const m = new Map<string, any[]>();
    (sessoes.data ?? []).forEach((s: any) => {
      const arr = m.get(s.data) ?? [];
      arr.push(s); m.set(s.data, arr);
    });
    return m;
  }, [sessoes.data]);

  // Resumo do mês por formador
  const resumoMes = useMemo(() => {
    const m = new Map<string, { id: string; nome: string; cor: string; horas: number; ufcds: Set<string> }>();
    (sessoes.data ?? []).forEach((s: any) => {
      if (!s.formador) return;
      const cur = m.get(s.formador.id) ?? { id: s.formador.id, nome: formadorLabel(s.formador), cor: s.formador.cor, horas: 0, ufcds: new Set<string>() };
      cur.horas += Number(s.horas);
      if (s.curso_ufcd?.ufcd?.codigo) cur.ufcds.add(s.curso_ufcd.ufcd.codigo);
      m.set(s.formador.id, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.horas - a.horas);
  }, [sessoes.data]);

  // Para a impressão: formadores do mês × UFCD em curso × horas em falta (já com o corrente mês contabilizado)
  const printFooter = useMemo(() => {
    const rows: { formador: string; cor: string; ufcd: string; horas_totais: number; realizadas: number; em_falta: number }[] = [];
    resumoMes.forEach(r => {
      // UFCD onde este formador está atribuído neste curso
      (cargaCurso.data ?? []).forEach((u: any) => {
        const tem = (u.formadores ?? []).some((ff: any) => ff.formador?.id === r.id);
        if (!tem) return;
        // Mostrar só UFCD ainda não fechadas (em falta > 0) — "a decorrer"
        if (u.horas_em_falta <= 0) return;
        rows.push({
          formador: r.nome, cor: r.cor,
          ufcd: `${u.ufcd.codigo} — ${u.ufcd.designacao}`,
          horas_totais: u.horas_totais,
          realizadas: u.horas_realizadas,
          em_falta: u.horas_em_falta,
        });
      });
    });
    return rows;
  }, [resumoMes, cargaCurso.data]);

  // Build calendar grid (Mon first)
  const grid = useMemo(() => {
    const first = new Date(mes.ano, mes.mes, 1);
    const last = new Date(mes.ano, mes.mes + 1, 0);
    const startDow = (first.getDay() + 6) % 7; // 0=Mon
    const days: ({ d: number; iso: string } | null)[] = [];
    for (let i = 0; i < startDow; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) {
      const iso = dateOnlyIso(mes.ano, mes.mes, d);
      days.push({ d, iso });
    }
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [mes]);




  function prev() { setMes(m => m.mes === 0 ? { ano: m.ano - 1, mes: 11 } : { ano: m.ano, mes: m.mes - 1 }); }
  function next() { setMes(m => m.mes === 11 ? { ano: m.ano + 1, mes: 0 } : { ano: m.ano, mes: m.mes + 1 }); }

  const totalMes = resumoMes.reduce((a, r) => a + r.horas, 0);

  return (
    <Card><CardContent className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prev}><ChevronLeft className="size-4" /></Button>
          <div className="font-semibold text-lg min-w-[170px] text-center">{MONTH_NAMES[mes.mes]} {mes.ano}</div>
          <Button variant="outline" size="icon" onClick={next}><ChevronRight className="size-4" /></Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="size-4" /> Imprimir</Button>
          <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}><FileText className="size-4" /> Retroativos em massa</Button>
          <Button size="sm" onClick={() => { setDialogData(null); setDialogOpen(true); }}><Plus className="size-4" /> Nova sessão</Button>
        </div>
      </div>

      {/* CRONOGRAMA ECRÃ — calendário mensal */}
      <div className="border rounded-md overflow-hidden bg-card print:hidden">
        <div className="grid grid-cols-7 bg-muted/40 text-xs uppercase text-muted-foreground">
          {["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map(d => <div key={d} className="px-2 py-1.5 text-center font-medium">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 auto-rows-[minmax(110px,auto)]">
          {grid.map((cell, i) => (
            <div key={i} className="border-t border-l border-border first:border-l-0 [&:nth-child(7n+1)]:border-l-0 p-1.5 min-h-[110px] bg-card">
              {cell && (
                <>
                  <button onClick={() => { setDialogData(cell.iso); setDialogOpen(true); }} className="text-xs text-muted-foreground hover:text-foreground w-full text-left mb-1">
                    {cell.d}
                  </button>
                  <div className="space-y-1">
                    {(sessoesByDay.get(cell.iso) ?? []).map((s: any) => (
                      <SessaoChip key={s.id} sessao={s}
                        onPresencas={() => setPresencasSessao({ ...s, curso_id: cursoId })}
                        onSubstituir={() => setSubstituirSessao(s)}
                        onDelete={async () => {
                          await supabase.from("sessoes").delete().eq("id", s.id);
                          qc.invalidateQueries({ queryKey: ["sessoes", cursoId] });
                          qc.invalidateQueries({ queryKey: ["curso-ufcds", cursoId] });
                          qc.invalidateQueries({ queryKey: ["curso-carga", cursoId] });
                        }} />
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* RESUMO DO MÊS — ecrã */}
      <div className="border rounded-md p-4 print:hidden">
        <div className="flex items-center justify-between mb-3">
          <div className="font-medium text-sm">Resumo de horas — {MONTH_NAMES[mes.mes]} {mes.ano}</div>
          <div className="text-xs text-muted-foreground">Total: {fmtHoras(totalMes)}</div>
        </div>
        {resumoMes.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">Sem sessões neste mês.</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {resumoMes.map(r => (
              <div key={r.id} className="flex items-center gap-2.5 text-sm border rounded-md px-3 py-2">
                <span className="size-2.5 rounded-full shrink-0" style={{ background: r.cor }} />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{r.nome}</div>
                  <div className="text-xs text-muted-foreground truncate">{Array.from(r.ufcds).join(" · ") || "—"}</div>
                </div>
                <div className="text-sm tabular-nums font-medium">{fmtHoras(r.horas)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ÁREA DE IMPRESSÃO — só visível quando se imprime */}
      <div id="cronograma-print" className="hidden print:block">
        {/* PÁGINA 1 — Cronograma do mês (uma folha) */}
        <div className="cronograma-page">
          <div className="cronograma-header mb-1.5">
            <div className="text-[9px] text-muted-foreground leading-tight">{cursoCodigo}</div>
            <div className="font-semibold text-sm leading-tight">{cursoNome}</div>
            <div className="text-[10px] leading-tight">Cronograma · {MONTH_NAMES[mes.mes]} {mes.ano}</div>
          </div>

          <div className="cronograma-weekdays grid grid-cols-7 border border-gray-400 border-b-0 text-[8px]">
            {["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map(d => (
              <div key={d} className="border-r border-gray-400 last:border-r-0 bg-gray-100 px-1 py-[1px] font-semibold text-center uppercase leading-none">{d}</div>
            ))}
          </div>
          <div className="cronograma-grid grid grid-cols-7 border border-gray-400 text-[9px]">
            {grid.map((cell, i) => (
              <div key={i} className="cronograma-cell border-r border-b border-gray-300 last:border-r-0 p-1 align-top overflow-hidden" style={{ borderRight: (i % 7 === 6) ? "none" : undefined }}>
                {cell && (
                  <>
                    <div className="text-[10px] font-semibold mb-0.5 leading-none">{cell.d}</div>
                    <div className="space-y-0.5">
                      {(sessoesByDay.get(cell.iso) ?? []).flatMap((s: any) => {
                        const [hiH, hiM] = String(s.hora_inicio).split(":").map(Number);
                        const [hfH, hfM] = String(s.hora_fim).split(":").map(Number);
                        const startMin = hiH * 60 + hiM;
                        const endMin = hfH * 60 + hfM;
                        const linhas: { from: string; to: string }[] = [];
                        let cur = startMin;
                        while (cur < endMin) {
                          const nxt = Math.min(cur + 60, endMin);
                          const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}h${m % 60 === 0 ? "" : String(m % 60).padStart(2, "0")}`;
                          linhas.push({ from: fmt(cur), to: fmt(nxt) });
                          cur = nxt;
                        }
                        return linhas.map((l, idx) => (
                          <div key={s.id + "-" + idx} className="leading-tight" style={{ borderLeft: `2px solid ${s.formador?.cor || "#888"}`, paddingLeft: "3px" }}>
                            <span className="tabular-nums font-semibold">{l.from}-{l.to}</span>
                            {" "}{formadorLabel(s.formador)} ({s.curso_ufcd?.ufcd?.codigo})
                          </div>
                        ));
                      })}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* PÁGINA 2 — Gestão de horas */}
        <div className="horas-page text-[10px]">
          <div className="mb-2">
            <div className="text-xs text-muted-foreground">{cursoCodigo}</div>
            <div className="font-semibold text-lg leading-tight">{cursoNome}</div>
            <div className="text-sm">Gestão de horas · {MONTH_NAMES[mes.mes]} {mes.ano}</div>
          </div>
          <div className="font-semibold mb-1">Formadores deste mês — UFCD em curso e horas em falta (inclui {MONTH_NAMES[mes.mes]})</div>

          <table className="w-full border-collapse text-[9px]">
            <thead>
              <tr>
                <th className="border border-gray-400 bg-gray-100 p-1 text-left">Formador</th>
                <th className="border border-gray-400 bg-gray-100 p-1 text-left">UFCD em curso</th>
                <th className="border border-gray-400 bg-gray-100 p-1 text-right w-[60px]">Carga</th>
                <th className="border border-gray-400 bg-gray-100 p-1 text-right w-[60px]">Dadas</th>
                <th className="border border-gray-400 bg-gray-100 p-1 text-right w-[60px]">Faltam</th>
              </tr>
            </thead>
            <tbody>
              {printFooter.length === 0 && (
                <tr><td colSpan={5} className="border border-gray-400 p-1 text-center text-gray-500">Sem UFCD em curso para os formadores deste mês.</td></tr>
              )}
              {printFooter.map((r, i) => (
                <tr key={i}>
                  <td className="border border-gray-400 p-1">{r.formador}</td>
                  <td className="border border-gray-400 p-1">{r.ufcd}</td>
                  <td className="border border-gray-400 p-1 text-right tabular-nums">{r.horas_totais}h</td>
                  <td className="border border-gray-400 p-1 text-right tabular-nums">{r.realizadas}h</td>
                  <td className="border border-gray-400 p-1 text-right tabular-nums font-semibold">{r.em_falta}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <SessaoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        cursoId={cursoId}
        defaultDate={dialogData ?? undefined}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["sessoes", cursoId] });
          qc.invalidateQueries({ queryKey: ["curso-ufcds", cursoId] });
          qc.invalidateQueries({ queryKey: ["curso-carga", cursoId] });
        }}
      />

      <PresencasDialog
        open={!!presencasSessao}
        onOpenChange={(v) => { if (!v) setPresencasSessao(null); }}
        sessao={presencasSessao}
      />

      <SubstituirFormadorDialog
        sessao={substituirSessao}
        cursoId={cursoId}

        onClose={() => setSubstituirSessao(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["sessoes", cursoId] });
          qc.invalidateQueries({ queryKey: ["curso-ufcds", cursoId] });
          qc.invalidateQueries({ queryKey: ["curso-carga", cursoId] });
        }}
      />

      <BulkRetroativosDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        cursoId={cursoId}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["sessoes", cursoId] });
          qc.invalidateQueries({ queryKey: ["curso-ufcds", cursoId] });
          qc.invalidateQueries({ queryKey: ["curso-carga", cursoId] });
        }}
      />

    </CardContent></Card>
  );
}

function SubstituirFormadorDialog({ sessao, cursoId, onClose, onSaved }: { sessao: any | null; cursoId: string; onClose: () => void; onSaved: () => void }) {
  const [novoFormadorId, setNovoFormadorId] = useState("");
  const [novoCursoUfcdId, setNovoCursoUfcdId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [hi, setHi] = useState("");
  const [hf, setHf] = useState("");
  const [saving, setSaving] = useState(false);

  // Inicializa com a ufcd e horário da sessão quando abre
  useEffect(() => {
    if (sessao) {
      setNovoCursoUfcdId(sessao.curso_ufcd?.id ?? sessao.curso_ufcd_id ?? "");
      setNovoFormadorId("");
      setHi(String(sessao.hora_inicio ?? "").slice(0, 5));
      setHf(String(sessao.hora_fim ?? "").slice(0, 5));
    }
  }, [sessao?.id]);

  // UFCDs do curso (para escolher)
  const cursoUfcds = useQuery({
    queryKey: ["subst-curso-ufcds", cursoId],
    enabled: !!sessao,
    queryFn: async () => {
      const { data } = await supabase
        .from("curso_ufcds")
        .select("id, ufcd_id, ufcd:ufcds(codigo, designacao)")
        .eq("curso_id", cursoId);
      return (data ?? []).sort((a: any, b: any) => compareUfcdCodigo(a.ufcd?.codigo ?? "", b.ufcd?.codigo ?? ""));
    },
  });

  const selectedCursoUfcd = (cursoUfcds.data ?? []).find((cu: any) => cu.id === novoCursoUfcdId);
  const realUfcdId = (selectedCursoUfcd as any)?.ufcd_id;

  const candidatos = useQuery({
    queryKey: ["subst-candidatos", realUfcdId, sessao?.formador_id, novoCursoUfcdId],
    enabled: !!sessao && !!realUfcdId,
    queryFn: async () => {
      const { data: comp } = await supabase.from("formador_ufcds" as any).select("formador_id").eq("ufcd_id", realUfcdId);
      const ids = ((comp ?? []) as any[]).map(r => r.formador_id);
      // Se mudou a UFCD, mostra todos os competentes; se mantém a UFCD, exclui o formador atual
      const filteredIds = novoCursoUfcdId === (sessao?.curso_ufcd?.id ?? sessao?.curso_ufcd_id)
        ? ids.filter(id => id !== sessao?.formador_id)
        : ids;
      if (filteredIds.length === 0) return [];
      const { data } = await supabase.from("formadores").select("id, nome, cor, estado").in("id", filteredIds).eq("estado", "ativo").order("nome");
      return data ?? [];
    },
  });

  async function substituir() {
    if (!sessao || !novoFormadorId || !novoCursoUfcdId) return;
    setSaving(true);
    const originalId = sessao.formador_id;
    const originalNome = sessao.formador?.nome ?? "formador anterior";
    const ufcdChanged = novoCursoUfcdId !== (sessao.curso_ufcd?.id ?? sessao.curso_ufcd_id);
    const formadorChanged = novoFormadorId !== originalId;

    if (!hi || !hf) { setSaving(false); return toast.error("Horário inválido"); }
    const horas = diffHoras(hi, hf);
    if (horas <= 0) { setSaving(false); return toast.error("Horas inválidas"); }
    const hiFull = hi.length === 5 ? `${hi}:00` : hi;
    const hfFull = hf.length === 5 ? `${hf}:00` : hf;
    const horarioChanged =
      hiFull !== String(sessao.hora_inicio) || hfFull !== String(sessao.hora_fim);

    // Verificar conflito de horário do novo formador nesse dia
    const { data: conflitos } = await supabase.from("sessoes")
      .select("id, hora_inicio, hora_fim")
      .eq("formador_id", novoFormadorId).eq("data", sessao.data);
    const hasConflict = (conflitos ?? []).some((s: any) => s.id !== sessao.id && !(hfFull <= s.hora_inicio || hiFull >= s.hora_fim));
    if (hasConflict) { setSaving(false); return toast.error("Novo formador tem outra sessão neste período"); }

    // Atualizar sessão
    const { error } = await supabase.from("sessoes")
      .update({ formador_id: novoFormadorId, curso_ufcd_id: novoCursoUfcdId, hora_inicio: hi, hora_fim: hf, horas } as never)
      .eq("id", sessao.id);
    if (error) { setSaving(false); return toast.error(error.message); }

    // Garantir competência registada e atribuição ao curso/ufcd para o novo formador
    if (realUfcdId) {
      await supabase.from("formador_ufcds" as any).upsert(
        { formador_id: novoFormadorId, ufcd_id: realUfcdId } as any,
        { onConflict: "formador_id,ufcd_id" } as any,
      );
    }
    const { data: jaAtrib } = await supabase
      .from("curso_ufcd_formadores" as any)
      .select("id")
      .eq("curso_ufcd_id", novoCursoUfcdId)
      .eq("formador_id", novoFormadorId)
      .maybeSingle();
    if (!jaAtrib) {
      await supabase.from("curso_ufcd_formadores" as any).insert({ curso_ufcd_id: novoCursoUfcdId, formador_id: novoFormadorId } as any);
    }

    // Registar disponibilidades só se o formador mudou
    if (formadorChanged) {
      const motivoTxt = motivo ? ` — ${motivo}` : "";
      const ufcdTxt = ufcdChanged ? " e UFCD" : "";
      await supabase.from("formador_disponibilidades" as any).insert({
        formador_id: originalId,
        data: sessao.data,
        hora_inicio: hiFull,
        hora_fim: hfFull,
        tipo: "indisponivel",
        notas: `Troca de formador${ufcdTxt}: substituído por novo formador${motivoTxt}`,
      } as any);
      await supabase.from("formador_disponibilidades" as any).insert({
        formador_id: novoFormadorId,
        data: sessao.data,
        hora_inicio: hiFull,
        hora_fim: hfFull,
        tipo: "disponivel",
        notas: `Troca de formador${ufcdTxt}: substitui ${originalNome}${motivoTxt}`,
      } as any);
    }

    setSaving(false);
    toast.success(
      ufcdChanged && formadorChanged ? "Sessão atualizada (UFCD e formador)" :
      ufcdChanged ? "UFCD da sessão alterada" :
      formadorChanged ? "Formador substituído" :
      horarioChanged ? "Horário atualizado" : "Sessão atualizada",
      { description: formadorChanged ? "Disponibilidades lançadas com aviso de troca." : undefined },
    );
    setNovoFormadorId(""); setMotivo("");
    onSaved();
    onClose();
  }

  const ufcdChanged = sessao && novoCursoUfcdId && novoCursoUfcdId !== (sessao.curso_ufcd?.id ?? sessao.curso_ufcd_id);

  return (
    <Dialog open={!!sessao} onOpenChange={(v) => { if (!v) { onClose(); setNovoFormadorId(""); setMotivo(""); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Substituir UFCD / formador</DialogTitle></DialogHeader>
        {sessao && (
          <div className="space-y-3 text-sm">
            <div className="bg-muted/40 rounded-md p-3 space-y-0.5">
              <div><span className="text-muted-foreground">Sessão:</span> <span className="font-medium">{fmtDate(sessao.data)} · {sessao.hora_inicio?.slice(0,5)}–{sessao.hora_fim?.slice(0,5)}</span></div>
              <div><span className="text-muted-foreground">UFCD atual:</span> <span className="font-medium">{sessao.curso_ufcd?.ufcd?.codigo} — {sessao.curso_ufcd?.ufcd?.designacao}</span></div>
              <div><span className="text-muted-foreground">Formador atual:</span> <span className="font-medium">{sessao.formador?.nome}</span></div>
            </div>
            <div className="space-y-1.5">
              <Label>UFCD *</Label>
              <Select value={novoCursoUfcdId} onValueChange={(v) => { setNovoCursoUfcdId(v); setNovoFormadorId(""); }}>
                <SelectTrigger><SelectValue placeholder="Escolher UFCD…" /></SelectTrigger>
                <SelectContent>
                  {(cursoUfcds.data ?? []).map((cu: any) => (
                    <SelectItem key={cu.id} value={cu.id}>{cu.ufcd?.codigo} — {cu.ufcd?.designacao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Hora de início *</Label>
                <Input type="time" value={hi} onChange={e => setHi(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Hora de fim *</Label>
                <Input type="time" value={hf} onChange={e => setHf(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Formador *</Label>
              <Select value={novoFormadorId} onValueChange={setNovoFormadorId}>
                <SelectTrigger><SelectValue placeholder={(candidatos.data ?? []).length === 0 ? "Sem formadores com competência" : "Escolher…"} /></SelectTrigger>
                <SelectContent>
                  {(candidatos.data ?? []).map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Motivo (opcional)</Label>
              <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: doença, indisponibilidade…" />
            </div>
            <div className="text-xs text-muted-foreground">
              {ufcdChanged
                ? "A UFCD da sessão será alterada. O novo formador ficará automaticamente com competência e atribuição à UFCD."
                : "Será automaticamente registada uma indisponibilidade para o formador atual e uma disponibilidade para o novo, ambas com aviso de que se trata de uma troca."}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={substituir} disabled={!novoFormadorId || !novoCursoUfcdId || saving}>{saving ? "A guardar…" : "Confirmar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function SessaoChip({ sessao, onDelete, onPresencas, onSubstituir }: { sessao: any; onDelete: () => void; onPresencas?: () => void; onSubstituir?: () => void }) {
  return (
    <div className="text-[11px] leading-tight rounded px-1.5 py-1 group relative" style={{ background: `${sessao.formador?.cor}15`, color: sessao.formador?.cor, borderLeft: `2px solid ${sessao.formador?.cor}` }}>
      <div className="font-medium">{sessao.hora_inicio?.slice(0,5)}–{sessao.hora_fim?.slice(0,5)}</div>
      <div className="truncate">{formadorLabel(sessao.formador)}</div>
      <div className="truncate opacity-80">{sessao.curso_ufcd?.ufcd?.codigo}</div>
      <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition flex gap-1 print:hidden">
        {onPresencas && (
          <button onClick={onPresencas} className="text-[10px] hover:underline" title="Marcar presenças">✓</button>
        )}
        {onSubstituir && (
          <button onClick={onSubstituir} className="text-[10px] hover:underline" title="Substituir UFCD / formador">↻</button>
        )}
        <button onClick={onDelete} className="text-[10px] hover:underline" title="Apagar">×</button>
      </div>
    </div>
  );
}

function SessaoDialog({ open, onOpenChange, cursoId, defaultDate, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; cursoId: string; defaultDate?: string; onSaved: () => void }) {
  const [data, setData] = useState("");
  const [hi, setHi] = useState("09:00");
  const [hf, setHf] = useState("13:00");
  const [cufId, setCufId] = useState("");
  const [formadorId, setFormadorId] = useState("");
  const [erro, setErro] = useState<{ titulo: string; descricao?: string } | null>(null);

  // Aplicar defaultDate ao abrir
  if (open && data === "" && defaultDate) setTimeout(() => setData(defaultDate), 0);

  // UFCD do curso + respetivos formadores + horas totais/realizadas
  const ufcds = useQuery({
    queryKey: ["curso-ufcds-flat", cursoId],
    queryFn: async () => {
      const [cu, sess] = await Promise.all([
        supabase.from("curso_ufcds")
          .select("id, concluida, horas_totais, ufcd:ufcds(codigo,designacao), formadores:curso_ufcd_formadores(formador_id, formador:formadores(id,nome,abreviatura,cor))")
          .eq("curso_id", cursoId).eq("concluida", false),
        supabase.from("sessoes").select("curso_ufcd_id, horas").eq("curso_id", cursoId),
      ]);
      const realizadas = new Map<string, number>();
      (sess.data ?? []).forEach((s: any) => realizadas.set(s.curso_ufcd_id, (realizadas.get(s.curso_ufcd_id) ?? 0) + Number(s.horas)));
      return (cu.data ?? []).map((u: any) => ({
        ...u,
        horas_realizadas: realizadas.get(u.id) ?? 0,
        horas_em_falta: Math.max(0, Number(u.horas_totais) - (realizadas.get(u.id) ?? 0)),
      }));
    },
    enabled: open,
  });

  // Disponibilidades de TODOS os formadores para a data escolhida
  const dispDia = useQuery({
    queryKey: ["disp-dia", data],
    enabled: open && !!data,
    queryFn: async () => {
      const { data: rows } = await supabase.from("formador_disponibilidades" as any)
        .select("id, formador_id, data, hora_inicio, hora_fim, tipo, notas, formador:formadores(id,nome,abreviatura,cor)")
        .eq("data", data).order("hora_inicio");
      return (rows ?? []) as any[];
    },
  });

  // UFCD em que o formador escolhido está atribuído neste curso E ainda tem horas em falta
  const ufcdsDoFormador = useMemo(() => {
    if (!formadorId) return [];
    return (ufcds.data ?? [])
      .filter((u: any) =>
        u.horas_em_falta > 0 &&
        (u.formadores ?? []).some((ff: any) => ff.formador?.id === formadorId)
      )
      .sort((a: any, b: any) => compareUfcdCodigo(a.ufcd?.codigo ?? "", b.ufcd?.codigo ?? ""));
  }, [formadorId, ufcds.data]);

  const cufSelecionada = useMemo(() => (ufcds.data ?? []).find((u: any) => u.id === cufId), [ufcds.data, cufId]);


  // Formadores ligados às UFCD deste curso (para realçar na lista de dispon.)
  const formadoresDoCurso = useMemo(() => {
    const s = new Set<string>();
    (ufcds.data ?? []).forEach((u: any) =>
      (u.formadores ?? []).forEach((ff: any) => ff.formador?.id && s.add(ff.formador.id))
    );
    return s;
  }, [ufcds.data]);

  const formadoresDoCursoList = useMemo(() => {
    const m = new Map<string, any>();
    (ufcds.data ?? []).forEach((u: any) =>
      (u.formadores ?? []).forEach((ff: any) => {
        if (ff.formador?.id && !m.has(ff.formador.id)) m.set(ff.formador.id, ff.formador);
      })
    );
    return Array.from(m.values()).sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
  }, [ufcds.data]);

  const isRetroativo = useMemo(() => {
    if (!data) return false;
    const hoje = new Date();
    const inicioMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return new Date(data + "T00:00:00") < inicioMesAtual;
  }, [data]);

  function aplicarSlot(s: any) {
    setFormadorId(s.formador_id);
    setHi(String(s.hora_inicio).slice(0, 5));
    setHf(String(s.hora_fim).slice(0, 5));
    setCufId("");
  }



  async function save() {
    if (!data || !cufId || !formadorId) return toast.error("Preencha todos os campos");
    const horas = diffHoras(hi, hf);
    if (horas <= 0) return toast.error("Horas inválidas");

    const { data: conflitos } = await supabase.from("sessoes")
      .select("hora_inicio, hora_fim").eq("formador_id", formadorId).eq("data", data);
    const hasConflict = (conflitos ?? []).some(s => !(hf <= s.hora_inicio || hi >= s.hora_fim));
    if (hasConflict) return toast.error("Conflito de horário", { description: "Formador tem outra sessão neste período." });

    const { data: inat } = await supabase.from("formador_inatividades")
      .select("data_inicio, data_fim, motivo").eq("formador_id", formadorId)
      .lte("data_inicio", data).gte("data_fim", data);
    if ((inat ?? []).length > 0) {
      const i = inat![0];
      return toast.error("Formador indisponível", { description: `${i.motivo || "Inatividade"} (${i.data_inicio} → ${i.data_fim})` });
    }

    // Validar contra disponibilidades declaradas pelo formador nesse dia.
    // Sessões em meses anteriores ao atual são permitidas sem disponibilidade declarada (lançamento retroativo).
    const hoje = new Date();
    const inicioMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const dataSessao = new Date(data + "T00:00:00");
    const isRetroativo = dataSessao < inicioMesAtual;

    const dispDoFormador = (dispDia.data ?? []).filter((d: any) => d.formador_id === formadorId);
    const hiN = hi + ":00";
    const hfN = hf + ":00";
    const indisp = dispDoFormador.find((d: any) => d.tipo === "indisponivel" && !(hfN <= d.hora_inicio || hiN >= d.hora_fim));
    if (indisp) { setErro({ titulo: "Formador indisponível", descricao: "O formador marcou este período como indisponível." }); return; }

    if (!isRetroativo) {
      const disponiveis = dispDoFormador.filter((d: any) => d.tipo === "disponivel");
      if (disponiveis.length === 0) {
        setErro({ titulo: "Sem disponibilidade", descricao: "O formador não declarou disponibilidade para este dia." });
        return;
      }
      const dentro = disponiveis.some((d: any) => hiN >= d.hora_inicio && hfN <= d.hora_fim);
      if (!dentro) {
        const janelas = disponiveis.map((d: any) => `${String(d.hora_inicio).slice(0,5)}–${String(d.hora_fim).slice(0,5)}`).join(", ");
        setErro({
          titulo: "Estás a marcar mais horas que as declaradas",
          descricao: `A sessão (${hi}–${hf}) está fora da disponibilidade do formador. Janelas declaradas neste dia: ${janelas}.`,
        });
        return;
      }
    }




    const { error } = await supabase.from("sessoes").insert({
      curso_id: cursoId, curso_ufcd_id: cufId, formador_id: formadorId, data, hora_inicio: hi, hora_fim: hf, horas,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Sessão criada");
    onOpenChange(false);
    setData(""); setCufId(""); setFormadorId(""); setHi("09:00"); setHf("13:00");
    onSaved();
  }

  const dispOrdenadas = useMemo(() => {
    const rows = (dispDia.data ?? []).slice();
    return rows.sort((a: any, b: any) => {
      const ap = formadoresDoCurso.has(a.formador_id) ? 0 : 1;
      const bp = formadoresDoCurso.has(b.formador_id) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return String(a.hora_inicio).localeCompare(String(b.hora_inicio));
    });
  }, [dispDia.data, formadoresDoCurso]);

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setData(""); setCufId(""); setFormadorId(""); } }}>

      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Nova sessão</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Dia *</Label>
            <Input type="date" value={data} onChange={e => { setData(e.target.value); setFormadorId(""); setCufId(""); }} />
          </div>

          {data && isRetroativo && (
            <div className="space-y-1.5">
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Lançamento retroativo (mês anterior ao atual) — não é exigida disponibilidade declarada. Escolhe o formador manualmente.
              </div>
              <Label className="text-xs">Formador *</Label>
              <Select value={formadorId} onValueChange={(v) => { setFormadorId(v); setCufId(""); }}>
                <SelectTrigger><SelectValue placeholder="Escolher formador deste curso…" /></SelectTrigger>
                <SelectContent>
                  {formadoresDoCursoList.map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{formadorLabel(f)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {data && !isRetroativo && (
            <div className="space-y-1.5">
              <Label className="text-xs">Formadores com disponibilidade neste dia</Label>
              <div className="border rounded-md max-h-56 overflow-y-auto divide-y bg-muted/30">
                {dispOrdenadas.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-muted-foreground">Nenhum formador declarou disponibilidade para este dia.</div>
                ) : (
                  dispOrdenadas.map((s: any) => {
                    const noCurso = formadoresDoCurso.has(s.formador_id);
                    const isDisp = s.tipo === "disponivel";
                    const active = formadorId === s.formador_id && hi === String(s.hora_inicio).slice(0, 5) && hf === String(s.hora_fim).slice(0, 5);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={!isDisp}
                        onClick={() => isDisp && aplicarSlot(s)}
                        className={"w-full text-left px-3 py-2 text-xs flex items-center gap-2 " + (active ? "bg-muted " : "hover:bg-muted ") + (!isDisp ? "opacity-60 cursor-not-allowed " : "")}
                      >
                        <span className="size-2 rounded-full shrink-0" style={{ background: s.formador?.cor }} />
                        <span className="tabular-nums text-muted-foreground w-[88px]">{String(s.hora_inicio).slice(0,5)}–{String(s.hora_fim).slice(0,5)}</span>
                        <span className="font-medium truncate flex-1">{formadorLabel(s.formador)}</span>
                        {noCurso ? <Badge variant="secondary" className="text-[10px]">deste curso</Badge> : <span className="text-[10px] text-muted-foreground">externo ao curso</span>}
                        {!isDisp && <Badge variant="destructive" className="text-[10px]">indisp.</Badge>}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}



          {formadorId && (
            <div className="space-y-1.5">
              <Label>UFCD * <span className="text-xs text-muted-foreground font-normal">(apenas as deste formador com horas em falta)</span></Label>
              <Select value={cufId} onValueChange={setCufId}>
                <SelectTrigger><SelectValue placeholder={ufcdsDoFormador.length === 0 ? "Sem UFCD em falta para este formador" : "Escolher UFCD…"} /></SelectTrigger>
                <SelectContent>
                  {ufcdsDoFormador.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.ufcd.codigo} — {u.ufcd.designacao} · faltam {fmtHoras(u.horas_em_falta)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cufSelecionada && (
                <div className="text-xs text-muted-foreground">
                  {fmtHoras(cufSelecionada.horas_realizadas)} dadas de {cufSelecionada.horas_totais}h · <span className="font-medium text-foreground">faltam {fmtHoras(cufSelecionada.horas_em_falta)}</span>
                  {diffHoras(hi, hf) > cufSelecionada.horas_em_falta && <span className="text-amber-600"> · esta sessão excede o que falta</span>}
                </div>
              )}
            </div>
          )}


          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Início</Label><Input type="time" value={hi} onChange={e => setHi(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Fim</Label><Input type="time" value={hf} onChange={e => setHf(e.target.value)} /></div>
          </div>
          <div className="text-xs text-muted-foreground">Duração: {diffHoras(hi, hf).toFixed(2).replace(".", ",")} h</div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={!data || !formadorId || !cufId}>Criar sessão</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!erro} onOpenChange={(v) => { if (!v) setErro(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{erro?.titulo}</AlertDialogTitle>
          {erro?.descricao && <AlertDialogDescription>{erro.descricao}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => setErro(null)}>Entendido</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// ---------------- FORMANDOS TAB ----------------
function FormandosTab({ cursoId }: { cursoId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const data = useQuery({
    queryKey: ["curso-formandos", cursoId],
    queryFn: async () => {
      const { data, error } = await supabase.from("curso_formandos")
        .select("id, data_inscricao, estado, observacoes, formando:formandos(id, nome, email, telemovel, nif, estado)")
        .eq("curso_id", cursoId).order("data_inscricao", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function del(id: string) {
    const { error } = await supabase.from("curso_formandos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Inscrição removida");
    qc.invalidateQueries({ queryKey: ["curso-formandos", cursoId] });
  }

  async function setEstado(id: string, estado: string) {
    const { error } = await supabase.from("curso_formandos").update({ estado } as never).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["curso-formandos", cursoId] });
  }

  return (
    <Card><CardContent className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">{data.data?.length ?? 0} formandos inscritos</div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" /> Inscrever formando</Button>
      </div>
      {(data.data?.length ?? 0) === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">Sem formandos. Inscreva o primeiro.</div>
      ) : (
        <div className="border rounded-md divide-y">
          {(data.data ?? []).map((i: any) => (
            <div key={i.id} className="px-4 py-3 flex items-center gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <Link to="/formandos/$id" params={{ id: i.formando.id }} className="font-medium hover:underline truncate block">
                  {i.formando.nome}
                </Link>
                <div className="text-xs text-muted-foreground truncate">
                  {[i.formando.email, i.formando.telemovel, i.formando.nif && `NIF ${i.formando.nif}`].filter(Boolean).join(" · ") || "Sem contacto"}
                </div>
              </div>
              <Select value={i.estado} onValueChange={(v) => setEstado(i.id, v)}>
                <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(INSCRICAO_ESTADO_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground w-20 text-right">{fmtDate(i.data_inscricao)}</div>
              <Button variant="ghost" size="sm" onClick={() => del(i.id)}><Trash2 className="size-3.5" /></Button>
            </div>
          ))}
        </div>
      )}
      <InscreverFormandoDialog open={open} onOpenChange={setOpen} cursoId={cursoId} jaInscritos={new Set((data.data ?? []).map((i: any) => i.formando.id))} onSaved={() => qc.invalidateQueries({ queryKey: ["curso-formandos", cursoId] })} />
    </CardContent></Card>
  );
}

function InscreverFormandoDialog({ open, onOpenChange, cursoId, jaInscritos, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; cursoId: string; jaInscritos: Set<string>; onSaved: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [filtro, setFiltro] = useState("");

  const formandos = useQuery({
    queryKey: ["formandos-disponiveis"],
    queryFn: async () => (await supabase.from("formandos").select("id, nome, email, estado").eq("estado", "ativo").order("nome")).data ?? [],
    enabled: open,
  });

  const filtrados = (formandos.data ?? []).filter((f: any) =>
    !jaInscritos.has(f.id) && (!filtro || f.nome.toLowerCase().includes(filtro.toLowerCase()))
  );

  async function save() {
    if (selected.length === 0) return toast.error("Escolha pelo menos um formando");
    const rows = selected.map(fid => ({ curso_id: cursoId, formando_id: fid }));
    const { error } = await supabase.from("curso_formandos").insert(rows as never);
    if (error) return toast.error(error.message);
    toast.success(`${selected.length} formando(s) inscrito(s)`);
    setSelected([]); setFiltro("");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setSelected([]); setFiltro(""); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Inscrever formandos</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Procurar…" value={filtro} onChange={e => setFiltro(e.target.value)} />
          <div className="border rounded-md max-h-72 overflow-y-auto">
            {filtrados.length === 0 && <div className="px-3 py-6 text-xs text-muted-foreground text-center">Sem formandos disponíveis.</div>}
            {filtrados.map((f: any) => (
              <label key={f.id} className="flex items-center gap-2 text-sm px-3 py-2 border-b last:border-b-0 hover:bg-muted/40 cursor-pointer">
                <Checkbox checked={selected.includes(f.id)} onCheckedChange={(c) => setSelected(c ? [...selected, f.id] : selected.filter(x => x !== f.id))} />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{f.nome}</div>
                  {f.email && <div className="text-xs text-muted-foreground truncate">{f.email}</div>}
                </div>
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save}>Inscrever {selected.length > 0 && `(${selected.length})`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- FALTAS TAB ----------------
function FaltasTab({ cursoId }: { cursoId: string }) {
  const qc = useQueryClient();
  const [sessaoId, setSessaoId] = useState<string>("");

  const inscritos = useQuery({
    queryKey: ["curso-formandos-faltas", cursoId],
    queryFn: async () => {
      const { data, error } = await supabase.from("curso_formandos")
        .select("id, formando:formandos(id, nome)")
        .eq("curso_id", cursoId)
        .in("estado", ["inscrito", "em_formacao"]);
      if (error) throw error;
      return (data ?? []).sort((a: any, b: any) => a.formando.nome.localeCompare(b.formando.nome));
    },
  });

  const sessoes = useQuery({
    queryKey: ["sessoes-faltas", cursoId],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessoes")
        .select("id, data, hora_inicio, hora_fim, horas, curso_ufcd:curso_ufcds(ufcd:ufcds(codigo, designacao))")
        .eq("curso_id", cursoId)
        .order("data", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const faltas = useQuery({
    queryKey: ["faltas", cursoId, sessaoId],
    enabled: !!sessaoId,
    queryFn: async () => {
      const { data, error } = await supabase.from("formando_faltas")
        .select("id, curso_formando_id, horas, tipo, observacoes")
        .eq("sessao_id", sessaoId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const totaisPorFormando = useQuery({
    queryKey: ["faltas-totais", cursoId],
    queryFn: async () => {
      const { data, error } = await supabase.from("formando_faltas")
        .select("curso_formando_id, horas, tipo, curso_formando:curso_formandos!inner(curso_id)")
        .eq("curso_formando.curso_id", cursoId);
      if (error) throw error;
      const map = new Map<string, { just: number; injust: number }>();
      (data ?? []).forEach((f: any) => {
        const cur = map.get(f.curso_formando_id) ?? { just: 0, injust: 0 };
        if (f.tipo === "justificada") cur.just += Number(f.horas);
        else cur.injust += Number(f.horas);
        map.set(f.curso_formando_id, cur);
      });
      return map;
    },
  });

  const totalHorasCurso = (sessoes.data ?? []).reduce((s, x: any) => s + Number(x.horas ?? 0), 0);
  const sessao = (sessoes.data ?? []).find((s: any) => s.id === sessaoId) as any;
  const faltasMap = new Map((faltas.data ?? []).map((f: any) => [f.curso_formando_id, f]));

  async function registar(cursoFormandoId: string, horas: number, tipo: "justificada" | "injustificada") {
    if (!sessao) return;
    const existing = faltasMap.get(cursoFormandoId) as any;
    if (horas <= 0) {
      if (existing) {
        const { error } = await supabase.from("formando_faltas").delete().eq("id", existing.id);
        if (error) return toast.error(error.message);
      }
    } else if (existing) {
      const { error } = await supabase.from("formando_faltas")
        .update({ horas, tipo } as never).eq("id", existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("formando_faltas").insert({
        curso_formando_id: cursoFormandoId,
        sessao_id: sessao.id,
        data: sessao.data,
        horas,
        tipo,
      } as never);
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["faltas", cursoId, sessaoId] });
    qc.invalidateQueries({ queryKey: ["faltas-totais", cursoId] });
  }

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-6 space-y-4">
        <div className="flex items-end gap-3">
          <div className="flex-1 max-w-md">
            <Label className="text-xs">Sessão</Label>
            <Select value={sessaoId} onValueChange={setSessaoId}>
              <SelectTrigger><SelectValue placeholder="Escolher sessão para registar faltas" /></SelectTrigger>
              <SelectContent>
                {(sessoes.data ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {fmtDate(s.data)} · {s.hora_inicio.slice(0,5)}–{s.hora_fim.slice(0,5)} · {s.curso_ufcd?.ufcd?.codigo ?? "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {sessao && <div className="text-xs text-muted-foreground">Duração: {fmtHoras(sessao.horas)}</div>}
        </div>

        {sessao && (
          <div className="border rounded-md divide-y">
            <div className="grid grid-cols-[1fr_120px_160px] gap-3 px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground bg-muted/40">
              <div>Formando</div><div>Horas falta</div><div>Tipo</div>
            </div>
            {(inscritos.data ?? []).map((i: any) => {
              const f = faltasMap.get(i.id) as any;
              return (
                <div key={i.id} className="grid grid-cols-[1fr_120px_160px] gap-3 px-4 py-2 items-center text-sm">
                  <div className="truncate">{i.formando.nome}</div>
                  <Input
                    type="number" min={0} step={0.5} max={sessao.horas}
                    defaultValue={f?.horas ?? 0}
                    onBlur={e => registar(i.id, Number(e.target.value), (f?.tipo ?? "injustificada") as any)}
                    className="h-8"
                  />
                  <Select value={f?.tipo ?? "injustificada"} onValueChange={(v) => registar(i.id, Number(f?.horas ?? sessao.horas), v as any)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(FALTA_TIPO_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
            {(inscritos.data ?? []).length === 0 && (
              <div className="px-4 py-6 text-xs text-muted-foreground text-center">Sem formandos inscritos.</div>
            )}
          </div>
        )}
      </CardContent></Card>

      <Card><CardContent className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Resumo de assiduidade</div>
          <Button variant="outline" size="sm" onClick={() => exportFaltasCurso(cursoId).then(() => toast.success("Exportado")).catch(e => toast.error(e.message))}>
            <FileSpreadsheet className="size-4" /> Exportar faltas
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">Carga total do curso: {fmtHoras(totalHorasCurso)}</div>
        <div className="border rounded-md divide-y">
          <div className="grid grid-cols-[1fr_100px_100px_100px_100px] gap-3 px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground bg-muted/40">
            <div>Formando</div><div>Just.</div><div>Injust.</div><div>Total</div><div>Assiduidade</div>
          </div>
          {(inscritos.data ?? []).map((i: any) => {
            const t = totaisPorFormando.data?.get(i.id) ?? { just: 0, injust: 0 };
            const totalFaltas = t.just + t.injust;
            const ass = totalHorasCurso > 0 ? ((totalHorasCurso - totalFaltas) / totalHorasCurso) * 100 : 100;
            return (
              <div key={i.id} className="grid grid-cols-[1fr_100px_100px_100px_100px] gap-3 px-4 py-2 items-center text-sm">
                <Link to="/formandos/$id" params={{ id: i.formando.id }} className="truncate hover:underline">{i.formando.nome}</Link>
                <div>{fmtHoras(t.just)}</div>
                <div>{fmtHoras(t.injust)}</div>
                <div>{fmtHoras(totalFaltas)}</div>
                <div className={ass < 90 ? "text-destructive font-medium" : ""}>{ass.toFixed(1)}%</div>
              </div>
            );
          })}
        </div>
      </CardContent></Card>
    </div>
  );
}

// ---------------- BULK RETROATIVOS DIALOG ----------------
type BulkRow = {
  key: string;
  data: string;
  cufId: string;
  formadorId: string;
  hi: string;
  hf: string;
};

function makeRow(): BulkRow {
  return {
    key: Math.random().toString(36).slice(2),
    data: "",
    cufId: "",
    formadorId: "",
    hi: "09:00",
    hf: "13:00",
  };
}

function BulkRetroativosDialog({ open, onOpenChange, cursoId, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; cursoId: string; onSaved: () => void }) {
  const [rows, setRows] = useState<BulkRow[]>([makeRow()]);
  const [saving, setSaving] = useState(false);

  const limiteRetroativo = useMemo(() => {
    const hoje = new Date();
    return dateOnlyIso(hoje.getFullYear(), hoje.getMonth(), 1); // primeiro dia do mês atual (exclusivo)
  }, []);

  const ufcds = useQuery({
    queryKey: ["bulk-retro-ufcds", cursoId],
    enabled: open,
    queryFn: async () => {
      const [cu, sess] = await Promise.all([
        supabase.from("curso_ufcds")
          .select("id, horas_totais, ufcd:ufcds(codigo,designacao), formadores:curso_ufcd_formadores(formador_id, formador:formadores(id,nome,abreviatura,cor))")
          .eq("curso_id", cursoId),
        supabase.from("sessoes").select("curso_ufcd_id, horas").eq("curso_id", cursoId),
      ]);
      const realizadas = new Map<string, number>();
      (sess.data ?? []).forEach((s: any) => realizadas.set(s.curso_ufcd_id, (realizadas.get(s.curso_ufcd_id) ?? 0) + Number(s.horas)));
      return (cu.data ?? []).map((u: any) => ({
        ...u,
        horas_realizadas: realizadas.get(u.id) ?? 0,
        horas_em_falta: Math.max(0, Number(u.horas_totais) - (realizadas.get(u.id) ?? 0)),
      })).sort((a: any, b: any) => compareUfcdCodigo(a.ufcd?.codigo ?? "", b.ufcd?.codigo ?? ""));
    },
  });

  function update(key: string, patch: Partial<BulkRow>) {
    setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r));
  }
  function remove(key: string) {
    setRows(rs => rs.length === 1 ? [makeRow()] : rs.filter(r => r.key !== key));
  }
  function add() {
    setRows(rs => [...rs, makeRow()]);
  }
  function reset() {
    setRows([makeRow()]);
  }

  function formadoresDaUfcd(cufId: string): any[] {
    const cu = (ufcds.data ?? []).find((u: any) => u.id === cufId);
    if (!cu) return [];
    return (cu.formadores ?? []).map((ff: any) => ff.formador).filter(Boolean);
  }

  async function save() {
    // Validar
    const erros: string[] = [];
    const validas: BulkRow[] = [];
    rows.forEach((r, idx) => {
      const n = idx + 1;
      if (!r.data && !r.cufId && !r.formadorId) return; // linha vazia, ignorar
      if (!r.data) { erros.push(`Linha ${n}: dia em falta`); return; }
      if (r.data >= limiteRetroativo) { erros.push(`Linha ${n}: data deve ser anterior ao mês atual`); return; }
      if (!r.cufId) { erros.push(`Linha ${n}: UFCD em falta`); return; }
      if (!r.formadorId) { erros.push(`Linha ${n}: formador em falta`); return; }
      const horas = diffHoras(r.hi, r.hf);
      if (horas <= 0) { erros.push(`Linha ${n}: horas inválidas`); return; }
      validas.push(r);
    });
    if (validas.length === 0) return toast.error("Sem linhas válidas para lançar");
    if (erros.length > 0) return toast.error("Corrija as linhas inválidas", { description: erros.slice(0, 4).join(" · ") });

    setSaving(true);
    const payload = validas.map(r => ({
      curso_id: cursoId,
      curso_ufcd_id: r.cufId,
      formador_id: r.formadorId,
      data: r.data,
      hora_inicio: r.hi,
      hora_fim: r.hf,
      horas: diffHoras(r.hi, r.hf),
    }));
    const { error } = await supabase.from("sessoes").insert(payload as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${validas.length} sessão(ões) retroativa(s) criada(s)`);
    reset();
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Lançamentos retroativos em massa</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Só permite datas anteriores ao mês atual. Não é validada a disponibilidade declarada do formador.
          </div>

          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-[150px_1fr_1fr_110px_110px_40px] gap-2 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40">
              <div>Dia</div><div>UFCD</div><div>Formador</div><div>Início</div><div>Fim</div><div></div>
            </div>
            <div className="divide-y max-h-[55vh] overflow-y-auto">
              {rows.map(r => {
                const formadores = formadoresDaUfcd(r.cufId);
                return (
                  <div key={r.key} className="grid grid-cols-[150px_1fr_1fr_110px_110px_40px] gap-2 px-3 py-2 items-center">
                    <Input
                      type="date"
                      max={(() => { const d = new Date(limiteRetroativo); d.setDate(d.getDate() - 1); return dateOnlyIso(d.getFullYear(), d.getMonth(), d.getDate()); })()}
                      value={r.data}
                      onChange={e => update(r.key, { data: e.target.value })}
                      className="h-8"
                    />
                    <Select value={r.cufId} onValueChange={(v) => {
                      const fs = formadoresDaUfcd(v);
                      const keep = fs.some((f: any) => f.id === r.formadorId) ? r.formadorId : (fs.length === 1 ? fs[0].id : "");
                      update(r.key, { cufId: v, formadorId: keep });
                    }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Escolher UFCD…" /></SelectTrigger>
                      <SelectContent>
                        {(ufcds.data ?? []).map((u: any) => (
                          <SelectItem key={u.id} value={u.id}>{u.ufcd?.codigo} — {u.ufcd?.designacao}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={r.formadorId} onValueChange={(v) => update(r.key, { formadorId: v })} disabled={!r.cufId}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={!r.cufId ? "Escolher UFCD primeiro" : (formadores.length === 0 ? "Sem formadores atribuídos" : "Escolher…")} /></SelectTrigger>
                      <SelectContent>
                        {formadores.map((f: any) => (
                          <SelectItem key={f.id} value={f.id}>{formadorLabel(f)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="time" value={r.hi} onChange={e => update(r.key, { hi: e.target.value })} className="h-8" />
                    <Input type="time" value={r.hf} onChange={e => update(r.key, { hf: e.target.value })} className="h-8" />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(r.key)} title="Remover linha">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={add}><Plus className="size-4" /> Adicionar linha</Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "A guardar…" : "Lançar sessões"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
