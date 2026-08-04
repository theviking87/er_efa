import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, CheckCircle2, AlertCircle, Upload } from "lucide-react";
import { toast } from "sonner";
import { saveFile } from "@/lib/dom-helpers";
import { criarBackup, restaurarBackup } from "@/lib/backup";

export const Route = createFileRoute("/_authenticated/exportar")({
  component: ExportarPage,
});

type Step = { label: string; status: "pending" | "running" | "done" | "error"; detail?: string };

function ExportarPage() {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [restoring, setRestoring] = useState(false);
  const [restoreSteps, setRestoreSteps] = useState<Step[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function update(i: number, patch: Partial<Step>) {
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));
  }

  async function exportar() {
    setRunning(true);
    setSteps([
      { label: "A recolher dados e ficheiros", status: "running" },
      { label: "A criar arquivo .zip", status: "pending" },
    ]);

    try {
      const { blob, registos, ficheiros } = await criarBackup();
      update(0, { status: "done", detail: `${registos} registos · ${ficheiros} ficheiros` });
      update(1, { status: "running" });

      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const filename = `backup-formacao-${stamp}.zip`;
      const saved = await saveFile(filename, await blob.arrayBuffer(), [
        { name: "Backup ZIP", extensions: ["zip"] },
      ]);
      if (!saved) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
      update(1, { status: "done", detail: `${(blob.size / 1024 / 1024).toFixed(2)} MB` });
      toast.success("Exportação concluída");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na exportação");
      setSteps((s) => s.map((st) => (st.status === "running" ? { ...st, status: "error" } : st)));
    } finally {
      setRunning(false);
    }
  }

  async function restaurar(file: File) {
    const ok = window.confirm(
      "Restaurar este backup substitui todos os dados actuais da aplicação. Deseja continuar?",
    );
    if (!ok) return;
    setRestoring(true);
    setRestoreSteps([{ label: "A restaurar backup", status: "running" }]);
    try {
      const { registos, ficheiros } = await restaurarBackup(file, (msg) =>
        setRestoreSteps([{ label: msg, status: "running" }]),
      );
      setRestoreSteps([
        { label: "Restauro concluído", status: "done", detail: `${registos} registos · ${ficheiros} ficheiros` },
      ]);
      toast.success("Restauro concluído");
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      setRestoreSteps([
        { label: "Erro no restauro", status: "error", detail: e instanceof Error ? e.message : String(e) },
      ]);
      toast.error(e instanceof Error ? e.message : "Erro no restauro");
    } finally {
      setRestoring(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Exportar tudo"
        description="Faz o download de um backup completo (base de dados + ficheiros) ou repõe um backup anterior."
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Backup completo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Gera um ficheiro <code>.zip</code> com:
          </p>
          <ul className="text-sm list-disc pl-5 space-y-1 text-muted-foreground">
            <li><code>data.json</code> — todos os formadores, formandos, cursos, UFCDs, sessões, PRA, financeiro, etc.</li>
            <li><code>storage/formador-documentos/</code> — documentos dos formadores</li>
            <li><code>storage/formando-pra/</code> — PRAs dos formandos</li>
            <li><code>storage/despesas-anexos/</code> e <code>storage/empresa-logos/</code></li>
          </ul>

          <Button onClick={exportar} disabled={running} size="lg">
            {running ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {running ? "A exportar..." : "Exportar backup"}
          </Button>

          {steps.length > 0 && (
            <div className="space-y-2 pt-4 border-t">
              {steps.map((s, i) => (
                <StepRow key={i} step={s} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-2xl mt-6">
        <CardHeader>
          <CardTitle>Restaurar backup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Selecione um ficheiro <code>.zip</code> gerado pela exportação. Todos os dados actuais serão substituídos
            pelos do backup.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) restaurar(f);
            }}
          />
          <Button variant="outline" size="lg" disabled={restoring} onClick={() => fileRef.current?.click()}>
            {restoring ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {restoring ? "A restaurar..." : "Restaurar backup"}
          </Button>

          {restoreSteps.length > 0 && (
            <div className="space-y-2 pt-4 border-t">
              {restoreSteps.map((s, i) => (
                <StepRow key={i} step={s} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function StepRow({ step: s }: { step: Step }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {s.status === "done" && <CheckCircle2 className="size-4 text-green-600 mt-0.5" />}
      {s.status === "running" && <Loader2 className="size-4 animate-spin text-blue-600 mt-0.5" />}
      {s.status === "error" && <AlertCircle className="size-4 text-red-600 mt-0.5" />}
      {s.status === "pending" && <div className="size-4 rounded-full border-2 border-muted mt-0.5" />}
      <div className="flex-1">
        <div className={s.status === "error" ? "text-red-600" : ""}>{s.label}</div>
        {s.detail && <div className="text-xs text-muted-foreground">{s.detail}</div>}
      </div>
    </div>
  );
}
