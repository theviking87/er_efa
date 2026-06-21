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
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { exportSigoCurso, exportRelatorioFormadores, exportRelatorioCursos, exportRelatorioFaltas } from "@/lib/exports";
import { exportSigoCursoPdf, exportRelatorioFormadoresPdf, exportRelatorioCursosPdf, exportRelatorioFaltasPdf } from "@/lib/pdf-exports";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios e SIGO — Gestão Pedagógica" }] }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const [cursoId, setCursoId] = useState("");
  const [inicio, setInicio] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [fim, setFim] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(0);
    return d.toISOString().slice(0, 10);
  });
  const [busy, setBusy] = useState<string | null>(null);

  const cursos = useQuery({
    queryKey: ["cursos-all"],
    queryFn: async () => (await supabase.from("cursos").select("id, codigo, nome").order("codigo")).data ?? [],
  });

  async function run(key: string, fn: () => Promise<void>) {
    try {
      setBusy(key);
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
            <Button
              className="w-full"
              disabled={!cursoId || busy === "sigo"}
              onClick={() => run("sigo", () => exportSigoCurso(cursoId))}
            >
              <Download className="size-4" /> {busy === "sigo" ? "A exportar…" : "Exportar SIGO (.xlsx)"}
            </Button>
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
            <Button
              className="w-full"
              disabled={!inicio || !fim || busy === "form"}
              onClick={() => run("form", () => exportRelatorioFormadores(inicio, fim))}
            >
              <Download className="size-4" /> {busy === "form" ? "A exportar…" : "Exportar relatório (.xlsx)"}
            </Button>
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
            <Button
              disabled={busy === "cursos"}
              onClick={() => run("cursos", () => exportRelatorioCursos())}
            >
              <Download className="size-4" /> {busy === "cursos" ? "A exportar…" : "Exportar execução (.xlsx)"}
            </Button>
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
            <Button
              disabled={!inicio || !fim || busy === "faltas"}
              onClick={() => run("faltas", () => exportRelatorioFaltas(inicio, fim))}
            >
              <Download className="size-4" /> {busy === "faltas" ? "A exportar…" : "Exportar faltas (.xlsx)"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
