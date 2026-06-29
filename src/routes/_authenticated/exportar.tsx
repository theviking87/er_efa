import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/exportar")({
  component: ExportarPage,
});

const TABELAS = [
  "ufcds",
  "formadores",
  "formandos",
  "cursos",
  "curso_ufcds",
  "curso_formandos",
  "curso_ufcd_formadores",
  "curso_ferias",
  "cronograma_observacoes",
  "formador_ufcds",
  "formador_disponibilidades",
  "formador_inatividades",
  "formador_documentos",
  "formando_faltas",
  "formando_pra",
  "sessoes",
] as const;

const BUCKETS = ["formador-documentos", "formando-pra"] as const;

type Step = { label: string; status: "pending" | "running" | "done" | "error"; detail?: string };

async function listAllFiles(bucket: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw error;
  for (const item of data ?? []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null || item.metadata === null) {
      // folder
      const sub = await listAllFiles(bucket, path);
      out.push(...sub);
    } else {
      out.push(path);
    }
  }
  return out;
}

function ExportarPage() {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);

  function update(i: number, patch: Partial<Step>) {
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));
  }

  async function exportar() {
    setRunning(true);
    const initial: Step[] = [
      { label: "A exportar tabelas", status: "pending" },
      ...BUCKETS.map((b) => ({ label: `A exportar ficheiros (${b})`, status: "pending" as const })),
      { label: "A criar arquivo .zip", status: "pending" },
    ];
    setSteps(initial);

    try {
      const zip = new JSZip();

      // ---- 1. Tables ----
      update(0, { status: "running" });
      const data: Record<string, unknown[]> = {};
      for (const t of TABELAS) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rows, error } = await (supabase.from as any)(t).select("*");
        if (error) throw new Error(`${t}: ${error.message}`);
        data[t] = rows ?? [];
      }
      const total = Object.values(data).reduce((a, r) => a + r.length, 0);
      zip.file("data.json", JSON.stringify({
        exportedAt: new Date().toISOString(),
        version: 1,
        tables: data,
      }, null, 2));
      update(0, { status: "done", detail: `${total} registos em ${TABELAS.length} tabelas` });

      // ---- 2. Storage buckets ----
      for (let bi = 0; bi < BUCKETS.length; bi++) {
        const bucket = BUCKETS[bi];
        const stepIdx = 1 + bi;
        update(stepIdx, { status: "running" });
        try {
          const files = await listAllFiles(bucket);
          const folder = zip.folder(`storage/${bucket}`)!;
          let ok = 0;
          for (const path of files) {
            const { data: blob, error } = await supabase.storage.from(bucket).download(path);
            if (error || !blob) continue;
            folder.file(path, blob);
            ok++;
          }
          update(stepIdx, { status: "done", detail: `${ok}/${files.length} ficheiros` });
        } catch (e) {
          update(stepIdx, { status: "error", detail: e instanceof Error ? e.message : String(e) });
        }
      }

      // ---- 3. Zip ----
      const zipIdx = 1 + BUCKETS.length;
      update(zipIdx, { status: "running" });
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `backup-formacao-${stamp}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      update(zipIdx, { status: "done", detail: `${(blob.size / 1024 / 1024).toFixed(2)} MB` });

      toast.success("Exportação concluída");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na exportação");
      setSteps((s) => s.map((st) => (st.status === "running" ? { ...st, status: "error" } : st)));
    } finally {
      setRunning(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Exportar tudo"
        description="Faz o download de um backup completo (base de dados + ficheiros). Necessário antes da migração para a versão offline."
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
            <li><code>data.json</code> — todos os formadores, formandos, cursos, UFCDs, sessões, PRA, etc.</li>
            <li><code>storage/formador-documentos/</code> — documentos dos formadores</li>
            <li><code>storage/formando-pra/</code> — PRAs dos formandos</li>
          </ul>

          <Button onClick={exportar} disabled={running} size="lg">
            {running ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {running ? "A exportar..." : "Exportar backup"}
          </Button>

          {steps.length > 0 && (
            <div className="space-y-2 pt-4 border-t">
              {steps.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  {s.status === "done" && <CheckCircle2 className="size-4 text-green-600 mt-0.5" />}
                  {s.status === "running" && <Loader2 className="size-4 animate-spin text-blue-600 mt-0.5" />}
                  {s.status === "error" && <AlertCircle className="size-4 text-red-600 mt-0.5" />}
                  {s.status === "pending" && <div className="size-4 rounded-full border-2 border-muted mt-0.5" />}
                  <div className="flex-1">
                    <div className={s.status === "error" ? "text-red-600" : ""}>{s.label}</div>
                    {s.detail && <div className="text-xs text-muted-foreground">{s.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
