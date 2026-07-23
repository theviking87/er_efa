import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { AlertTriangle, Calculator, Save } from "lucide-react";
import { useProjetoAtivo } from "@/lib/projeto-context";
import { calcularProcessamento, guardarProcessamento, type Preview } from "@/lib/financeiro/engine";

export const Route = createFileRoute("/_authenticated/financeiro/processamentos/novo")({
  head: () => ({ meta: [{ title: "Financeiro — Novo processamento" }] }),
  component: NovoProcessamento,
});

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function NovoProcessamento() {
  const navigate = useNavigate();
  const { projetoId } = useProjetoAtivo();
  const now = new Date();
  const [cursoId, setCursoId] = useState<string>("");
  const [ano, setAno] = useState<number>(now.getFullYear());
  const [mes, setMes] = useState<number>(now.getMonth() + 1);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const cursos = useQuery({
    queryKey: ["fin-cursos", projetoId],
    queryFn: async () => {
      let q = supabase.from("cursos").select("id, codigo, nome, projeto_id").order("codigo");
      if (projetoId && projetoId !== "all") q = q.eq("projeto_id", projetoId);
      const { data } = await q; return data ?? [];
    },
  });

  const cursoSel = useMemo(() => cursos.data?.find(c => c.id === cursoId), [cursos.data, cursoId]);

  async function calcular() {
    if (!cursoId) return toast.error("Escolhe um curso.");
    setLoading(true); setPreview(null);
    try {
      const p = await calcularProcessamento(cursoId, ano, mes);
      setPreview(p);
      if (!p.formandos.length && !p.formadores.length) toast.info("Sem dados de cálculo neste período.");
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  }

  async function guardar() {
    if (!preview) return;
    setSaving(true);
    try {
      const projId = cursoSel?.projeto_id ?? (projetoId !== "all" ? projetoId : null);
      const id = await guardarProcessamento(preview, projId);
      toast.success("Processamento guardado.");
      navigate({ to: "/financeiro/processamentos/$id", params: { id } });
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Novo processamento"
        description="Cálculo mensal por curso: Bolsa (BF/BFM), Subsídio de alimentação, Transporte e Honorários."
        actions={<Button asChild variant="outline"><Link to="/financeiro">Voltar</Link></Button>}
      />

      <Card className="mb-4">
        <CardHeader className="pb-3"><CardTitle className="text-base">Parâmetros</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Curso</Label>
            <Select value={cursoId} onValueChange={setCursoId}>
              <SelectTrigger><SelectValue placeholder="Escolher curso…" /></SelectTrigger>
              <SelectContent>
                {(cursos.data ?? []).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.codigo} — {c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Mês</Label>
            <Select value={String(mes)} onValueChange={v => setMes(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MESES.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ano</Label>
            <Input type="number" value={ano} onChange={e => setAno(Number(e.target.value))} />
          </div>
          <div className="sm:col-span-4 flex justify-end gap-2">
            <Button onClick={calcular} disabled={loading || !cursoId}><Calculator className="size-4" />{loading ? "A calcular…" : "Calcular pré-visualização"}</Button>
            <Button onClick={guardar} disabled={!preview || saving} variant="default"><Save className="size-4" />{saving ? "A guardar…" : "Guardar rascunho"}</Button>
          </div>
        </CardContent>
      </Card>

      {preview && <PreviewView preview={preview} />}
    </PageContainer>
  );
}

function PreviewView({ preview }: { preview: Preview }) {
  const t = preview.totais;
  return (
    <div className="space-y-4">
      {preview.avisos.length > 0 && (
        <Alert><AlertTriangle className="size-4" />
          <AlertDescription>
            <ul className="list-disc pl-4 space-y-0.5">
              {preview.avisos.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-6">
        <Totalzinho label="BF" v={t.BF} /><Totalzinho label="BFM" v={t.BFM} />
        <Totalzinho label="SA" v={t.SA} /><Totalzinho label="TR" v={t.TR} />
        <Totalzinho label="HN" v={t.HN} /><Totalzinho label="Total" v={t.geral} strong />
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Formandos ({preview.formandos.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {preview.formandos.length === 0 ? <div className="px-6 py-6 text-sm text-muted-foreground">Sem linhas.</div> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Formando</TableHead><TableHead>Rubrica</TableHead>
                <TableHead className="text-right">H. prev.</TableHead><TableHead className="text-right">H. freq.</TableHead>
                <TableHead className="text-right">Dias</TableHead><TableHead className="text-right">Valor (€)</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {preview.formandos.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell>{l.formando_nome}</TableCell>
                    <TableCell><Badge variant="secondary">{l.rubrica}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{l.horas_previstas.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.horas_frequentadas.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.dias_elegiveis}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{l.valor.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Honorários — Formadores ({preview.formadores.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {preview.formadores.length === 0 ? <div className="px-6 py-6 text-sm text-muted-foreground">Sem linhas.</div> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Formador</TableHead>
                <TableHead className="text-right">Horas</TableHead>
                <TableHead className="text-right">€/h</TableHead>
                <TableHead className="text-right">Valor (€)</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {preview.formadores.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell>{l.formador_nome}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.horas_frequentadas.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.valor_hora.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{l.valor.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Totalzinho({ label, v, strong }: { label: string; v: number; strong?: boolean }) {
  return (
    <Card><CardContent className="p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 tabular-nums ${strong ? "text-lg font-semibold" : "text-base font-medium"}`}>{v.toFixed(2)} €</div>
    </CardContent></Card>
  );
}
