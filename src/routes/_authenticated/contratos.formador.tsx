import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, FileDown, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageContainer, PageHeader } from "@/components/app-shell";
import {
  downloadBlob,
  formatDatePt,
  gerarContratoFormadorDocx,
  sanitizeFilename,
} from "@/lib/contratos/contrato-formador-docx";

export const Route = createFileRoute("/_authenticated/contratos/formador")({
  head: () => ({
    meta: [
      { title: "Contrato de Formador — Gestão de Formação" },
      {
        name: "description",
        content: "Preencha os dados do formador e das UFCD e gere o contrato de formador em formato Word (DOCX).",
      },
      { property: "og:title", content: "Contrato de Formador" },
      { property: "og:description", content: "Geração automática de contratos de formador em DOCX a partir do modelo institucional." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContratoFormadorPage,
});

type Ufcd = { id: string; horas: string; designacao: string };

const newUfcd = (): Ufcd => ({ id: crypto.randomUUID(), horas: "", designacao: "" });

const CAMPOS = [
  { key: "formadorNome", label: "Nome completo", type: "text", placeholder: "Nome completo do formador" },
  { key: "formadorFreguesia", label: "Freguesia", type: "text", placeholder: "Freguesia" },
  { key: "formadorConcelho", label: "Concelho", type: "text", placeholder: "Concelho" },
  { key: "formadorCc", label: "N.º do Cartão de Cidadão", type: "text", placeholder: "00000000 0 ZZ0" },
  { key: "validadeCc", label: "Validade do Cartão de Cidadão", type: "date", placeholder: "" },
  { key: "formadorNif", label: "NIF", type: "text", placeholder: "9 algarismos" },
  { key: "formadorMorada", label: "Morada", type: "text", placeholder: "Morada completa" },
  { key: "formadorHabAcad", label: "Habilitação académica", type: "text", placeholder: "Ex.: Licenciatura em ..." },
  { key: "dataCcp", label: "Data do CCP", type: "date", placeholder: "" },
  { key: "numeroCcp", label: "Número do CCP", type: "text", placeholder: "N.º do CCP" },
  { key: "dataInicio", label: "Data de início", type: "date", placeholder: "" },
  { key: "dataFim", label: "Data de fim", type: "date", placeholder: "" },
  { key: "dataContrato", label: "Data do contrato", type: "date", placeholder: "" },
] as const;

type CampoKey = (typeof CAMPOS)[number]["key"];
type FormState = Record<CampoKey, string>;

const EMPTY: FormState = CAMPOS.reduce((acc, c) => ({ ...acc, [c.key]: "" }), {} as FormState);

function ContratoFormadorPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [ufcds, setUfcds] = useState<Ufcd[]>([newUfcd()]);
  const [preview, setPreview] = useState(false);
  const [gerando, setGerando] = useState(false);

  const set = (key: CampoKey, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const ufcdTexto = useMemo(
    () =>
      ufcds
        .filter(u => u.horas.trim() && u.designacao.trim())
        .map(u => `${u.horas.trim()} horas relativas à UFCD - ${u.designacao.trim()}`)
        .join("; "),
    [ufcds],
  );

  function validar() {
    const problemas: string[] = CAMPOS.filter(c => !form[c.key].trim()).map(c => String(c.label));
    if (!ufcdTexto) problemas.push("Pelo menos uma UFCD completa (horas + designação)");
    if (form.formadorNif && !/^\d{9}$/.test(form.formadorNif.trim())) problemas.push("NIF com exatamente 9 algarismos");
    return problemas;
  }

  async function handleGerar() {
    const problemas = validar();
    if (problemas.length) {
      toast.error("Corrija os seguintes campos", { description: problemas.join(" • ") });
      return;
    }
    setGerando(true);
    try {
      const blob = await gerarContratoFormadorDocx({
        FORMADOR_NOME: form.formadorNome.trim(),
        FREGUESIA: form.formadorFreguesia.trim(),
        CONCELHO: form.formadorConcelho.trim(),
        FORMADOR_CC: form.formadorCc.trim(),
        VALIDADE_CC: formatDatePt(form.validadeCc),
        FORMADOR_NIF: form.formadorNif.trim(),
        FORMADOR_MORADAA: form.formadorMorada.trim(),
        FORMADOR_HAB_ACAD: form.formadorHabAcad.trim(),
        DATA_CCP: formatDatePt(form.dataCcp),
        NUMERO_CCP: form.numeroCcp.trim(),
        DATA_INICIO: formatDatePt(form.dataInicio),
        DATA_FIM: formatDatePt(form.dataFim),
        FORMADOR_UFCD: ufcdTexto,
        DATA_CONTRATO: formatDatePt(form.dataContrato),
      });
      downloadBlob(blob, `Contrato_Formador_${sanitizeFilename(form.formadorNome)}.docx`);
      toast.success("Contrato gerado com sucesso");
    } catch (e) {
      toast.error("Erro ao gerar o contrato", { description: e instanceof Error ? e.message : "Erro desconhecido" });
    } finally {
      setGerando(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Contrato de Formador"
        description="Preencha os dados, adicione as UFCD e gere o contrato em Word (DOCX) a partir do modelo institucional."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreview(v => !v)}>
              <Eye className="size-4" /> {preview ? "Ocultar pré-visualização" : "Pré-visualizar"}
            </Button>
            <Button size="sm" onClick={handleGerar} disabled={gerando}>
              {gerando ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />} Gerar contrato
            </Button>
          </div>
        }
      />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados do formador</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {CAMPOS.map(c => (
              <div key={c.key} className="space-y-1.5">
                <Label htmlFor={c.key}>{c.label}</Label>
                <Input
                  id={c.key}
                  type={c.type}
                  placeholder={c.placeholder || undefined}
                  value={form[c.key]}
                  onChange={e => set(c.key, e.target.value)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">UFCD</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setUfcds(prev => [...prev, newUfcd()])}>
              <Plus className="size-4" /> Adicionar UFCD
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {ufcds.map((u, i) => (
              <div key={u.id} className="grid gap-2 sm:grid-cols-[120px_1fr_auto] items-end">
                <div className="space-y-1.5">
                  <Label htmlFor={`horas-${u.id}`}>Horas</Label>
                  <Input
                    id={`horas-${u.id}`}
                    inputMode="numeric"
                    placeholder="25"
                    value={u.horas}
                    onChange={e => setUfcds(prev => prev.map(x => (x.id === u.id ? { ...x, horas: e.target.value } : x)))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`desig-${u.id}`}>Designação da UFCD</Label>
                  <Input
                    id={`desig-${u.id}`}
                    placeholder={`Designação da UFCD ${i + 1}`}
                    value={u.designacao}
                    onChange={e => setUfcds(prev => prev.map(x => (x.id === u.id ? { ...x, designacao: e.target.value } : x)))}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remover UFCD"
                  className="text-destructive"
                  onClick={() => setUfcds(prev => (prev.length > 1 ? prev.filter(x => x.id !== u.id) : [newUfcd()]))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Separator />
            <div className="text-xs text-muted-foreground">
              Texto que será inserido no contrato:{" "}
              <span className="text-foreground">{ufcdTexto || "— (preencha horas e designação)"}</span>
            </div>
          </CardContent>
        </Card>

        {preview && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pré-visualização dos dados</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
              {CAMPOS.map(c => (
                <div key={c.key} className="flex justify-between gap-3 border-b border-border/60 py-1">
                  <span className="text-muted-foreground">{c.label}</span>
                  <span className="font-medium text-right break-words">
                    {(c.type === "date" ? formatDatePt(form[c.key]) : form[c.key]) || "—"}
                  </span>
                </div>
              ))}
              <div className="sm:col-span-2 flex flex-col gap-1 py-1">
                <span className="text-muted-foreground">UFCD</span>
                <span className="font-medium break-words">{ufcdTexto || "—"}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
