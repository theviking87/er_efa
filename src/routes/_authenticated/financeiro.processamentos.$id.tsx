import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, FileSpreadsheet, FileText, Lock, LockOpen, RefreshCw, Trash2 } from "lucide-react";
import { exportProcessamentoExcel, type RubricaFilter } from "@/lib/financeiro/excel";
import { calcularProcessamento, guardarProcessamento } from "@/lib/financeiro/engine";
import { exportNotaHonorariosPdf } from "@/lib/pdf-exports";
import { saveFile } from "@/lib/dom-helpers";
import { NotasPainel } from "@/components/notas-painel";


export const Route = createFileRoute("/_authenticated/financeiro/processamentos/$id")({
  head: () => ({ meta: [{ title: "Financeiro — Detalhe do processamento" }] }),
  component: DetailPage,
});

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function DetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const proc = useQuery({
    queryKey: ["fin-proc", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("fin_processamento")
        .select("*, curso:curso_id(codigo, nome, acao, codigo_operacao, codigo_sigo)").eq("id", id).single();
      if (error) throw error; return data;
    },
  });

  const linhas = useQuery({
    queryKey: ["fin-proc-linhas", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("fin_processamento_linha")
        .select("*, formando:formando_id(nome), formador:formador_id(id, nome, nif, morada, codigo_postal, localidade, sem_retencao, retencao_percentagem, aplica_iva, iva_percentagem)")
        .eq("processamento_id", id);
      if (error) throw error; return data ?? [];
    },
  });


  const cfg = useQuery({
    queryKey: ["fin-config"],
    queryFn: async () => (await supabase.from("fin_config").select("*").limit(1).maybeSingle()).data,
  });

  const toggleEstado = useMutation({
    mutationFn: async (novo: "rascunho" | "fechado") => {
      const { error } = await supabase.from("fin_processamento")
        .update({ estado: novo, fechado_em: novo === "fechado" ? new Date().toISOString() : null } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fin-proc", id] }); toast.success("Estado atualizado."); },
    onError: (e: any) => toast.error(e.message),
  });

  const recalcular = useMutation({
    mutationFn: async () => {
      const p: any = proc.data;
      if (!p) throw new Error("Sem processamento.");
      if (p.estado === "fechado") throw new Error("Processamento fechado — reabre antes de recalcular.");
      const preview = await calcularProcessamento(p.curso_id, p.ano, p.mes);
      await guardarProcessamento(preview, p.projeto_id ?? null);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-proc", id] });
      qc.invalidateQueries({ queryKey: ["fin-proc-linhas", id] });
      toast.success("Processamento recalculado.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const eliminar = useMutation({
    mutationFn: async () => {
      await supabase.from("fin_processamento_linha").delete().eq("processamento_id", id);
      const { error } = await supabase.from("fin_processamento").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Eliminado."); window.location.href = "/financeiro/processamentos"; },
    onError: (e: any) => toast.error(e.message),
  });

  const [filtroModo, setFiltroModo] = useState<"tudo" | "formando">("tudo");
  const [filtroId, setFiltroId] = useState<string>("");
  const [rubricasSel, setRubricasSel] = useState<Set<RubricaFilter>>(new Set(["BF","BFM","SA","TR","ATL"]));

  const fmdsList = useMemo(() => (linhas.data ?? []).filter((l: any) => l.formando_id), [linhas.data]);
  const fdrsList = useMemo(() => (linhas.data ?? []).filter((l: any) => l.formador_id), [linhas.data]);

  const opcoesFormandos = useMemo(() => {
    const m = new Map<string, string>();
    fmdsList.forEach((l: any) => m.set(l.formando_id, l.formando?.nome ?? "—"));
    return Array.from(m, ([id, nome]) => ({ id, nome })).sort((a,b) => a.nome.localeCompare(b.nome));
  }, [fmdsList]);

  function toggleRubrica(r: RubricaFilter) {
    setRubricasSel(prev => {
      const n = new Set(prev);
      if (n.has(r)) n.delete(r); else n.add(r);
      return n;
    });
  }


  async function buildPresencas(alvoIds: string[]) {
    const p: any = proc.data;
    const ano = p.ano as number, mes = p.mes as number;
    const first = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const last = `${ano}-${String(mes).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    if (!alvoIds.length) return [] as import("@/lib/financeiro/excel").PresencaFormando[];
    const [sessRes, cfRes] = await Promise.all([
      supabase.from("sessoes")
        .select("id, data, hora_inicio, hora_fim, horas, curso_ufcd_id, curso_ufcd:curso_ufcds(ufcd:ufcds(codigo, designacao)), formador:formadores(nome, abreviatura)")
        .eq("curso_id", p.curso_id).gte("data", first).lte("data", last),
      supabase.from("curso_formandos")
        .select("id, formando_id, formando:formandos(nome), curso_formando_ufcds(curso_ufcd_id, frequenta)")
        .eq("curso_id", p.curso_id).in("formando_id", alvoIds),
    ]);
    const sess = (sessRes.data ?? []) as any[];
    const cfs = (cfRes.data ?? []) as any[];
    const cfIds = cfs.map(c => c.id);
    const faltasRes = cfIds.length ? await supabase.from("formando_faltas")
      .select("curso_formando_id, sessao_id, data, horas, tipo, observacoes")
      .in("curso_formando_id", cfIds).gte("data", first).lte("data", last) : { data: [] as any[] };
    const faltas = (faltasRes.data ?? []) as any[];
    return cfs.map(cf => {
      const ufcdsFreq = new Set<string>((cf.curso_formando_ufcds ?? [])
        .filter((x: any) => x.frequenta !== false)
        .map((x: any) => x.curso_ufcd_id));
      const faltasCf = faltas.filter(f => f.curso_formando_id === cf.id);
      const faltaBySessao = new Map<string, any>();
      const faltasByData = new Map<string, any[]>();
      faltasCf.forEach(f => {
        if (f.sessao_id) faltaBySessao.set(f.sessao_id, f);
        const arr = faltasByData.get(f.data) ?? [];
        arr.push(f); faltasByData.set(f.data, arr);
      });
      const rows = sess
        .filter(s => ufcdsFreq.has(s.curso_ufcd_id))
        .map(s => {
          const fs = faltaBySessao.get(s.id);
          const horasSess = Number(s.horas ?? 0);
          let horasFalta = 0, tipo: string | null = null, obs: string | null = null;
          if (fs) {
            horasFalta = Math.min(horasSess, Number(fs.horas ?? horasSess));
            tipo = fs.tipo; obs = fs.observacoes ?? null;
          } else {
            const arr = faltasByData.get(s.data);
            if (arr && arr.length) {
              const f0 = arr[0];
              horasFalta = Math.min(horasSess, Number(f0.horas ?? horasSess));
              tipo = f0.tipo; obs = f0.observacoes ?? null;
            }
          }
          const ufcd = s.curso_ufcd?.ufcd
            ? `${s.curso_ufcd.ufcd.codigo ?? ""} — ${s.curso_ufcd.ufcd.designacao ?? ""}`.trim()
            : "—";
          const formador = s.formador?.abreviatura || s.formador?.nome || "—";
          const isOnline = tipo === "online";
          return {
            data: s.data, hora_inicio: s.hora_inicio, hora_fim: s.hora_fim,
            ufcd, formador,
            horas_sessao: horasSess,
            horas_falta: isOnline ? 0 : horasFalta,
            horas_efetivas: Math.max(horasSess - (isOnline ? 0 : horasFalta), 0),
            tipo_falta: isOnline ? "online" : tipo,
            observacoes: isOnline ? (obs ? `Sessão online — ${obs}` : "Sessão online") : obs,
          };
        });
      return { formandoId: cf.formando_id, formandoNome: cf.formando?.nome ?? "—", rows };
    }).sort((a, b) => a.formandoNome.localeCompare(b.formandoNome));
  }

  async function exportar() {
    if (!proc.data || !linhas.data) return;
    if (filtroModo === "formando" && !filtroId) { toast.error("Escolhe o formando."); return; }
    if (!rubricasSel.size) { toast.error("Escolhe pelo menos uma rubrica."); return; }

    const fmdsAll = fmdsList.map((l: any) => ({
      id: l.formando_id, nome: l.formando?.nome ?? "—", rubrica: l.rubrica,
      horas_previstas: Number(l.horas_previstas ?? 0), horas_frequentadas: Number(l.horas_frequentadas ?? 0),
      dias_elegiveis: Number(l.dias_elegiveis ?? 0), valor_hora: Number(l.valor_hora ?? 0),
      valor_dia: Number(l.valor_dia ?? 0), km_total: Number(l.km_total ?? 0),
      valor: Number(l.valor ?? 0), memoria_calculo: l.memoria_calculo ?? null,
    }));

    const alvoFormandoIds = filtroModo === "formando" ? [filtroId] : opcoesFormandos.map(o => o.id);
    const alvoRubricas = Array.from(rubricasSel).filter(r => r !== "HN");
    if (!alvoRubricas.length) { toast.error("As rubricas de formadores (HN) já não são exportadas aqui — usa a secção Honorários."); return; }

    // Um ficheiro por (formando × rubrica) — só rubricas com valor para esse formando.
    // Todos são reunidos num único .zip para garantir que nenhum download é bloqueado.
    const ficheiros: { name: string; buf: ArrayBuffer }[] = [];
    for (const fid of alvoFormandoIds) {
      const rubsComValor = alvoRubricas.filter(rub =>
        fmdsAll.some(f => f.id === fid && f.rubrica === rub && Math.abs(f.valor) > 0.005),
      );
      if (!rubsComValor.length) continue;
      const presencas = await buildPresencas([fid]);
      for (const rub of rubsComValor) {
        const totais = { BF: 0, BFM: 0, SA: 0, TR: 0, HN: 0, ATL: 0 } as Record<string, number>;
        fmdsAll.filter(f => f.id === fid && f.rubrica === rub)
          .forEach(f => { totais[rub] += f.valor; });
        const file = await exportProcessamentoExcel({
          ano: proc.data.ano, mes: proc.data.mes, curso: proc.data.curso,
          totais: { BF: totais.BF, BFM: totais.BFM, SA: totais.SA, TR: totais.TR, HN: 0, ATL: totais.ATL, geral: totais[rub] },
          formandos: fmdsAll,
          formadores: [],
          presencas,
          empresa: cfg.data ? { nome: cfg.data.empresa_nome, nif: cfg.data.empresa_nif, morada: cfg.data.empresa_morada } : null,
          logoEmpresaUrl: cfg.data?.logo_empresa_url ?? null,
          logoDgertUrl: cfg.data?.logo_dgert_url ?? null,
          logoPessoas2030Url: cfg.data?.logo_pessoas2030_url ?? null,
          filtro: { formandoId: fid, formadorId: null, rubricas: [rub] },
        }, { returnFile: true });
        ficheiros.push(file);
      }
    }
    if (!ficheiros.length) { toast.error("Nenhuma rubrica com valor para exportar."); return; }

    if (ficheiros.length === 1) {
      await saveFile(ficheiros[0].name, ficheiros[0].buf);
      toast.success("Ficheiro gerado.");
      return;
    }

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const usados = new Map<string, number>();
    for (const f of ficheiros) {
      const n = usados.get(f.name) ?? 0;
      usados.set(f.name, n + 1);
      zip.file(n ? f.name.replace(/\.xlsx$/, ` (${n + 1}).xlsx`) : f.name, f.buf);
    }
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const cursoTxt = String(proc.data.curso?.nome ?? proc.data.curso?.codigo ?? "").replace(/[\\/:*?"<>|]/g, " ").trim();
    const zipName = `Mapas Processamento ${cursoTxt} ${String(proc.data.mes).padStart(2, "0")}-${proc.data.ano}.zip`.replace(/\s+/g, " ");
    await saveFile(zipName, await blob.arrayBuffer());
    toast.success(`Gerados ${ficheiros.length} ficheiros num .zip.`);
  }

  // Mapa simples de pagamentos (sem cabeçalhos/logos): IBAN, Nome, BIC/SWIFT, Valor, Mês, Rubrica.
  async function exportarPagamentos() {
    if (!proc.data || !linhas.data) return;
    if (filtroModo === "formando" && !filtroId) { toast.error("Escolhe o formando."); return; }
    if (!rubricasSel.size) { toast.error("Escolhe pelo menos uma rubrica."); return; }
    const alvoRubricas = Array.from(rubricasSel).filter(r => r !== "HN");
    if (!alvoRubricas.length) { toast.error("Escolhe pelo menos uma rubrica de formandos."); return; }
    const alvoIds = filtroModo === "formando" ? [filtroId] : opcoesFormandos.map(o => o.id);
    if (!alvoIds.length) { toast.error("Sem formandos para exportar."); return; }

    const { data: dadosFmd } = await supabase.from("formandos").select("id, nome, iban, bic").in("id", alvoIds);
    const byId = new Map<string, any>((dadosFmd ?? []).map((f: any) => [f.id, f]));

    const { exportPagamentosSimplesExcel } = await import("@/lib/financeiro/excel-pagamentos");
    const ano = proc.data.ano as number, mes = proc.data.mes as number;
    const ficheiros: { name: string; buf: ArrayBuffer }[] = [];

    const { RUBRICA_PAGAMENTO_LABEL } = await import("@/lib/financeiro/excel-pagamentos");
    for (const rub of alvoRubricas) {
      const rows = fmdsList
        .filter((l: any) => l.rubrica === rub && alvoIds.includes(l.formando_id))
        .map((l: any) => {
          const f = byId.get(l.formando_id);
          const nome = f?.nome ?? fmdsList.find((x: any) => x.formando_id === l.formando_id)?.formando?.nome ?? "—";
          const manual = l.valor_manual != null ? Number(l.valor_manual) : null;
          const valor = manual != null && manual > 0 ? manual : Number(l.valor ?? 0);
          return { iban: f?.iban ?? "", nome, bic: f?.bic ?? "", valor, ano, mes, rubrica: l.rubrica };
        })
        .filter((r: any) => Math.abs(r.valor) > 0.005)
        .sort((a: any, b: any) => a.nome.localeCompare(b.nome, "pt"));
      if (!rows.length) continue;
      const label = (RUBRICA_PAGAMENTO_LABEL[rub] ?? rub).replace(/[\\/:*?"<>|]/g, " ").trim();
      let nomeFich = `Pagamentos ${label} ${String(mes).padStart(2, "0")}-${ano}.xlsx`;
      if (ficheiros.some(f => f.name === nomeFich)) nomeFich = `Pagamentos ${label} ${rub} ${String(mes).padStart(2, "0")}-${ano}.xlsx`;
      ficheiros.push(await exportPagamentosSimplesExcel(rows, nomeFich));
    }


    if (!ficheiros.length) { toast.error("Nenhum valor para exportar."); return; }
    if (ficheiros.length === 1) {
      await saveFile(ficheiros[0].name, ficheiros[0].buf);
      toast.success("Ficheiro gerado.");
      return;
    }
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    ficheiros.forEach(f => zip.file(f.name, f.buf));
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const cursoTxt = String(proc.data.curso?.nome ?? proc.data.curso?.codigo ?? "").replace(/[\\/:*?"<>|]/g, " ").trim();
    await saveFile(`Pagamentos ${cursoTxt} ${String(mes).padStart(2, "0")}-${ano}.zip`.replace(/\s+/g, " "), await blob.arrayBuffer());
    toast.success(`Gerados ${ficheiros.length} ficheiros num .zip.`);
  }


  if (proc.isLoading) return <PageContainer><div className="text-sm text-muted-foreground">A carregar…</div></PageContainer>;
  if (!proc.data) return <PageContainer><div className="text-sm">Processamento não encontrado.</div></PageContainer>;

  const p = proc.data as any;
  const fechado = p.estado === "fechado";
  const fmds = fmdsList;
  const fdrs = fdrsList;
  const RUBRICAS: RubricaFilter[] = ["BF","BFM","SA","TR","HN","ATL"];

  return (
    <PageContainer>
      <PageHeader
        title={`${MESES[p.mes-1]} / ${p.ano}`}
        description={`${p.curso?.codigo} — ${p.curso?.nome}`}
        actions={
          <div className="flex gap-2 items-center">
            <Badge variant={fechado ? "default" : "secondary"}>{p.estado}</Badge>
            {!fechado && (
              <Button variant="outline" onClick={() => recalcular.mutate()} disabled={recalcular.isPending}>
                <RefreshCw className="size-4" />{recalcular.isPending ? "A recalcular…" : "Recalcular"}
              </Button>
            )}
            {fechado ? (
              <Button variant="outline" onClick={() => toggleEstado.mutate("rascunho")}><LockOpen className="size-4" />Reabrir</Button>
            ) : (
              <Button onClick={() => toggleEstado.mutate("fechado")}><Lock className="size-4" />Fechar</Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="destructive" size="icon"><Trash2 className="size-4" /></Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Eliminar processamento?</AlertDialogTitle>
                  <AlertDialogDescription>Esta ação é irreversível.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => eliminar.mutate()}>Eliminar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button asChild variant="ghost"><Link to="/financeiro/processamentos">Voltar</Link></Button>
          </div>
        }
      />

      <NotasPainel chave={`processamento:${p.id}`} titulo="Notas deste processamento" placeholder="Notas sobre este mês…" />



      {(() => {
        const rubs = ["BF","BFM","SA","TR","HN","ATL"] as const;
        const totDif: Record<string, number> = { BF:0, BFM:0, SA:0, TR:0, HN:0, ATL:0 };
        (linhas.data ?? []).forEach((l: any) => {
          if (totDif[l.rubrica] === undefined) return;
          const primario = Number(l.valor ?? 0);
          const manual = l.valor_manual != null ? Number(l.valor_manual) : null;
          totDif[l.rubrica] += manual != null && manual > 0 ? manual : primario;
        });
        const fmdDif = totDif.BF + totDif.BFM + totDif.SA + totDif.TR + totDif.ATL;
        const fmd = Number(p.total_bf) + Number(p.total_bfm) + Number(p.total_sa) + Number(p.total_tr) + Number(p.total_atl ?? 0);
        const diff = +(fmdDif - fmd).toFixed(2);
        const hasDif = Math.abs(diff) > 0.005;
        return (
          <>
            <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-7 mb-3">
              <Stat label="BF" v={p.total_bf} /><Stat label="BFM" v={p.total_bfm} />
              <Stat label="SA" v={p.total_sa} /><Stat label="TR" v={p.total_tr} />
              <Stat label="ATL" v={p.total_atl ?? 0} />
              <Stat label="HN" v={p.total_hn} /><Stat label="Total" v={p.total_geral} strong />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 mb-3">
              <Stat label="Total formandos (BF+BFM+SA+TR+ATL)" v={fmd} />
              <Stat label="Total formadores (HN)" v={p.total_hn} />
            </div>


            <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-2 mb-4 rounded-md border p-3 ${hasDif ? "border-orange-300 bg-orange-50 dark:bg-orange-950/20" : "border-border"}`}>
              <Stat label="Total Dif. formandos" v={fmdDif} />
              <Card><CardContent className="p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Diferença (Dif. − Real)</div>
                <div className={`mt-1 tabular-nums text-lg font-semibold ${hasDif ? "text-orange-700 dark:text-orange-300" : ""}`}>
                  {diff > 0 ? "+" : ""}{diff.toFixed(2)} €
                </div>
              </CardContent></Card>
            </div>
          </>
        );
      })()}

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><FileSpreadsheet className="size-4" />Exportar Excel</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Alvo</Label>
            <Select value={filtroModo} onValueChange={(v: any) => { setFiltroModo(v); setFiltroId(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tudo">Todos os formandos (um ficheiro por formando × rubrica)</SelectItem>
                <SelectItem value="formando">Apenas um formando (um ficheiro por rubrica)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {filtroModo === "formando" && (
            <div className="space-y-1.5 md:col-span-2">
              <Label>Formando</Label>
              <Select value={filtroId} onValueChange={setFiltroId}>
                <SelectTrigger><SelectValue placeholder="Escolher…" /></SelectTrigger>
                <SelectContent>
                  {opcoesFormandos.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className={`space-y-1.5 ${filtroModo === "tudo" ? "md:col-span-3" : ""}`}>
            <Label>Rubricas de formandos</Label>
            <div className="flex flex-wrap gap-3 items-center pt-1">
              {RUBRICAS.filter(r => r !== "HN").map(r => (
                <label key={r} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox checked={rubricasSel.has(r)} onCheckedChange={() => toggleRubrica(r)} />
                  <span>{r}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Rubricas de formadores (HN) são emitidas via nota de honorários abaixo.</p>
          </div>
          <div className="md:col-span-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const { exportPagamentosContabilidadePdf } = await import("@/lib/pdf-exports");
                  await exportPagamentosContabilidadePdf({
                    processamentoId: id,
                    cursoNome: (proc.data as any)?.curso?.nome ?? "Curso",
                    ano: (proc.data as any)?.ano,
                    mes: (proc.data as any)?.mes,
                  });
                } catch (e: any) { toast.error(e.message); }
              }}
            >
              <FileText className="size-4" />PDF Contabilidade
            </Button>
            <Button variant="outline" onClick={exportarPagamentos}><FileSpreadsheet className="size-4" />Excel Pagamentos</Button>
            <Button onClick={exportar}><FileSpreadsheet className="size-4" />Gerar Excel</Button>
          </div>
        </CardContent>
      </Card>




      <Card className="mb-4">
        <CardHeader className="pb-3"><CardTitle className="text-base">Formandos</CardTitle></CardHeader>
        <CardContent className="p-0">
          <FormandosGrouped linhas={fmds} processamentoId={id} cursoId={p.curso_id} fechado={fechado} tetoAtl={Number((cfg.data as any)?.atl_teto_mensal ?? 0)} />
        </CardContent>
      </Card>




    </PageContainer>
  );
}



function Stat({ label, v, strong }: { label: string; v: number; strong?: boolean }) {
  return (
    <Card><CardContent className="p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 tabular-nums ${strong ? "text-lg font-semibold" : "text-base font-medium"}`}>{Number(v ?? 0).toFixed(2)} €</div>
    </CardContent></Card>
  );
}

function FormandosGrouped({ linhas, processamentoId, cursoId, fechado, tetoAtl }: { linhas: any[]; processamentoId: string; cursoId: string; fechado: boolean; tetoAtl: number }) {
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [manualEdits, setManualEdits] = useState<Record<string, string>>({});
  const [horasEdits, setHorasEdits] = useState<Record<string, string>>({});
  const [obsEdits, setObsEdits] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingObsId, setSavingObsId] = useState<string | null>(null);

  // Formandos desistentes deste curso — só nestes é permitido acertar horas frequentadas.
  const desistentesQuery = useQuery({
    queryKey: ["fin-proc-desistentes", cursoId],
    queryFn: async () => {
      const { data, error } = await supabase.from("curso_formandos")
        .select("formando_id, estado, data_desistencia").eq("curso_id", cursoId);
      if (error) throw error;
      const s = new Set<string>();
      (data ?? []).forEach((r: any) => {
        if (r.estado === "desistente" || r.data_desistencia) s.add(r.formando_id);
      });
      return s;
    },
  });
  const desistentes = desistentesQuery.data ?? new Set<string>();


  const obsQuery = useQuery({
    queryKey: ["fin-proc-obs", processamentoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("fin_processamento_obs")
        .select("formando_id, texto").eq("processamento_id", processamentoId);
      if (error) throw error;
      const m: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { m[r.formando_id] = r.texto ?? ""; });
      return m;
    },
  });

  async function saveObs(formandoId: string) {
    const raw = obsEdits[formandoId];
    if (raw === undefined) return;
    setSavingObsId(formandoId);
    try {
      const { error } = await (supabase as any).from("fin_processamento_obs")
        .upsert({ processamento_id: processamentoId, formando_id: formandoId, texto: raw }, { onConflict: "processamento_id,formando_id" });
      if (error) throw error;
      toast.success("Observação guardada.");
      setObsEdits(prev => { const n = { ...prev }; delete n[formandoId]; return n; });
      qc.invalidateQueries({ queryKey: ["fin-proc-obs", processamentoId] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingObsId(null);
    }
  }

  async function refreshTotais() {
    const { data: todas } = await supabase.from("fin_processamento_linha")
      .select("rubrica, valor").eq("processamento_id", processamentoId);
    const soma = { BF: 0, BFM: 0, SA: 0, TR: 0, HN: 0, ATL: 0 } as Record<string, number>;
    (todas ?? []).forEach((l: any) => { if (soma[l.rubrica] !== undefined) soma[l.rubrica] += Number(l.valor ?? 0); });
    const geral = soma.BF + soma.BFM + soma.SA + soma.TR + soma.HN + soma.ATL;
    await supabase.from("fin_processamento")
      .update({
        total_bf: +soma.BF.toFixed(2), total_bfm: +soma.BFM.toFixed(2),
        total_sa: +soma.SA.toFixed(2), total_tr: +soma.TR.toFixed(2),
        total_hn: +soma.HN.toFixed(2), total_atl: +soma.ATL.toFixed(2),
        total_geral: +geral.toFixed(2),
      } as never)
      .eq("id", processamentoId);
  }

  // Acerto manual de horas frequentadas (só formandos desistentes).
  // Regra: 1 dia = 7 horas; o dia parcial só conta (SA/TR) se tiver ≥ 3h.
  // As restantes rubricas do formando são recalculadas a partir das novas horas.
  function diasDeHoras(h: number) {
    const inteiros = Math.floor(h / 7);
    const resto = h - inteiros * 7;
    return inteiros + (resto >= 3 ? 1 : 0);
  }

  function patchLinha(l: any, h: number, dias: number): Record<string, unknown> {
    const mc = (l.memoria_calculo ?? {}) as any;
    const base: Record<string, unknown> = { horas_frequentadas: h, horas_elegiveis: h };
    const nota = "Recalculado a partir do acerto manual de horas (1 dia = 7h; dia parcial conta com ≥ 3h).";

    if (l.rubrica === "BF" || l.rubrica === "BFM") {
      const valorMensal = Number(mc.valor_mensal ?? 0);
      const horasRef = Number(mc.horas_mes_ref ?? 0);
      const taxa = horasRef > 0 ? valorMensal / horasRef : Number(l.valor_hora ?? 0);
      const bruto = +(taxa * h).toFixed(2);
      base.valor = valorMensal > 0 ? Math.min(bruto, valorMensal) : bruto;
      base.dias_elegiveis = dias;
      base.memoria_calculo = { ...mc, horas_freq: h, valor_bruto: bruto, dias, limitado_pelo_tecto: valorMensal > 0 && bruto > valorMensal, acerto_manual_horas: true, nota_acerto: nota };
      return base;
    }

    if (l.rubrica === "SA") {
      const valorDia = Number(l.valor_dia ?? mc.valor_dia ?? 0);
      base.dias_elegiveis = dias;
      base.valor = +(dias * valorDia).toFixed(2);
      base.memoria_calculo = { ...mc, dias, valor_dia: valorDia, acerto_manual_horas: true, nota_acerto: nota };
      return base;
    }

    if (l.rubrica === "TR") {
      const teto = Number(mc.teto_mensal ?? 0);
      if (mc.modo === "passe") {
        const passe = Number(mc.valor_passe ?? 0);
        const bruto = dias > 0 ? +passe.toFixed(2) : 0;
        base.valor = teto > 0 ? +Math.min(bruto, teto).toFixed(2) : bruto;
        base.dias_elegiveis = dias;
        base.km_total = 0;
        base.memoria_calculo = { ...mc, dias, bruto, acerto_manual_horas: true, nota_acerto: nota };
      } else {
        const kmDia = Number(mc.km_dia_aplicado ?? mc.km_dia ?? 0);
        const valorKm = Number(mc.valor_km ?? 0);
        const kmTotal = +(dias * kmDia).toFixed(2);
        const bruto = +(kmTotal * valorKm).toFixed(2);
        base.valor = teto > 0 ? +Math.min(bruto, teto).toFixed(2) : bruto;
        base.dias_elegiveis = dias;
        base.km_total = kmTotal;
        base.memoria_calculo = { ...mc, dias, km_total: kmTotal, bruto, acerto_manual_horas: true, nota_acerto: nota };
      }
      return base;
    }

    // ATL e outras rubricas: só actualiza horas/dias, valor mantém-se (manual).
    base.dias_elegiveis = dias;
    base.memoria_calculo = { ...mc, dias, acerto_manual_horas: true, nota_acerto: nota };
    return base;
  }

  async function saveHoras(l: any) {
    const raw = horasEdits[l.id];
    if (raw === undefined) return;
    const h = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(h) || h < 0) { toast.error("Horas inválidas."); return; }
    const dias = diasDeHoras(h);
    const irmas = (linhas ?? []).filter((x: any) => x.formando_id === l.formando_id);

    setSavingId(l.id);
    try {
      for (const linha of irmas) {
        const { error } = await supabase.from("fin_processamento_linha")
          .update(patchLinha(linha, h, dias) as never).eq("id", linha.id);
        if (error) throw error;
      }
      await refreshTotais();
      toast.success(`Horas atualizadas — ${dias} dia(s) elegível(eis).`);
      setHorasEdits(prev => { const n = { ...prev }; delete n[l.id]; return n; });
      qc.invalidateQueries({ queryKey: ["fin-proc", processamentoId] });
      qc.invalidateQueries({ queryKey: ["fin-proc-linhas", processamentoId] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingId(null);
    }
  }



  async function saveAtl(linhaId: string) {
    const raw = edits[linhaId];
    if (raw === undefined) return;
    let v = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(v) || v < 0) v = 0;
    if (tetoAtl > 0 && v > tetoAtl) v = tetoAtl;
    setSavingId(linhaId);
    try {
      const { error } = await supabase.from("fin_processamento_linha")
        .update({ valor: v } as never).eq("id", linhaId);
      if (error) throw error;
      await refreshTotais();
      toast.success("Valor ATL guardado.");
      setEdits(prev => { const n = { ...prev }; delete n[linhaId]; return n; });
      qc.invalidateQueries({ queryKey: ["fin-proc", processamentoId] });
      qc.invalidateQueries({ queryKey: ["fin-proc-linhas", processamentoId] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingId(null);
    }
  }

  async function saveManual(linhaId: string) {
    const raw = manualEdits[linhaId];
    if (raw === undefined) return;
    const trimmed = String(raw).trim();
    let payload: number | null;
    if (trimmed === "") {
      payload = null;
    } else {
      const v = Number(trimmed.replace(",", "."));
      if (!Number.isFinite(v) || v < 0) { toast.error("Valor inválido."); return; }
      payload = v;
    }
    setSavingId(linhaId);
    try {
      const { error } = await supabase.from("fin_processamento_linha")
        .update({ valor_manual: payload } as never).eq("id", linhaId);
      if (error) throw error;
      toast.success(payload == null ? "Override removido." : "Valor Dif. guardado.");
      setManualEdits(prev => { const n = { ...prev }; delete n[linhaId]; return n; });
      qc.invalidateQueries({ queryKey: ["fin-proc-linhas", processamentoId] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingId(null);
    }
  }

  const grupos = useMemo(() => {
    const m = new Map<string, { id: string; nome: string; total: number; totalDif: number; linhas: any[] }>();
    for (const l of linhas) {
      const g = m.get(l.formando_id) ?? { id: l.formando_id, nome: l.formando?.nome ?? "—", total: 0, totalDif: 0, linhas: [] as any[] };
      g.linhas.push(l);
      const primario = Number(l.valor ?? 0);
      const manual = l.valor_manual != null ? Number(l.valor_manual) : null;
      g.total += primario;
      g.totalDif += manual != null && manual > 0 ? manual : primario;
      m.set(l.formando_id, g);
    }
    return Array.from(m.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [linhas]);

  const [aberto, setAberto] = useState<Set<string>>(new Set());
  function toggle(id: string) {
    setAberto(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  if (!grupos.length) return <div className="p-6 text-center text-sm text-muted-foreground">Sem linhas.</div>;

  return (
    <Table>
      <TableHeader><TableRow>
        <TableHead className="w-8"></TableHead>
        <TableHead>Formando</TableHead>
        <TableHead>Rubricas</TableHead>
        <TableHead className="text-right">Total (€)</TableHead>
        <TableHead className="text-right">Total Dif. (€)</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {grupos.map(g => {
          const isOpen = aberto.has(g.id);
          const dif = +(g.totalDif - g.total).toFixed(2);
          const difClass = Math.abs(dif) > 0.005 ? "bg-orange-50 dark:bg-orange-950/30" : "";
          return (
            <>
              <TableRow key={g.id} className={`cursor-pointer hover:bg-muted/50 ${difClass}`} onClick={() => toggle(g.id)}>
                <TableCell className="py-2">
                  {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </TableCell>
                <TableCell className="font-medium">
                  {g.nome}
                  {desistentes.has(g.id) && <Badge variant="outline" className="ml-2 text-[10px]">Desistente</Badge>}

                  {Math.abs(dif) > 0.005 && (
                    <div className="text-[11px] font-normal text-orange-700 dark:text-orange-300 mt-0.5">
                      Diferença: {dif > 0 ? "+" : ""}{dif.toFixed(2)} €
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {g.linhas.map((l: any) => <Badge key={l.id} variant="secondary">{l.rubrica}</Badge>)}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{g.total.toFixed(2)}</TableCell>
                <TableCell className={`text-right tabular-nums font-semibold ${Math.abs(dif) > 0.005 ? "text-orange-700 dark:text-orange-300" : ""}`}>{g.totalDif.toFixed(2)}</TableCell>
              </TableRow>
              {isOpen && (
                <TableRow key={`${g.id}-det`} className="bg-muted/30 hover:bg-muted/30">
                  <TableCell></TableCell>
                  <TableCell colSpan={4} className="py-2">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Rubrica</TableHead>
                        <TableHead className="text-right">H. prev.</TableHead>
                        <TableHead className="text-right">H. freq.</TableHead>
                        <TableHead className="text-right">Dias</TableHead>
                        <TableHead className="text-right">Km</TableHead>
                        <TableHead className="text-right">€/h</TableHead>
                        <TableHead className="text-right">Valor (€)</TableHead>
                        <TableHead className="text-right">Valor Dif. (€)</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {g.linhas.map((l: any) => {
                          const isAtl = l.rubrica === "ATL";
                          const editable = isAtl && !fechado;
                          const horasEditavel = !fechado && desistentes.has(l.formando_id);
                          const horasEdit = horasEdits[l.id];
                          const horasCurrent = horasEdit !== undefined ? horasEdit : String(Number(l.horas_frequentadas ?? 0));
                          const manualStored = l.valor_manual != null ? String(l.valor_manual) : "";
                          const manualEdit = manualEdits[l.id];
                          const manualCurrent = manualEdit !== undefined ? manualEdit : manualStored;
                          const editVal = edits[l.id];
                          const currentVal = editVal !== undefined ? editVal : String(Number(l.valor ?? 0));
                          return (
                          <TableRow key={l.id}>
                            <TableCell><Badge variant="outline">{l.rubrica}</Badge></TableCell>
                            <TableCell className="text-right tabular-nums">{Number(l.horas_previstas).toFixed(1)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {horasEditavel ? (
                                <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                  <input
                                    type="number" step="0.5" min="0"
                                    className="h-7 w-20 rounded-md border bg-background px-2 text-right text-sm"
                                    value={horasCurrent}
                                    onChange={e => setHorasEdits(prev => ({ ...prev, [l.id]: e.target.value }))}
                                  />
                                  <Button size="sm" variant="outline" className="h-7 px-2"
                                    disabled={savingId === l.id || horasEdits[l.id] === undefined}
                                    onClick={() => saveHoras(l)}>
                                    {savingId === l.id ? "…" : "OK"}
                                  </Button>
                                </div>
                              ) : (
                                Number(l.horas_frequentadas).toFixed(1)
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{l.dias_elegiveis}</TableCell>

                            <TableCell className="text-right tabular-nums">{l.rubrica === "TR" && Number(l.km_total ?? 0) > 0 ? Number(l.km_total).toFixed(2) : "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{l.valor_hora ? Number(l.valor_hora).toFixed(4) : "—"}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              {editable ? (
                                <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                  <input
                                    type="number" step="0.01" min="0"
                                    className="h-7 w-24 rounded-md border bg-background px-2 text-right text-sm"
                                    value={currentVal}
                                    onChange={e => setEdits(prev => ({ ...prev, [l.id]: e.target.value }))}
                                  />
                                  <Button size="sm" variant="outline" className="h-7 px-2"
                                    disabled={savingId === l.id || edits[l.id] === undefined}
                                    onClick={() => saveAtl(l.id)}>
                                    {savingId === l.id ? "…" : "Guardar"}
                                  </Button>
                                </div>
                              ) : (
                                Number(l.valor).toFixed(2)
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fechado ? (
                                l.valor_manual != null ? Number(l.valor_manual).toFixed(2) : "—"
                              ) : (
                                <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                  <input
                                    type="number" step="0.01" min="0" placeholder="—"
                                    className="h-7 w-24 rounded-md border bg-background px-2 text-right text-sm"
                                    value={manualCurrent}
                                    onChange={e => setManualEdits(prev => ({ ...prev, [l.id]: e.target.value }))}
                                  />
                                  <Button size="sm" variant="outline" className="h-7 px-2"
                                    disabled={savingId === l.id || manualEdits[l.id] === undefined}
                                    onClick={() => saveManual(l.id)}>
                                    {savingId === l.id ? "…" : "Guardar"}
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    <div className="mt-3 pt-3 border-t" onClick={e => e.stopPropagation()}>
                      <Label className="text-xs font-medium text-muted-foreground">Observações</Label>
                      {(() => {
                        const stored = obsQuery.data?.[g.id] ?? "";
                        const edited = obsEdits[g.id];
                        const current = edited !== undefined ? edited : stored;
                        const dirty = edited !== undefined && edited !== stored;
                        return (
                          <div className="mt-1.5 space-y-2">
                            <Textarea
                              value={current}
                              readOnly={fechado}
                              placeholder="Notas/registos manuais para este formando neste processamento…"
                              rows={2}
                              onChange={e => setObsEdits(prev => ({ ...prev, [g.id]: e.target.value }))}
                            />
                            {!fechado && (
                              <div className="flex justify-end">
                                <Button size="sm" variant="outline" disabled={!dirty || savingObsId === g.id} onClick={() => saveObs(g.id)}>
                                  {savingObsId === g.id ? "A guardar…" : "Guardar observações"}
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </>
          );
        })}
      </TableBody>
    </Table>
  );
}
