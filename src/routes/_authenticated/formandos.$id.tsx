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
import { ArrowLeft, Pencil, Trash2, Download, Upload, Plus } from "lucide-react";
import { EstadoFormandoBadge } from "./formandos.index";
import { FormandoDialog } from "@/components/formando-dialog";
import { fmtDate, INSCRICAO_ESTADO_LABEL, MONTH_NAMES } from "@/lib/format";
import { compareUfcdCodigo } from "@/lib/utils";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormandoFinanceiroPanel } from "@/components/formando-financeiro-panel";

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
          .select("id, data_inscricao, data_desistencia, data_conclusao, estado, curso:cursos(id, nome, codigo, estado)")
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
          <TabsTrigger value="horas">Horas</TabsTrigger>
          <TabsTrigger value="faltas">Faltas</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
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
            <Field label="IBAN" value={f.iban} />
            <Field label="BIC/SWIFT" value={(f as any).bic} />
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
                      <div className="text-xs text-muted-foreground">
                        Inscrito a {fmtDate(i.data_inscricao)}
                        {i.data_desistencia && ` · Desistência a ${fmtDate(i.data_desistencia)}`}
                        {i.data_conclusao && ` · Concluído a ${fmtDate(i.data_conclusao)}`}
                      </div>
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

        <TabsContent value="horas">
          <Card><CardContent className="p-6 space-y-6">
            {q.data.inscricoes.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">Sem inscrições.</div>
            ) : (
              q.data.inscricoes.map((i: any) => (
                <HorasCurso key={i.id} cursoFormandoId={i.id} curso={i.curso} />
              ))
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="faltas">
          <Card><CardContent className="p-6">
            <FaltasFormando inscricoes={q.data.inscricoes} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="financeiro">
          <FormandoFinanceiroPanel formandoId={id} />
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
      const [cu, pra, atrib] = await Promise.all([
        supabase.from("curso_ufcds")
          .select("id, ufcd:ufcds(id, codigo, designacao)")
          .eq("curso_id", curso.id),
        supabase.from("formando_pra" as any)
          .select("id, curso_ufcd_id, nome, storage_path, nota")
          .eq("curso_formando_id", cursoFormandoId),
        supabase.from("curso_formando_ufcds" as any)
          .select("curso_ufcd_id")
          .eq("curso_formando_id", cursoFormandoId),
      ]);
      const praMap = new Map<string, any>();
      ((pra.data ?? []) as any[]).forEach((p) => praMap.set(p.curso_ufcd_id, p));
      const assigned = new Set<string>(((atrib.data ?? []) as any[]).map((p) => p.curso_ufcd_id));
      return (cu.data ?? [])
        .filter((u: any) => assigned.has(u.id))
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
    // keep row if it has a nota; otherwise delete entirely
    if (p.nota && p.nota.trim().length > 0) {
      await supabase.from("formando_pra" as any).update({ nome: null, storage_path: null } as any).eq("id", p.id);
    } else {
      await supabase.from("formando_pra" as any).delete().eq("id", p.id);
    }
    qc.invalidateQueries({ queryKey: ["pra-curso", cursoFormandoId] });
  }

  async function saveNota(cursoUfcdId: string, existing: any, nota: string) {
    const value = nota.trim() || null;
    if (existing) {
      const { error } = await supabase.from("formando_pra" as any).update({ nota: value } as any).eq("id", existing.id);
      if (error) return toast.error(error.message);
    } else {
      if (!value) return; // nothing to save
      const { error } = await supabase.from("formando_pra" as any).insert(
        { curso_formando_id: cursoFormandoId, curso_ufcd_id: cursoUfcdId, nota: value } as any,
      );
      if (error) return toast.error(error.message);
    }
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
        <div className="text-xs text-muted-foreground italic">Sem UFCD atribuídas a este formando. Atribua-as no separador Horas.</div>

      ) : (
        <div className="space-y-1.5">
          {ufcds.map((u: any) => (
            <PraRow
              key={u.id}
              cursoUfcdId={u.id}
              ufcd={u.ufcd}
              pra={u.pra}
              onUpload={(f) => upload(u.id, f)}
              onDownload={() => download(u.pra)}
              onRemove={() => remove(u.pra)}
              onSaveNota={(nota) => saveNota(u.id, u.pra, nota)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PraRow({
  cursoUfcdId,
  ufcd,
  pra,
  onUpload,
  onDownload,
  onRemove,
  onSaveNota,
}: {
  cursoUfcdId: string;
  ufcd: { codigo: string; designacao: string } | null;
  pra: { id: string; nome: string | null; storage_path: string | null; nota: string | null } | null;
  onUpload: (file: File) => void;
  onDownload: () => void;
  onRemove: () => void;
  onSaveNota: (nota: string) => void;
}) {
  void cursoUfcdId;
  const hasDoc = !!pra?.storage_path;
  const [nota, setNota] = useState<string>(pra?.nota ?? "");
  const initial = pra?.nota ?? "";

  return (
    <div
      className={
        "rounded-md border px-3 py-2 text-sm transition-colors " +
        (hasDoc ? "bg-green-500/10 border-green-500/40" : "bg-red-500/10 border-red-500/40")
      }
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{ufcd?.codigo}</span>
            <span className="truncate">{ufcd?.designacao}</span>
          </div>
          {hasDoc && pra?.nome && (
            <div className="text-xs text-muted-foreground truncate mt-0.5">{pra.nome}</div>
          )}
        </div>
        {hasDoc ? (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={onDownload}>
              <Download className="size-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
              <Trash2 className="size-3.5" />
            </Button>
            <label className="cursor-pointer">
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border hover:bg-muted">
                <Upload className="size-3.5" /> Substituir
              </span>
              <input
                type="file"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }}
              />
            </label>
          </>
        ) : (
          <label className="cursor-pointer">
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border hover:bg-background">
              <Upload className="size-3.5" /> Carregar PRA
            </span>
            <input
              type="file"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }}
            />
          </label>
        )}
      </div>
      <Textarea
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        onBlur={() => { if ((nota ?? "") !== initial) onSaveNota(nota); }}
        placeholder="Observações sobre o PRA (notas do formador)…"
        className="mt-2 min-h-[52px] bg-background/60"
      />
    </div>
  );
}

function monthKey(d: string) { return d.slice(0, 7); }
function monthLabel(k: string) {
  const [y, m] = k.split("-");
  const nomes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return `${nomes[Number(m) - 1]} ${y}`;
}

function HorasCurso({ cursoFormandoId, curso }: { cursoFormandoId: string; curso: { id: string; nome: string; codigo: string } }) {
  const qc = useQueryClient();
  const [mes, setMes] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [editUfcd, setEditUfcd] = useState(false);

  const q = useQuery({
    queryKey: ["horas-curso", cursoFormandoId],
    queryFn: async () => {
      const [cu, atrib, sess, faltas] = await Promise.all([
        supabase.from("curso_ufcds").select("id, ufcd:ufcds(id, codigo, designacao)").eq("curso_id", curso.id),
        supabase.from("curso_formando_ufcds" as any).select("curso_ufcd_id").eq("curso_formando_id", cursoFormandoId),
        supabase.from("sessoes").select("id, curso_ufcd_id, data, hora_inicio, hora_fim, horas").eq("curso_id", curso.id),
        supabase.from("formando_faltas").select("sessao_id, horas, tipo").eq("curso_formando_id", cursoFormandoId),
      ]);
      const ufcds = ((cu.data ?? []) as any[])
        .map(c => ({ id: c.id, ufcd: c.ufcd }))
        .sort((a, b) => compareUfcdCodigo(a.ufcd?.codigo ?? "", b.ufcd?.codigo ?? ""));
      const assigned = new Set<string>(((atrib.data ?? []) as any[]).map(p => p.curso_ufcd_id));
      const faltaMap = new Map<string, any>();
      ((faltas.data ?? []) as any[]).forEach(f => faltaMap.set(f.sessao_id, f));
      return { ufcds, assigned, sessions: (sess.data ?? []) as any[], faltaMap };
    },
  });

  async function toggleUfcd(cursoUfcdId: string, on: boolean) {
    if (on) {
      const { error } = await supabase.from("curso_formando_ufcds" as any)
        .insert({ curso_formando_id: cursoFormandoId, curso_ufcd_id: cursoUfcdId } as any);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("curso_formando_ufcds" as any).delete()
        .eq("curso_formando_id", cursoFormandoId).eq("curso_ufcd_id", cursoUfcdId);
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["horas-curso", cursoFormandoId] });
  }

  const data = q.data;
  if (!data) return <div className="text-sm text-muted-foreground">A carregar…</div>;

  const sessMes = data.sessions
    .filter(s => data.assigned.has(s.curso_ufcd_id) && monthKey(s.data) === mes)
    .sort((a, b) => (a.data + a.hora_inicio).localeCompare(b.data + b.hora_inicio));

  const total = sessMes.reduce((a, s) => a + (Number(s.horas) || 0), 0);
  const faltasH = sessMes.reduce((a, s) => {
    const f = data.faltaMap.get(s.id);
    return a + (f ? (Number(f.horas) || Number(s.horas) || 0) : 0);
  }, 0);

  // month options: current +/- 12
  const opts: string[] = [];
  const now = new Date();
  for (let i = -18; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link to="/cursos/$id" params={{ id: curso.id }} className="font-medium hover:underline">
          {curso.codigo} — {curso.nome}
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditUfcd(v => !v)}>
            {editUfcd ? "Fechar" : "Gerir UFCD"} ({data.assigned.size}/{data.ufcds.length})
          </Button>
          <select
            value={mes}
            onChange={e => setMes(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {opts.map(o => <option key={o} value={o}>{monthLabel(o)}</option>)}
          </select>
        </div>
      </div>

      {editUfcd && (
        <div className="rounded-md border p-3 space-y-1.5 bg-muted/30">
          <div className="text-xs text-muted-foreground mb-1">Selecione as UFCD que este formando frequenta neste curso:</div>
          {data.ufcds.length === 0 ? (
            <div className="text-xs italic text-muted-foreground">O curso ainda não tem UFCD atribuídas.</div>
          ) : data.ufcds.map(u => (
            <label key={u.id} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
              <input
                type="checkbox"
                checked={data.assigned.has(u.id)}
                onChange={e => toggleUfcd(u.id, e.target.checked)}
              />
              <span className="font-mono text-xs text-muted-foreground">{u.ufcd?.codigo}</span>
              <span>{u.ufcd?.designacao}</span>
            </label>
          ))}
        </div>
      )}

      <div className="rounded-md border overflow-hidden">
        <div className="px-3 py-2 bg-muted/40 text-sm font-medium">{monthLabel(mes)}</div>
        {(() => {
          // Aggregate by UFCD
          const byUfcd = new Map<string, { codigo: string; nome: string; horas: number; realizadas: number }>();
          for (const s of sessMes) {
            const u = data.ufcds.find(x => x.id === s.curso_ufcd_id);
            const key = s.curso_ufcd_id;
            const h = Number(s.horas) || 0;
            const f = data.faltaMap.get(s.id);
            const cur = byUfcd.get(key) ?? { codigo: u?.ufcd?.codigo ?? "", nome: u?.ufcd?.designacao ?? "", horas: 0, realizadas: 0 };
            cur.horas += h;
            cur.realizadas += f ? 0 : h;
            byUfcd.set(key, cur);
          }
          const linhas = [...byUfcd.values()].sort((a, b) => compareUfcdCodigo(a.codigo, b.codigo));
          if (linhas.length === 0) {
            return <div className="text-sm text-muted-foreground text-center py-6">Sem sessões nas UFCD atribuídas para este mês.</div>;
          }
          return (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left px-3 py-1.5 font-medium w-28">Código</th>
                  <th className="text-left px-3 py-1.5 font-medium">UFCD</th>
                  <th className="text-right px-3 py-1.5 font-medium w-24">Horas</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1.5 font-mono text-xs">{r.codigo}</td>
                    <td className="px-3 py-1.5">{r.nome}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {r.realizadas}h
                      {r.realizadas !== r.horas && <span className="text-muted-foreground"> / {r.horas}h</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30 font-medium">
                  <td className="px-3 py-1.5" colSpan={2}>Total do mês</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {total - faltasH}h
                    {faltasH > 0 && <span className="text-muted-foreground"> / {total}h</span>}
                  </td>
                </tr>
              </tfoot>
            </table>
          );
        })()}
      </div>

    </div>
  );
}

function FaltasFormando({ inscricoes }: { inscricoes: any[] }) {
  const qc = useQueryClient();
  const ids = inscricoes.map(i => i.id);
  const cursoById = new Map(inscricoes.map(i => [i.id, i.curso]));
  const [marcar, setMarcar] = useState(false);

  const q = useQuery({
    queryKey: ["faltas-formando", ids.sort().join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data: faltas, error } = await supabase
        .from("formando_faltas")
        .select("id, curso_formando_id, data, horas, tipo, observacoes, sessao_id")
        .in("curso_formando_id", ids)
        .order("data", { ascending: false });
      if (error) throw error;
      const sessaoIds = Array.from(new Set((faltas ?? []).map((f: any) => f.sessao_id).filter(Boolean)));
      let sessMap = new Map<string, any>();
      if (sessaoIds.length) {
        const { data: sess } = await supabase
          .from("sessoes")
          .select("id, hora_inicio, hora_fim, curso_ufcd:curso_ufcds(ufcd:ufcds(codigo, designacao))")
          .in("id", sessaoIds);
        sessMap = new Map(((sess ?? []) as any[]).map(s => [s.id, s]));
      }
      return (faltas ?? []).map((f: any) => ({ ...f, sessao: sessMap.get(f.sessao_id) ?? null }));
    },
  });

  async function removerFalta(id: string) {
    const { error } = await supabase.from("formando_faltas").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Falta removida");
    qc.invalidateQueries({ queryKey: ["faltas-formando"] });
  }

  if (ids.length === 0) return <div className="text-sm text-muted-foreground text-center py-8">Sem inscrições.</div>;

  const inscricoesAtivas = inscricoes.filter(i => i.estado === "inscrito" || i.estado === "em_formacao");

  const rows = q.data ?? [];
  const tipoLabel: Record<string, string> = { justificada: "Justificada", injustificada: "Injustificada", ausencia: "Ausência", online: "Online" };
  const tipoCls: Record<string, string> = {
    justificada: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    injustificada: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
    ausencia: "bg-muted text-muted-foreground border-border",
    online: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30",
  };

  const totais = rows.reduce((acc: any, r: any) => {
    if (r.tipo === "online") { acc.online += 1; return acc; }
    acc.total += Number(r.horas ?? 0);
    if (r.tipo === "justificada") acc.just += Number(r.horas ?? 0);
    else if (r.tipo === "injustificada") acc.inj += Number(r.horas ?? 0);
    else acc.aus += Number(r.horas ?? 0);
    return acc;
  }, { total: 0, just: 0, inj: 0, aus: 0, online: 0 });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm flex-1">
          <StatMini label="Total horas" value={totais.total.toFixed(1) + "h"} />
          <StatMini label="Justificadas" value={totais.just.toFixed(1) + "h"} />
          <StatMini label="Injustificadas" value={totais.inj.toFixed(1) + "h"} />
          <StatMini label="Ausências" value={totais.aus.toFixed(1) + "h"} />
          <StatMini label="Sessões online" value={String(totais.online)} />
        </div>
        <Button
          onClick={() => setMarcar(true)}
          disabled={inscricoesAtivas.length === 0}
          title={inscricoesAtivas.length === 0 ? "Sem inscrições ativas" : undefined}
        >
          <Plus className="size-4" /> Marcar falta
        </Button>
      </div>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground text-center py-8">A carregar…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">Sem faltas registadas.</div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b">
            <tr>
              <th className="text-left py-2 font-medium">Data</th>
              <th className="text-left py-2 font-medium">Horário</th>
              <th className="text-left py-2 font-medium">Curso</th>
              <th className="text-left py-2 font-medium">UFCD</th>
              <th className="text-center py-2 font-medium">Horas</th>
              <th className="text-left py-2 font-medium">Tipo</th>
              <th className="text-left py-2 font-medium">Observações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => {
              const curso: any = cursoById.get(r.curso_formando_id);
              const uf = r.sessao?.curso_ufcd?.ufcd;
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 pr-2 whitespace-nowrap">{fmtDate(r.data)}</td>
                  <td className="py-2 pr-2 whitespace-nowrap text-xs text-muted-foreground">
                    {r.sessao ? `${r.sessao.hora_inicio?.slice(0,5)}–${r.sessao.hora_fim?.slice(0,5)}` : "—"}
                  </td>
                  <td className="py-2 pr-2 text-xs">
                    {curso ? (
                      <Link to="/cursos/$id" params={{ id: curso.id }} className="hover:underline">
                        {curso.codigo}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="py-2 pr-2 text-xs">
                    {uf ? <span><span className="font-mono">{uf.codigo}</span> — {uf.designacao}</span> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-2 pr-2 text-center">{Number(r.horas ?? 0).toFixed(1)}</td>
                  <td className="py-2 pr-2">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full border ${tipoCls[r.tipo] ?? ""}`}>
                      {tipoLabel[r.tipo] ?? r.tipo}
                    </span>
                  </td>
                  <td className="py-2 text-xs text-muted-foreground">{r.tipo === "online" ? (r.observacoes ? `Sessão online — ${r.observacoes}` : "Sessão online") : (r.observacoes || "—")}</td>
                  <td className="py-2 pr-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => removerFalta(r.id)} title="Remover"><Trash2 className="size-3.5" /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      <MarcarFaltaDialog
        open={marcar}
        onOpenChange={setMarcar}
        inscricoes={inscricoesAtivas}
        onSaved={() => qc.invalidateQueries({ queryKey: ["faltas-formando"] })}
      />
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold tracking-tight mt-0.5">{value}</div>
    </div>
  );
}

type TipoFalta = "justificada" | "injustificada" | "ausencia" | "online";

function MarcarFaltaDialog({
  open, onOpenChange, inscricoes, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  inscricoes: any[];
  onSaved: () => void;
}) {
  const [mes, setMes] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [selected, setSelected] = useState<any | null>(null);
  const [tipo, setTipo] = useState<TipoFalta>("injustificada");
  const [horas, setHoras] = useState<string>("");
  const [obs, setObs] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // month options
  const monthOpts: string[] = [];
  const now = new Date();
  for (let i = -18; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    monthOpts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const cursoIds = Array.from(new Set(inscricoes.map(i => i.curso.id)));
  const inscByCurso = new Map(inscricoes.map(i => [i.curso.id, i]));

  const q = useQuery({
    queryKey: ["marcar-falta-sessoes", cursoIds.sort().join(","), mes, inscricoes.map(i => i.id).sort().join(",")],
    enabled: open && cursoIds.length > 0,
    queryFn: async () => {
      const [ano, m] = mes.split("-").map(Number);
      const first = `${mes}-01`;
      const nextMonth = new Date(ano, m, 1);
      const last = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
      const { data: sess, error } = await supabase
        .from("sessoes")
        .select("id, curso_id, data, hora_inicio, hora_fim, horas, curso_ufcd:curso_ufcds(ufcd:ufcds(codigo, designacao))")
        .in("curso_id", cursoIds)
        .gte("data", first).lt("data", last)
        .order("data", { ascending: true });
      if (error) throw error;
      const sessaoIds = (sess ?? []).map((s: any) => s.id);
      const inscIds = inscricoes.map(i => i.id);
      let faltasMap = new Map<string, any>();
      if (sessaoIds.length && inscIds.length) {
        const { data: fx } = await supabase
          .from("formando_faltas")
          .select("id, sessao_id, curso_formando_id, tipo, horas, observacoes")
          .in("sessao_id", sessaoIds)
          .in("curso_formando_id", inscIds);
        faltasMap = new Map(((fx ?? []) as any[]).map(f => [f.sessao_id, f]));
      }
      return (sess ?? []).map((s: any) => {
        const insc: any = inscByCurso.get(s.curso_id);
        const dataLimite = insc ? (insc.data_desistencia && insc.data_conclusao ? (insc.data_desistencia < insc.data_conclusao ? insc.data_desistencia : insc.data_conclusao) : (insc.data_desistencia || insc.data_conclusao || null)) : null;
        const foraDoPeriodo = dataLimite ? s.data > dataLimite : false;
        return { ...s, insc, foraDoPeriodo, falta: faltasMap.get(s.id) ?? null };
      });
    },
  });

  function openSessao(s: any) {
    setSelected(s);
    setTipo((s.falta?.tipo as TipoFalta) ?? "injustificada");
    setHoras(String(s.falta?.horas ?? s.horas ?? ""));
    setObs(s.falta?.observacoes ?? "");
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      const h = tipo === "online" ? 0 : Math.max(0, Math.min(Number(horas) || Number(selected.horas), Number(selected.horas)));
      const payload = {
        curso_formando_id: selected.insc.id,
        sessao_id: selected.id,
        data: selected.data,
        horas: h,
        tipo,
        observacoes: obs.trim() || null,
      };
      if (selected.falta) {
        const { error } = await supabase.from("formando_faltas").update(payload as never).eq("id", selected.falta.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("formando_faltas").insert(payload as never);
        if (error) throw error;
      }
      toast.success("Falta registada");
      setSelected(null);
      onSaved();
    } catch (e: any) {
      toast.error("Erro a guardar", { description: e.message });
    } finally {
      setSaving(false);
    }
  }

  const monthLabel = (k: string) => {
    const [y, mm] = k.split("-");
    return `${MONTH_NAMES[Number(mm) - 1]} ${y}`;
  };

  const sessoes = (q.data ?? []).filter((s: any) => !s.foraDoPeriodo);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Marcar falta</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Mês:</label>
          <select
            value={mes}
            onChange={e => { setMes(e.target.value); setSelected(null); }}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {monthOpts.map(o => <option key={o} value={o}>{monthLabel(o)}</option>)}
          </select>
        </div>

        {q.isLoading ? (
          <div className="text-sm text-muted-foreground text-center py-6">A carregar…</div>
        ) : sessoes.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">Sem sessões nos cursos inscritos neste mês.</div>
        ) : (
          <div className="max-h-[45vh] overflow-y-auto -mx-6 px-6">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground sticky top-0 bg-background border-b">
                <tr>
                  <th className="text-left py-2 font-medium">Data</th>
                  <th className="text-left py-2 font-medium">Horário</th>
                  <th className="text-left py-2 font-medium">Curso</th>
                  <th className="text-left py-2 font-medium">UFCD</th>
                  <th className="text-center py-2 font-medium">Horas</th>
                  <th className="text-left py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {sessoes.map((s: any) => {
                  const uf = s.curso_ufcd?.ufcd;
                  const isSel = selected?.id === s.id;
                  return (
                    <tr
                      key={s.id}
                      onClick={() => openSessao(s)}
                      className={`border-b last:border-0 cursor-pointer hover:bg-muted/40 ${isSel ? "bg-primary/10" : ""}`}
                    >
                      <td className="py-2 pr-2 whitespace-nowrap">{fmtDate(s.data)}</td>
                      <td className="py-2 pr-2 whitespace-nowrap text-xs text-muted-foreground">{s.hora_inicio?.slice(0,5)}–{s.hora_fim?.slice(0,5)}</td>
                      <td className="py-2 pr-2 text-xs">{s.insc?.curso?.codigo ?? "—"}</td>
                      <td className="py-2 pr-2 text-xs">{uf ? <span><span className="font-mono">{uf.codigo}</span> — {uf.designacao}</span> : "—"}</td>
                      <td className="py-2 pr-2 text-center">{Number(s.horas ?? 0)}</td>
                      <td className="py-2 text-xs">
                        {s.falta ? <span className="text-amber-600">Falta registada</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {selected && (
          <div className="rounded-md border p-3 space-y-3 bg-muted/20">
            <div className="text-sm font-medium">
              {fmtDate(selected.data)} · {selected.hora_inicio?.slice(0,5)}–{selected.hora_fim?.slice(0,5)} · {selected.insc?.curso?.codigo}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(["justificada","injustificada","ausencia","online"] as TipoFalta[]).map(t => (
                <label key={t} className="flex items-center gap-2 text-sm border rounded-md px-2 py-1.5 cursor-pointer hover:bg-background">
                  <input type="radio" name="tipo-falta" checked={tipo === t} onChange={() => setTipo(t)} />
                  <span className="capitalize">{t}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground w-16">Horas</label>
              <Input
                type="number" step="0.5" min="0" max={selected.horas}
                value={horas} onChange={e => setHoras(e.target.value)}
                disabled={tipo === "online"}
                placeholder={String(selected.horas)}
                className="h-8 w-24"
              />
              <span className="text-xs text-muted-foreground">de {selected.horas}h</span>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Observações</label>
              <Input value={obs} onChange={e => setObs(e.target.value)} className="h-8" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Fechar</Button>
          <Button onClick={save} disabled={!selected || saving}>{saving ? "A guardar…" : "Guardar falta"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
