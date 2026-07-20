import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Lock, Save, Play } from "lucide-react";
import { toast } from "sonner";
import { useProjetoAtivo, useProjetosList } from "@/lib/projeto-context";
import { executarProcessamento, type ProcessamentoCompleto } from "@/lib/financeiro/engine/processamento";
import { guardarCalculo, fecharProcessamento } from "@/lib/financeiro/engine/persistencia";

export const Route = createFileRoute("/_authenticated/financeiro/processamentos/novo")({
  head: () => ({ meta: [{ title: "Financeiro — Novo processamento" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    id: typeof s.id === "string" ? s.id : undefined,
  }),
  component: WizardPage,
});

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const s = supabase as any;

function WizardPage() {
  const nav = useNavigate();
  const { id: preId } = Route.useSearch();
  const { projetoId } = useProjetoAtivo();
  const projetos = useProjetosList();
  const now = new Date();

  const [step, setStep] = useState(1);
  const [projetoSel, setProjetoSel] = useState<string>(projetoId ?? "");
  const [cursoId, setCursoId] = useState<string>("");
  const [ano, setAno] = useState<number>(now.getFullYear());
  const [mes, setMes] = useState<number>(now.getMonth() + 1);
  const [proc, setProc] = useState<ProcessamentoCompleto | null>(null);
  const [processamentoId, setProcessamentoId] = useState<string | undefined>(preId);
  const [busy, setBusy] = useState(false);

  const cursos = useQuery({
    queryKey: ["cursos-wizard", projetoSel],
    queryFn: async () => {
      let q = s.from("cursos").select("id, codigo, nome, projeto_id, estado").order("codigo");
      if (projetoSel) q = q.eq("projeto_id", projetoSel);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Carregar processamento existente se veio via ?id=
  useEffect(() => {
    (async () => {
      if (!preId) return;
      const { data } = await s.from("financeiro_processamentos").select("*").eq("id", preId).single();
      if (!data) return;
      setProjetoSel(data.projeto_id ?? "");
      setCursoId(data.curso_id);
      setAno(data.ano);
      setMes(data.mes);
      setStep(2);
      setBusy(true);
      try {
        const p = await executarProcessamento({ ano: data.ano, mes: data.mes, cursoId: data.curso_id, projetoId: data.projeto_id });
        setProc(p);
      } finally { setBusy(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preId]);

  async function proximoDoPasso1() {
    if (!cursoId) { toast.error("Selecione um curso."); return; }
    setBusy(true);
    try {
      const p = await executarProcessamento({ ano, mes, cursoId, projetoId: projetoSel || null });
      setProc(p);
      setStep(2);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function guardar() {
    if (!proc) return;
    setBusy(true);
    try {
      let id = processamentoId;
      if (!id) {
        const ins = await s.from("financeiro_processamentos").insert({
          curso_id: cursoId, ano, mes, projeto_id: projetoSel || null, estado: "aberto",
        }).select("id").single();
        if (ins.error) throw ins.error;
        id = ins.data.id;
        setProcessamentoId(id);
      }
      await guardarCalculo(id!, proc);
      toast.success("Cálculo guardado.");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function fechar() {
    if (!proc || !processamentoId) { toast.error("Guarde o rascunho primeiro."); return; }
    setBusy(true);
    try {
      await fecharProcessamento(processamentoId, proc);
      toast.success("Processamento fechado.");
      nav({ to: "/financeiro/processamentos" });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  const bloq = proc?.validacoes.filter((v) => v.nivel === "bloqueante").length ?? 0;
  const avisos = proc?.validacoes.filter((v) => v.nivel === "aviso").length ?? 0;
  const nomeFormando = useMemo(() => {
    const m = new Map<string, string>();
    proc?.ctx.formandos.forEach((f) => m.set(f.formando_id, f.nome));
    return (id: string) => m.get(id) ?? id.slice(0, 8);
  }, [proc]);
  const nomeFormador = useMemo(() => {
    const m = new Map<string, string>();
    proc?.ctx.formadores.forEach((f) => m.set(f.id, f.nome));
    return (id: string) => m.get(id) ?? id.slice(0, 8);
  }, [proc]);

  return (
    <PageContainer>
      <PageHeader
        title="Assistente de Processamento"
        description={`Passo ${step} de 4`}
        actions={<Link to="/financeiro/processamentos"><Button variant="outline" size="sm">Voltar</Button></Link>}
      />

      <div className="flex gap-2 mb-4 text-xs">
        {[1,2,3,4].map((n) => (
          <Badge key={n} variant={step===n?"default":"outline"}>{n}. {["Contexto","Dados","Validações","Cálculo"][n-1]}</Badge>
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Contexto</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label>Projeto</Label>
              <Select value={projetoSel} onValueChange={setProjetoSel}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>{((projetos.data ?? []) as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Curso</Label>
              <Select value={cursoId} onValueChange={setCursoId}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {(cursos.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.codigo} — {c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ano</Label>
              <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({length: 6}, (_, i) => now.getFullYear() - 2 + i).map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mês</Label>
              <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MESES.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="md:col-span-4 flex justify-end">
              <Button onClick={proximoDoPasso1} disabled={busy || !cursoId}>
                Carregar dados <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step >= 2 && proc && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <Metric label="Formandos" value={proc.ctx.formandos.length} />
          <Metric label="Sessões" value={proc.ctx.sessoes.length} />
          <Metric label="Horas previstas" value={horasPrevistas(proc)} />
          <Metric label="Validações" value={`${bloq} bloq. / ${avisos} aviso(s)`} />
        </div>
      )}

      {step === 2 && proc && (
        <Card>
          <CardHeader><CardTitle>Dados carregados</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><strong>Curso:</strong> {proc.ctx.curso.codigo} — {proc.ctx.curso.nome} <Badge variant="outline" className="ml-2">{proc.ctx.curso.estado}</Badge></div>
            <div><strong>Formandos inscritos:</strong> {proc.ctx.formandos.length}</div>
            <div><strong>Sessões no mês:</strong> {proc.ctx.sessoes.length}</div>
            <div><strong>Formadores envolvidos:</strong> {proc.ctx.formadores.map((f) => f.nome).join(", ") || "—"}</div>
            <div><strong>Rubricas atribuídas:</strong> {proc.ctx.atribuicoes.length}</div>
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(1)}><ChevronLeft className="h-4 w-4 mr-1" /> Voltar</Button>
              <Button onClick={() => setStep(3)}>Ver validações <ChevronRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && proc && (
        <Card>
          <CardHeader><CardTitle>Validações</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {proc.validacoes.length === 0 ? (
              <Alert><CheckCircle2 className="h-4 w-4" /><AlertTitle>Sem avisos</AlertTitle><AlertDescription>Tudo pronto para calcular.</AlertDescription></Alert>
            ) : proc.validacoes.map((v, i) => (
              <Alert key={i} variant={v.nivel === "bloqueante" ? "destructive" : "default"}>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{v.nivel === "bloqueante" ? "Bloqueante" : "Aviso"} — {v.codigo}</AlertTitle>
                <AlertDescription>{v.mensagem}</AlertDescription>
              </Alert>
            ))}
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(2)}><ChevronLeft className="h-4 w-4 mr-1" /> Voltar</Button>
              <Button onClick={() => setStep(4)}>Cálculo <ChevronRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && proc && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Metric label="Total Bolsas" value={fmt(proc.resultado.totais.bolsas)} />
            <Metric label="Total Alimentação" value={fmt(proc.resultado.totais.subsidios)} />
            <Metric label="Total Km" value={fmt(proc.resultado.totais.km)} />
            <Metric label="Total Honorários" value={fmt(proc.resultado.totais.honorarios)} />
            <Metric label="Total Geral" value={fmt(proc.resultado.totais.geral)} strong />
          </div>

          <TabelaLinhas title="Bolsas" cols={["Formando","Rubrica","Horas freq.","€/h","Valor","Teto"]}
            rows={proc.resultado.bolsas.map((b) => [nomeFormando(b.formando_id), b.rubrica_codigo, b.horas_frequentadas, fmt(b.valor_hora), fmt(b.valor_calculado), b.teto_aplicado ? "Sim" : "—"])} />
          <TabelaLinhas title="Alimentação" cols={["Formando","Dias","€/dia","Total"]}
            rows={proc.resultado.subsidios.map((x) => [nomeFormando(x.formando_id), x.dias, fmt(x.valor_dia), fmt(x.total)])} />
          <TabelaLinhas title="Quilómetros" cols={["Formando","Data","Km","€/Km","Total"]}
            rows={proc.resultado.quilometros.map((x) => [nomeFormando(x.formando_id), x.data, x.km, fmt(x.valor_km), fmt(x.total)])} />
          <TabelaLinhas title="Honorários" cols={["Formador","Horas","€/h","Valor","IVA","IRS","SS","Total"]}
            rows={proc.resultado.honorarios.map((x) => [nomeFormador(x.formador_id), x.horas.toFixed(2), fmt(x.valor_hora), fmt(x.valor), fmt(x.iva), fmt(x.retencao_irs), fmt(x.seguranca_social), fmt(x.total)])} />

          <div className="flex flex-wrap justify-between gap-2 pt-2">
            <Button variant="outline" onClick={() => setStep(3)}><ChevronLeft className="h-4 w-4 mr-1" /> Voltar</Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={guardar} disabled={busy}><Save className="h-4 w-4 mr-1" /> Guardar rascunho</Button>
              <Button onClick={fechar} disabled={busy || bloq > 0}><Lock className="h-4 w-4 mr-1" /> Fechar processamento</Button>
            </div>
          </div>
        </div>
      )}

      {busy && !proc && step > 1 && <p className="text-sm text-muted-foreground mt-4"><Play className="h-4 w-4 inline mr-1 animate-pulse" /> A calcular…</p>}
    </PageContainer>
  );
}

function Metric({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <Card><CardContent className="pt-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={strong ? "text-2xl font-bold" : "text-xl font-semibold"}>{value}</div>
    </CardContent></Card>
  );
}

function TabelaLinhas({ title, cols, rows }: { title: string; cols: string[]; rows: (string|number)[][] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title} ({rows.length})</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">Sem linhas.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b">{cols.map((c) => <th key={c} className="py-1 pr-2">{c}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  {r.map((v, j) => <td key={j} className="py-1 pr-2">{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function horasPrevistas(p: ProcessamentoCompleto) {
  const v = Array.from(p.horas.values())[0]?.horas_previstas ?? 0;
  return v;
}
function fmt(n: number) { return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n); }
