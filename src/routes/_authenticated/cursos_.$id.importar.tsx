import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, Trash2, Save, Sparkles, Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  extrairCronogramaPdf,
  criarFormadorRapido,
  criarUfcdNoCurso,
  type SessaoExtraida,
} from "@/lib/import-cronograma.functions";
import { supabase } from "@/integrations/supabase/client";
import { diffHoras } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/cursos_/$id/importar")({
  head: () => ({ meta: [{ title: "Importar cronograma" }] }),
  component: ImportarCronograma,
});

type Row = SessaoExtraida & { curso_ufcd_id: string | null; formador_id: string | null };
type Ufcd = { id: string; codigo: string; designacao: string; horas_totais: number; horas_existentes: number };
type Formador = { id: string; nome: string; abreviatura: string | null };

const NEW_UFCD = "__new_ufcd__";
const NEW_FORM = "__new_formador__";

function ImportarCronograma() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const extrair = useServerFn(extrairCronogramaPdf);
  const novoFormador = useServerFn(criarFormadorRapido);
  const novaUfcd = useServerFn(criarUfcdNoCurso);

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [cufcds, setCufcds] = useState<Ufcd[]>([]);
  const [formadores, setFormadores] = useState<Formador[]>([]);

  // dialogs
  const [ufcdDlg, setUfcdDlg] = useState<{ rowIdx: number; codigo: string; designacao: string; horas: string } | null>(null);
  const [formDlg, setFormDlg] = useState<{ rowIdx: number; nome: string; abreviatura: string } | null>(null);

  async function onExtract() {
    if (!file) return toast.error("Seleciona um PDF");
    setLoading(true);
    try {
      const b64 = await fileToBase64(file);
      const r = await extrair({ data: { cursoId: id, pdfBase64: b64, filename: file.name } });
      setCufcds(r.curso_ufcds);
      setFormadores(r.formadores);
      setRows(r.sessoes.map((s) => ({
        ...s,
        curso_ufcd_id: matchUfcd(s.ufcd_codigo, s.ufcd_nome, r.curso_ufcds),
        formador_id: matchFormador(s.formador_nome, r.formadores),
      })));
      toast.success(`${r.sessoes.length} sessões extraídas. Revê antes de gravar.`);
    } catch (e: any) {
      toast.error(e.message ?? "Falhou a extração");
    } finally {
      setLoading(false);
    }
  }

  // Validações
  const warnings = useMemo(() => {
    const ufcdExc: { ufcd: Ufcd; total: number }[] = [];
    const usoPorUfcd: Record<string, number> = {};
    rows.forEach((r) => {
      if (!r.curso_ufcd_id || !r.hora_inicio || !r.hora_fim) return;
      usoPorUfcd[r.curso_ufcd_id] = (usoPorUfcd[r.curso_ufcd_id] ?? 0) + diffHoras(r.hora_inicio, r.hora_fim);
    });
    cufcds.forEach((u) => {
      const total = (usoPorUfcd[u.id] ?? 0) + u.horas_existentes;
      if (total > u.horas_totais) ufcdExc.push({ ufcd: u, total });
    });

    const dispWarn: { idx: number; motivo: string }[] = [];
    rows.forEach((r, idx) => {
      if (!r.formador_id || !r.data || !r.hora_inicio || !r.hora_fim) return;
      const dias = disponibilidades.filter((d) => d.formador_id === r.formador_id && d.data === r.data);
      if (dias.length === 0) {
        dispWarn.push({ idx, motivo: "Sem disponibilidade registada nesse dia" });
        return;
      }
      const cobre = dias.some((d) => d.tipo === "disponivel" && d.hora_inicio <= r.hora_inicio && d.hora_fim >= r.hora_fim);
      if (!cobre) dispWarn.push({ idx, motivo: "Fora do intervalo de disponibilidade" });
    });

    return { ufcdExc, dispWarn };
  }, [rows, cufcds, disponibilidades]);

  async function handleUfcdChange(i: number, v: string) {
    if (v === NEW_UFCD) {
      const guess = rows[i];
      setUfcdDlg({
        rowIdx: i,
        codigo: guess.ufcd_codigo ?? "",
        designacao: guess.ufcd_nome ?? "",
        horas: "25",
      });
      return;
    }
    updateRow(i, { curso_ufcd_id: v });
  }
  async function handleFormChange(i: number, v: string) {
    if (v === NEW_FORM) {
      setFormDlg({ rowIdx: i, nome: rows[i].formador_nome ?? "", abreviatura: "" });
      return;
    }
    updateRow(i, { formador_id: v });
  }

  async function confirmCriarUfcd() {
    if (!ufcdDlg) return;
    const horas = Number(ufcdDlg.horas);
    if (!ufcdDlg.codigo.trim() || !ufcdDlg.designacao.trim() || !horas) {
      return toast.error("Preenche código, designação e horas");
    }
    try {
      const created = await novaUfcd({
        data: { cursoId: id, codigo: ufcdDlg.codigo.trim(), designacao: ufcdDlg.designacao.trim(), horas_referencia: horas },
      });
      const novo: Ufcd = { ...created };
      setCufcds((cs) => (cs.some((c) => c.id === novo.id) ? cs : [...cs, novo]));
      // aplica a todas as linhas que tinham o mesmo código original e ainda não estavam atribuídas
      const codigoAlvo = ufcdDlg.codigo.trim().toLowerCase();
      setRows((rs) => rs.map((r, idx) =>
        idx === ufcdDlg.rowIdx || (!r.curso_ufcd_id && (r.ufcd_codigo ?? "").toLowerCase() === codigoAlvo)
          ? { ...r, curso_ufcd_id: novo.id, ufcd_codigo: novo.codigo, ufcd_nome: novo.designacao }
          : r
      ));
      toast.success("UFCD adicionada ao curso");
      setUfcdDlg(null);
    } catch (e: any) {
      toast.error(e.message ?? "Falhou criar UFCD");
    }
  }

  async function confirmCriarFormador() {
    if (!formDlg) return;
    if (!formDlg.nome.trim()) return toast.error("Indica o nome");
    try {
      const created = await novoFormador({
        data: { nome: formDlg.nome.trim(), abreviatura: formDlg.abreviatura.trim() || null },
      });
      const novo: Formador = { id: created.id, nome: created.nome, abreviatura: created.abreviatura };
      setFormadores((fs) => [...fs, novo]);
      const nomeAlvo = formDlg.nome.trim().toLowerCase();
      setRows((rs) => rs.map((r, idx) =>
        idx === formDlg.rowIdx || (!r.formador_id && (r.formador_nome ?? "").toLowerCase() === nomeAlvo)
          ? { ...r, formador_id: novo.id, formador_nome: novo.nome }
          : r
      ));
      toast.success("Formador criado");
      setFormDlg(null);
    } catch (e: any) {
      toast.error(e.message ?? "Falhou criar formador");
    }
  }

  async function onSave() {
    const invalid = rows.filter((r) => !r.data || !r.hora_inicio || !r.hora_fim || !r.curso_ufcd_id || !r.formador_id);
    if (invalid.length) return toast.error(`${invalid.length} linha(s) incompletas. Preenche UFCD e formador.`);

    if (warnings.ufcdExc.length || warnings.dispWarn.length) {
      const msg = [
        warnings.ufcdExc.length ? `${warnings.ufcdExc.length} UFCD com horas excedidas` : null,
        warnings.dispWarn.length ? `${warnings.dispWarn.length} sessões fora da disponibilidade do formador` : null,
      ].filter(Boolean).join(" · ");
      if (!confirm(`Existem avisos:\n${msg}\n\nGravar mesmo assim?`)) return;
    }

    setSaving(true);
    try {
      const payload = rows.map((r) => ({
        curso_id: id,
        curso_ufcd_id: r.curso_ufcd_id!,
        formador_id: r.formador_id!,
        data: r.data,
        hora_inicio: r.hora_inicio,
        hora_fim: r.hora_fim,
        horas: diffHoras(r.hora_inicio, r.hora_fim),
        observacoes: r.observacoes ?? null,
      }));
      const { error } = await supabase.from("sessoes").insert(payload);
      if (error) throw error;
      toast.success(`${payload.length} sessões importadas`);
      navigate({ to: "/cursos/$id", params: { id } });
    } catch (e: any) {
      toast.error(e.message ?? "Falhou gravar");
    } finally {
      setSaving(false);
    }
  }

  function ufcdExcesso(rs: Row[], ufcdId: string): { ufcd: Ufcd; excesso: number } | null {
    const u = cufcds.find((x) => x.id === ufcdId);
    if (!u) return null;
    const uso = rs.reduce((a, r) =>
      r.curso_ufcd_id === ufcdId && r.hora_inicio && r.hora_fim
        ? a + diffHoras(r.hora_inicio, r.hora_fim) : a, 0);
    const total = uso + u.horas_existentes;
    const excesso = total - u.horas_totais;
    return excesso > 0 ? { ufcd: u, excesso } : null;
  }

  function avisarExcesso(prev: Row[], next: Row[], ufcdIds: (string | null | undefined)[]) {
    const unique = Array.from(new Set(ufcdIds.filter(Boolean) as string[]));
    unique.forEach((uid) => {
      const before = ufcdExcesso(prev, uid)?.excesso ?? 0;
      const after = ufcdExcesso(next, uid);
      if (after && after.excesso > before) {
        toast.warning(`Excede ${after.excesso.toFixed(1)}h em ${after.ufcd.codigo}`, {
          description: `Carga prevista ${after.ufcd.horas_totais}h${after.ufcd.horas_existentes > 0 ? ` · ${after.ufcd.horas_existentes}h já registadas` : ""}. Pode haver erro no cronograma.`,
          duration: 6000,
        });
      }
    });
  }

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => {
      const next = rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
      avisarExcesso(rs, next, [rs[i].curso_ufcd_id, next[i].curso_ufcd_id]);
      return next;
    });
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));


  const dispWarnSet = new Set(warnings.dispWarn.map((w) => w.idx));

  return (
    <PageContainer>
      <div className="mb-2">
        <Link to="/cursos/$id" params={{ id }} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
          <ArrowLeft className="size-3.5" /> Voltar ao curso
        </Link>
      </div>
      <PageHeader
        title="Importar cronograma"
        description="Carrega um cronograma em PDF e a IA extrai as sessões para revisão antes de gravar."
      />

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grow min-w-[260px]">
              <label className="text-xs text-muted-foreground">Ficheiro PDF</label>
              <Input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <Button onClick={onExtract} disabled={!file || loading}>
              <Sparkles className="size-4" /> {loading ? "A analisar PDF…" : "Extrair sessões"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Se um formador ou UFCD não existir, podes criá-lo diretamente na coluna correspondente.
            Apenas as sessões são criadas — não são geradas faltas nem disponibilidades.
          </p>
        </CardContent>
      </Card>

      {rows.length > 0 && (warnings.ufcdExc.length > 0 || warnings.dispWarn.length > 0) && (
        <Alert variant="destructive" className="mt-4">
          <AlertTriangle className="size-4" />
          <AlertTitle>Avisos antes de gravar</AlertTitle>
          <AlertDescription className="space-y-1">
            {warnings.ufcdExc.map((w) => (
              <div key={w.ufcd.id}>
                <b>{w.ufcd.codigo}</b> — {w.total.toFixed(1)}h excede a carga prevista ({w.ufcd.horas_totais}h){" "}
                {w.ufcd.horas_existentes > 0 && `(${w.ufcd.horas_existentes}h já registadas)`}
              </div>
            ))}
            {warnings.dispWarn.length > 0 && (
              <div>{warnings.dispWarn.length} sessões fora da disponibilidade do formador (linhas destacadas).</div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {rows.length > 0 && (
        <Card className="mt-4">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">Início</th>
                    <th className="px-3 py-2 text-left">Fim</th>
                    <th className="px-3 py-2 text-left">Horas</th>
                    <th className="px-3 py-2 text-left">UFCD</th>
                    <th className="px-3 py-2 text-left">Formador</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const horas = r.hora_inicio && r.hora_fim ? diffHoras(r.hora_inicio, r.hora_fim) : 0;
                    const warn = dispWarnSet.has(i);
                    return (
                      <tr key={i} className={`border-t ${warn ? "bg-destructive/5" : ""}`}>
                        <td className="px-3 py-1.5"><Input type="date" value={r.data} onChange={(e) => updateRow(i, { data: e.target.value })} className="h-8 w-[140px]" /></td>
                        <td className="px-3 py-1.5"><Input type="time" value={r.hora_inicio} onChange={(e) => updateRow(i, { hora_inicio: e.target.value })} className="h-8 w-[100px]" /></td>
                        <td className="px-3 py-1.5"><Input type="time" value={r.hora_fim} onChange={(e) => updateRow(i, { hora_fim: e.target.value })} className="h-8 w-[100px]" /></td>
                        <td className="px-3 py-1.5 tabular-nums">{horas.toFixed(1)}</td>
                        <td className="px-3 py-1.5">
                          <Select value={r.curso_ufcd_id ?? ""} onValueChange={(v) => handleUfcdChange(i, v)}>
                            <SelectTrigger className="h-8 min-w-[220px]"><SelectValue placeholder={r.ufcd_codigo ?? "—"} /></SelectTrigger>
                            <SelectContent>
                              {cufcds.map((u) => <SelectItem key={u.id} value={u.id}>{u.codigo} — {u.designacao}</SelectItem>)}
                              <SelectItem value={NEW_UFCD} className="text-primary"><Plus className="size-3.5 inline mr-1" />Criar nova UFCD…</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-1.5">
                          <Select value={r.formador_id ?? ""} onValueChange={(v) => handleFormChange(i, v)}>
                            <SelectTrigger className={`h-8 min-w-[200px] ${warn ? "border-destructive" : ""}`}>
                              <SelectValue placeholder={r.formador_nome ?? "—"} />
                            </SelectTrigger>
                            <SelectContent>
                              {formadores.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}{f.abreviatura ? ` (${f.abreviatura})` : ""}</SelectItem>)}
                              <SelectItem value={NEW_FORM} className="text-primary"><Plus className="size-3.5 inline mr-1" />Criar novo formador…</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-1.5">
                          <Button variant="ghost" size="icon" onClick={() => removeRow(i)}><Trash2 className="size-4" /></Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 p-4 border-t">
              <div className="text-sm text-muted-foreground">
                {rows.length} sessões · {rows.reduce((a, r) => a + (r.hora_inicio && r.hora_fim ? diffHoras(r.hora_inicio, r.hora_fim) : 0), 0).toFixed(1)} horas totais
              </div>
              <Button onClick={onSave} disabled={saving}>
                <Save className="size-4" /> {saving ? "A gravar…" : "Gravar sessões"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog criar UFCD */}
      <Dialog open={!!ufcdDlg} onOpenChange={(o) => !o && setUfcdDlg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova UFCD para este curso</DialogTitle></DialogHeader>
          {ufcdDlg && (
            <div className="space-y-3">
              <div><Label>Código</Label><Input value={ufcdDlg.codigo} onChange={(e) => setUfcdDlg({ ...ufcdDlg, codigo: e.target.value })} /></div>
              <div><Label>Designação</Label><Input value={ufcdDlg.designacao} onChange={(e) => setUfcdDlg({ ...ufcdDlg, designacao: e.target.value })} /></div>
              <div><Label>Horas</Label><Input type="number" min={1} value={ufcdDlg.horas} onChange={(e) => setUfcdDlg({ ...ufcdDlg, horas: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUfcdDlg(null)}>Cancelar</Button>
            <Button onClick={confirmCriarUfcd}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog criar Formador */}
      <Dialog open={!!formDlg} onOpenChange={(o) => !o && setFormDlg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo formador</DialogTitle></DialogHeader>
          {formDlg && (
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={formDlg.nome} onChange={(e) => setFormDlg({ ...formDlg, nome: e.target.value })} /></div>
              <div><Label>Abreviatura (opcional)</Label><Input value={formDlg.abreviatura} onChange={(e) => setFormDlg({ ...formDlg, abreviatura: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormDlg(null)}>Cancelar</Button>
            <Button onClick={confirmCriarFormador}>Criar</Button>
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
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function norm(s: string | null | undefined) {
  return (s ?? "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}
function matchUfcd(codigo: string | null, nome: string | null, list: Ufcd[]) {
  const c = norm(codigo); const n = norm(nome);
  const byCode = list.find((u) => c && norm(u.codigo) === c);
  if (byCode) return byCode.id;
  if (n) {
    const byName = list.find((u) => norm(u.designacao) === n || norm(u.designacao).includes(n) || n.includes(norm(u.designacao)));
    if (byName) return byName.id;
  }
  return null;
}
function matchFormador(nome: string | null, list: Formador[]) {
  const n = norm(nome);
  if (!n) return null;
  const exact = list.find((f) => norm(f.nome) === n || norm(f.abreviatura) === n);
  if (exact) return exact.id;
  const partial = list.find((f) => norm(f.nome).includes(n) || n.includes(norm(f.nome)));
  return partial?.id ?? null;
}
