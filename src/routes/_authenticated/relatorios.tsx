import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { localDateIso } from "@/lib/format";
import { paintBeforeHeavyWork } from "@/lib/offline-sql";
import { runNativeExcelReport, runNativePdfReport } from "@/lib/electron-io";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios e SIGO — Gestão Pedagógica" }] }),
  component: RelatoriosPage,
});

function NotaHonorariosCard() {
  const [formadorId, setFormadorId] = useState("");
  const now = new Date();
  const [modo, setModo] = useState<"mes" | "ufcd">("mes");
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ufcdId, setUfcdId] = useState<string>("");

  const [valorHora, setValorHora] = useState<string>("15");
  const [retencao, setRetencao] = useState<string>("25");
  const [destNome, setDestNome] = useState("");
  const [destNif, setDestNif] = useState("");
  const [destMorada, setDestMorada] = useState("");
  const [numero, setNumero] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [busy, setBusy] = useState(false);

  const formadores = useQuery({
    queryKey: ["formadores-nomes"],
    queryFn: async () => (await supabase.from("formadores").select("id, nome").order("nome")).data ?? [],
  });

  const ufcdsDisponiveis = useQuery({
    enabled: !!formadorId,
    queryKey: ["ufcds-formador", formadorId, modo, ano, mes],
    queryFn: async () => {
      let q = supabase.from("sessoes").select("curso_ufcd_id").eq("formador_id", formadorId);
      if (modo === "mes") {
        const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
        const fimDate = new Date(ano, mes, 0);
        const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(fimDate.getDate()).padStart(2, "0")}`;
        q = q.gte("data", inicio).lte("data", fim);
      }
      const { data: sess } = await q;
      const cufIds = Array.from(new Set((sess ?? []).map((s: any) => s.curso_ufcd_id).filter(Boolean)));
      if (!cufIds.length) return [];
      const { data: cufs } = await supabase.from("curso_ufcds").select("id, ufcd_id").in("id", cufIds);
      const ufcdIds = Array.from(new Set((cufs ?? []).map((c: any) => c.ufcd_id)));
      if (!ufcdIds.length) return [];
      const { data: ufcds } = await supabase.from("ufcds").select("id, codigo, designacao").in("id", ufcdIds).order("codigo");
      return ufcds ?? [];
    },
  });

  async function gerar() {
    if (!formadorId) { toast.error("Escolha um formador"); return; }
    if (modo === "ufcd" && !ufcdId) { toast.error("Escolha uma UFCD"); return; }
    const vh = parseFloat(valorHora.replace(",", "."));
    if (!vh || vh <= 0) { toast.error("Valor/hora inválido"); return; }
    try {
      setBusy(true);
      await paintBeforeHeavyWork();
      const { exportNotaHonorariosPdf } = await import("@/lib/pdf-exports");
      await exportNotaHonorariosPdf({
        formadorId,
        modo,
        ano: modo === "mes" ? ano : undefined,
        mes: modo === "mes" ? mes : undefined,
        ufcdId: modo === "ufcd" ? ufcdId : (ufcdId || null),
        valorHora: vh,
        retencaoIrs: parseFloat(retencao.replace(",", ".")) || 0,
        numero: numero || undefined,
        destinatario: (destNome || destNif || destMorada) ? { nome: destNome, nif: destNif, morada: destMorada } : undefined,
        observacoes: observacoes || undefined,
      });
      toast.success("Nota de honorários gerada");
    } catch (e: any) {
      toast.error("Erro ao gerar", { description: e.message });
    } finally {
      setBusy(false);
    }
  }

  const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const anos = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i);

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <FileText className="size-4" /> Nota de honorários (formador)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Gera um PDF com o detalhe das sessões ministradas por um formador.
          Escolha filtrar <strong>por mês</strong> ou <strong>por UFCD ministrada</strong>.
        </p>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Formador *</Label>
            <Select value={formadorId} onValueChange={(v) => { setFormadorId(v); setUfcdId(""); }}>
              <SelectTrigger><SelectValue placeholder="Escolher formador…" /></SelectTrigger>
              <SelectContent>
                {(formadores.data ?? []).map((f: any) => (
                  <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Filtrar por *</Label>
            <Select value={modo} onValueChange={(v: "mes" | "ufcd") => { setModo(v); setUfcdId(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mes">Mês</SelectItem>
                <SelectItem value="ufcd">UFCD ministrada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {modo === "mes" ? (
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Mês *</Label>
              <Select value={String(mes)} onValueChange={(v) => setMes(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {meses.map((m, i) => <SelectItem key={i} value={String(i+1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ano *</Label>
              <Select value={String(ano)} onValueChange={(v) => setAno(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {anos.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor / hora (€) *</Label>
              <Input type="number" step="0.01" min="0" value={valorHora} onChange={e => setValorHora(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Retenção IRS (%)</Label>
              <Input type="number" step="0.01" min="0" max="100" value={retencao} onChange={e => setRetencao(e.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-4">
              <Label>UFCD (opcional — filtra dentro do mês)</Label>
              <Select value={ufcdId || "__all__"} onValueChange={(v) => setUfcdId(v === "__all__" ? "" : v)} disabled={!formadorId}>
                <SelectTrigger><SelectValue placeholder="Todas as UFCD do mês" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas as UFCD do mês</SelectItem>
                  {(ufcdsDisponiveis.data ?? []).map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.codigo} — {u.designacao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5 md:col-span-3">
              <Label>UFCD ministrada *</Label>
              <Select value={ufcdId} onValueChange={setUfcdId} disabled={!formadorId}>
                <SelectTrigger><SelectValue placeholder="Escolher UFCD…" /></SelectTrigger>
                <SelectContent>
                  {(ufcdsDisponiveis.data ?? []).map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.codigo} — {u.designacao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor / hora (€) *</Label>
              <Input type="number" step="0.01" min="0" value={valorHora} onChange={e => setValorHora(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Retenção IRS (%)</Label>
              <Input type="number" step="0.01" min="0" max="100" value={retencao} onChange={e => setRetencao(e.target.value)} />
            </div>
          </div>
        )}



        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Nº da nota (opcional)</Label>
            <Input placeholder="Auto se vazio" value={numero} onChange={e => setNumero(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Destinatário — Nome</Label>
            <Input value={destNome} onChange={e => setDestNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Destinatário — NIF</Label>
            <Input value={destNif} onChange={e => setDestNif(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Destinatário — Morada</Label>
            <Input value={destMorada} onChange={e => setDestMorada(e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Observações</Label>
            <Input value={observacoes} onChange={e => setObservacoes(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={gerar} disabled={!formadorId || busy}>
            <FileText className="size-4" /> {busy ? "A gerar…" : "Gerar PDF"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RelatoriosPage() {
  const [cursoId, setCursoId] = useState("");
  const [inicio, setInicio] = useState(() => {
    const d = new Date(); d.setDate(1);
    return localDateIso(d);
  });
  const [fim, setFim] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(0);
    return localDateIso(d);
  });
  const [busy, setBusy] = useState<string | null>(null);

  const cursos = useQuery({
    queryKey: ["cursos-all"],
    queryFn: async () => (await supabase.from("cursos").select("id, codigo, nome").order("codigo")).data ?? [],
  });

  async function run(key: string, fn: () => Promise<void>) {
    if (busy) return;
    try {
      setBusy(key);
      await paintBeforeHeavyWork();
      await fn();
      toast.success("Exportação concluída");
    } catch (e: any) {
      toast.error("Erro na exportação", { description: e.message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageContainer>
      <PageHeader title="Relatórios e SIGO" description="Exportação Excel para SIGO e relatórios consolidados." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileSpreadsheet className="size-4" /> Exportação SIGO por curso
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Gera um livro Excel com 4 folhas: <strong>Resumo</strong>, <strong>Sessões</strong>,
              <strong> UFCD</strong> (horas previstas / realizadas / em falta) e <strong>Formadores</strong> envolvidos.
              Preparado para apoio ao preenchimento manual em SIGO.
            </p>
            <div className="space-y-1.5">
              <Label>Curso *</Label>
              <Select value={cursoId} onValueChange={setCursoId}>
                <SelectTrigger><SelectValue placeholder="Escolher curso…" /></SelectTrigger>
                <SelectContent>
                  {(cursos.data ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.codigo} — {c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={!cursoId || !!busy} onClick={() => run("sigo", async () => {
                const native = await runNativeExcelReport("sigo-curso", { cursoId });
                if (!native) await (await import("@/lib/exports")).exportSigoCurso(cursoId);
              })}>
                <FileSpreadsheet className="size-4" /> {busy === "sigo" ? "A exportar…" : "Excel"}
              </Button>
              <Button variant="outline" disabled={!cursoId || !!busy} onClick={() => run("sigo-pdf", async () => {
                const native = await runNativePdfReport("sigo-curso", { cursoId });
                if (!native) await (await import("@/lib/pdf-exports")).exportSigoCursoPdf(cursoId);
              })}>
                <FileText className="size-4" /> {busy === "sigo-pdf" ? "A exportar…" : "PDF"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileSpreadsheet className="size-4" /> Horas por formador
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Resumo agregado e detalhe de sessões por formador num intervalo.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Início</Label><Input type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Fim</Label><Input type="date" value={fim} onChange={e => setFim(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={!inicio || !fim || !!busy} onClick={() => run("form", async () => {
                const native = await runNativeExcelReport("relatorio-formadores", { inicio, fim });
                if (!native) await (await import("@/lib/exports")).exportRelatorioFormadores(inicio, fim);
              })}>
                <FileSpreadsheet className="size-4" /> {busy === "form" ? "A exportar…" : "Excel"}
              </Button>
              <Button variant="outline" disabled={!inicio || !fim || !!busy} onClick={() => run("form-pdf", async () => {
                const native = await runNativePdfReport("relatorio-formadores", { inicio, fim });
                if (!native) await (await import("@/lib/pdf-exports")).exportRelatorioFormadoresPdf(inicio, fim);
              })}>
                <FileText className="size-4" /> {busy === "form-pdf" ? "A exportar…" : "PDF"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileSpreadsheet className="size-4" /> Execução de cursos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tabela com todos os cursos: UFCD atribuídas/concluídas, horas previstas, realizadas, em falta e % de execução.
            </p>
            <div className="flex gap-2">
              <Button disabled={!!busy} onClick={() => run("cursos", async () => {
                const native = await runNativeExcelReport("relatorio-cursos", {});
                if (!native) await (await import("@/lib/exports")).exportRelatorioCursos();
              })}>
                <FileSpreadsheet className="size-4" /> {busy === "cursos" ? "A exportar…" : "Excel"}
              </Button>
              <Button variant="outline" disabled={!!busy} onClick={() => run("cursos-pdf", async () => {
                const native = await runNativePdfReport("relatorio-cursos", {});
                if (!native) await (await import("@/lib/pdf-exports")).exportRelatorioCursosPdf();
              })}>
                <FileText className="size-4" /> {busy === "cursos-pdf" ? "A exportar…" : "PDF"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileSpreadsheet className="size-4" /> Faltas dos formandos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Faltas de todos os formandos no intervalo selecionado acima. Inclui folha de <strong>Resumo</strong> (por formando/curso) e <strong>Detalhe</strong> (cada falta com sessão, UFCD e observações).
            </p>
            <div className="flex gap-2">
              <Button disabled={!inicio || !fim || !!busy} onClick={() => run("faltas", async () => {
                const native = await runNativeExcelReport("relatorio-faltas", { inicio, fim });
                if (!native) await (await import("@/lib/exports")).exportRelatorioFaltas(inicio, fim);
              })}>
                <FileSpreadsheet className="size-4" /> {busy === "faltas" ? "A exportar…" : "Excel"}
              </Button>
              <Button variant="outline" disabled={!inicio || !fim || !!busy} onClick={() => run("faltas-pdf", async () => {
                const native = await runNativePdfReport("relatorio-faltas", { inicio, fim });
                if (!native) await (await import("@/lib/pdf-exports")).exportRelatorioFaltasPdf(inicio, fim);
              })}>
                <FileText className="size-4" /> {busy === "faltas-pdf" ? "A exportar…" : "PDF"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <NotaHonorariosCard />
      </div>

    </PageContainer>
  );
}
