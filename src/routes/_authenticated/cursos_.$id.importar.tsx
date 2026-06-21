import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Upload, Trash2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { extrairCronogramaPdf, type SessaoExtraida } from "@/lib/import-cronograma.functions";
import { supabase } from "@/integrations/supabase/client";
import { diffHoras } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/cursos_/$id/importar")({
  head: () => ({ meta: [{ title: "Importar cronograma" }] }),
  component: ImportarCronograma,
});

type Row = SessaoExtraida & { curso_ufcd_id: string | null; formador_id: string | null };

function ImportarCronograma() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const extrair = useServerFn(extrairCronogramaPdf);

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [cufcds, setCufcds] = useState<{ id: string; codigo: string; designacao: string }[]>([]);
  const [formadores, setFormadores] = useState<{ id: string; nome: string; abreviatura: string | null }[]>([]);

  async function onExtract() {
    if (!file) return toast.error("Seleciona um PDF");
    setLoading(true);
    try {
      const b64 = await fileToBase64(file);
      const result = await extrair({ data: { cursoId: id, pdfBase64: b64, filename: file.name } });
      setCufcds(result.curso_ufcds);
      setFormadores(result.formadores);
      setRows(result.sessoes.map((s) => ({
        ...s,
        curso_ufcd_id: matchUfcd(s.ufcd_codigo, s.ufcd_nome, result.curso_ufcds),
        formador_id: matchFormador(s.formador_nome, result.formadores),
      })));
      toast.success(`${result.sessoes.length} sessões extraídas. Revê antes de gravar.`);
    } catch (e: any) {
      toast.error(e.message ?? "Falhou a extração");
    } finally {
      setLoading(false);
    }
  }

  async function onSave() {
    const invalid = rows.filter((r) => !r.data || !r.hora_inicio || !r.hora_fim || !r.curso_ufcd_id || !r.formador_id);
    if (invalid.length) return toast.error(`${invalid.length} linha(s) incompletas. Preenche UFCD e formador.`);
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

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

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
            A IA tenta fazer correspondência das UFCD e formadores do curso. Verifica e ajusta as linhas antes de gravar.
            Apenas as sessões são criadas — não são geradas faltas nem disponibilidades.
          </p>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card className="mt-6">
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
                    return (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-1.5"><Input type="date" value={r.data} onChange={(e) => updateRow(i, { data: e.target.value })} className="h-8 w-[140px]" /></td>
                        <td className="px-3 py-1.5"><Input type="time" value={r.hora_inicio} onChange={(e) => updateRow(i, { hora_inicio: e.target.value })} className="h-8 w-[100px]" /></td>
                        <td className="px-3 py-1.5"><Input type="time" value={r.hora_fim} onChange={(e) => updateRow(i, { hora_fim: e.target.value })} className="h-8 w-[100px]" /></td>
                        <td className="px-3 py-1.5 tabular-nums">{horas.toFixed(1)}</td>
                        <td className="px-3 py-1.5">
                          <Select value={r.curso_ufcd_id ?? ""} onValueChange={(v) => updateRow(i, { curso_ufcd_id: v })}>
                            <SelectTrigger className="h-8 min-w-[220px]"><SelectValue placeholder={r.ufcd_codigo ?? "—"} /></SelectTrigger>
                            <SelectContent>
                              {cufcds.map((u) => <SelectItem key={u.id} value={u.id}>{u.codigo} — {u.designacao}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-1.5">
                          <Select value={r.formador_id ?? ""} onValueChange={(v) => updateRow(i, { formador_id: v })}>
                            <SelectTrigger className="h-8 min-w-[200px]"><SelectValue placeholder={r.formador_nome ?? "—"} /></SelectTrigger>
                            <SelectContent>
                              {formadores.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}{f.abreviatura ? ` (${f.abreviatura})` : ""}</SelectItem>)}
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
function matchUfcd(codigo: string | null, nome: string | null, list: { id: string; codigo: string; designacao: string }[]) {
  const c = norm(codigo); const n = norm(nome);
  const byCode = list.find((u) => c && norm(u.codigo) === c);
  if (byCode) return byCode.id;
  if (n) {
    const byName = list.find((u) => norm(u.designacao) === n || norm(u.designacao).includes(n) || n.includes(norm(u.designacao)));
    if (byName) return byName.id;
  }
  return null;
}
function matchFormador(nome: string | null, list: { id: string; nome: string; abreviatura: string | null }[]) {
  const n = norm(nome);
  if (!n) return null;
  const exact = list.find((f) => norm(f.nome) === n || norm(f.abreviatura) === n);
  if (exact) return exact.id;
  const partial = list.find((f) => norm(f.nome).includes(n) || n.includes(norm(f.nome)));
  return partial?.id ?? null;
}
