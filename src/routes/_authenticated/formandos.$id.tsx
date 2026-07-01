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
          <TabsTrigger value="horas">Horas</TabsTrigger>
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
        <div className="text-xs text-muted-foreground italic">Sem UFCD atribuídas a este curso.</div>
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
  const q = useQuery({
    queryKey: ["horas-curso", cursoFormandoId],
    queryFn: async () => {
      const [cu, pra, sess, faltas] = await Promise.all([
        supabase.from("curso_ufcds").select("id, ufcd:ufcds(id, codigo, designacao)").eq("curso_id", curso.id),
        supabase.from("formando_pra" as any).select("curso_ufcd_id").eq("curso_formando_id", cursoFormandoId),
        supabase.from("sessoes").select("id, curso_ufcd_id, data, horas").eq("curso_id", curso.id),
        supabase.from("formando_faltas").select("sessao_id, horas, tipo").eq("curso_formando_id", cursoFormandoId),
      ]);
      const ufcdMap = new Map<string, any>();
      ((cu.data ?? []) as any[]).forEach(c => ufcdMap.set(c.id, c.ufcd));
      const assigned = new Set<string>(((pra.data ?? []) as any[]).map(p => p.curso_ufcd_id));
      const faltaMap = new Map<string, any>();
      ((faltas.data ?? []) as any[]).forEach(f => faltaMap.set(f.sessao_id, f));
      const filtered = ((sess.data ?? []) as any[]).filter(s => assigned.has(s.curso_ufcd_id));
      return { ufcdMap, assigned, sessions: filtered, faltaMap };
    },
  });

  const data = q.data;
  if (!data) return <div className="text-sm text-muted-foreground">A carregar…</div>;

  const totalAssigned = data.assigned.size;

  // group by month
  const byMonth = new Map<string, { total: number; realizadas: number; faltasJ: number; faltasI: number; perUfcd: Map<string, { total: number; falta: number }> }>();
  for (const s of data.sessions) {
    const k = monthKey(s.data);
    if (!byMonth.has(k)) byMonth.set(k, { total: 0, realizadas: 0, faltasJ: 0, faltasI: 0, perUfcd: new Map() });
    const m = byMonth.get(k)!;
    const h = Number(s.horas) || 0;
    const f = data.faltaMap.get(s.id);
    m.total += h;
    if (!f) m.realizadas += h;
    else if (f.tipo === "justificada") m.faltasJ += Number(f.horas) || h;
    else m.faltasI += Number(f.horas) || h;
    const key = s.curso_ufcd_id;
    if (!m.perUfcd.has(key)) m.perUfcd.set(key, { total: 0, falta: 0 });
    const u = m.perUfcd.get(key)!;
    u.total += h;
    if (f) u.falta += Number(f.horas) || h;
  }

  const months = Array.from(byMonth.keys()).sort();
  const totGlobal = data.sessions.reduce((a, s) => a + (Number(s.horas) || 0), 0);
  const totFaltas = data.sessions.reduce((a, s) => {
    const f = data.faltaMap.get(s.id);
    return a + (f ? (Number(f.horas) || Number(s.horas) || 0) : 0);
  }, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link to="/cursos/$id" params={{ id: curso.id }} className="font-medium hover:underline">
          {curso.codigo} — {curso.nome}
        </Link>
        <div className="text-xs text-muted-foreground">
          {totalAssigned} UFCD atribuídas · Total {totGlobal}h · Realizadas {totGlobal - totFaltas}h · Faltas {totFaltas}h
        </div>
      </div>

      {totalAssigned === 0 ? (
        <div className="text-xs text-muted-foreground italic">Sem UFCD atribuídas ao formando (carregue um PRA ou nota no separador PRA para atribuir).</div>
      ) : months.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">Sem sessões nas UFCD atribuídas.</div>
      ) : (
        <div className="space-y-4">
          {months.map(k => {
            const m = byMonth.get(k)!;
            const rows = Array.from(m.perUfcd.entries())
              .map(([id, v]) => ({ ufcd: data.ufcdMap.get(id), total: v.total, falta: v.falta }))
              .sort((a, b) => compareUfcdCodigo(a.ufcd?.codigo ?? "", b.ufcd?.codigo ?? ""));
            return (
              <div key={k} className="rounded-md border overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 flex items-center justify-between text-sm">
                  <span className="font-medium">{monthLabel(k)}</span>
                  <span className="text-xs text-muted-foreground">
                    Total {m.total}h · Realizadas {m.realizadas}h
                    {m.faltasJ > 0 && ` · Just. ${m.faltasJ}h`}
                    {m.faltasI > 0 && ` · Injust. ${m.faltasI}h`}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground bg-background">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium">UFCD</th>
                      <th className="text-right px-3 py-1.5 font-medium w-24">Horas</th>
                      <th className="text-right px-3 py-1.5 font-medium w-24">Faltas</th>
                      <th className="text-right px-3 py-1.5 font-medium w-28">Realizadas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="px-3 py-1.5">
                          <span className="font-mono text-xs text-muted-foreground mr-2">{r.ufcd?.codigo}</span>
                          {r.ufcd?.designacao}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.total}h</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.falta > 0 ? `${r.falta}h` : "—"}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.total - r.falta}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
