import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { FileDown, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { downloadBlob, formatDatePt, sanitizeFilename } from "@/lib/contratos/contrato-formador-docx";
import { gerarContratoFormandoDocx } from "@/lib/contratos/contrato-formando-docx";

export const Route = createFileRoute("/_authenticated/contratos/formando")({
  head: () => ({
    meta: [
      { title: "Contrato de Formando — Gestão de Formação" },
      {
        name: "description",
        content: "Preencha os dados do formando, do curso e do seguro e gere o contrato de formando em Word (DOCX).",
      },
      { property: "og:title", content: "Contrato de Formando" },
      { property: "og:description", content: "Geração automática de contratos de formando em DOCX a partir do modelo integrado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContratoFormandoPage,
});

type Campo = {
  key: string;
  token: string;
  label: string;
  type: "text" | "date";
  placeholder: string;
  grupo: "Identificação" | "Formação" | "Seguro" | "Contrato";
};

const CAMPOS: Campo[] = [
  { key: "nome", token: "FORMANDO_NOME", label: "Nome completo", type: "text", placeholder: "Nome completo do formando", grupo: "Identificação" },
  { key: "cc", token: "FORMANDO_CC", label: "N.º do documento de identificação", type: "text", placeholder: "00000000 0 ZZ0", grupo: "Identificação" },
  { key: "validadeCc", token: "VALIDADE_CC", label: "Validade do documento", type: "date", placeholder: "", grupo: "Identificação" },
  { key: "nif", token: "FORMANDO_NIF", label: "NIF", type: "text", placeholder: "9 algarismos", grupo: "Identificação" },
  { key: "morada", token: "MORADA_COMPLETA", label: "Morada completa", type: "text", placeholder: "Morada, código postal e localidade", grupo: "Identificação" },
  { key: "curso", token: "CURSO", label: "Curso", type: "text", placeholder: "Designação do curso", grupo: "Formação" },
  { key: "horas", token: "HORAS_CURSO", label: "Carga horária", type: "text", placeholder: "Ex.: 300 horas", grupo: "Formação" },
  { key: "regime", token: "REGIME", label: "Regime", type: "text", placeholder: "Ex.: Presencial", grupo: "Formação" },
  { key: "inicio", token: "INICIO_CURSO", label: "Data de início", type: "date", placeholder: "", grupo: "Formação" },
  { key: "fim", token: "FIM_CURSO", label: "Data de fim", type: "date", placeholder: "", grupo: "Formação" },
  { key: "apolice", token: "NUMERO_APOLICE", label: "Número da apólice", type: "text", placeholder: "N.º da apólice", grupo: "Seguro" },
  { key: "seguradora", token: "SEGURADORA", label: "Seguradora", type: "text", placeholder: "Nome da seguradora", grupo: "Seguro" },
  { key: "dataContrato", token: "DATA_CONTRATO", label: "Data do contrato", type: "date", placeholder: "", grupo: "Contrato" },
];

const GRUPOS = ["Identificação", "Formação", "Seguro", "Contrato"] as const;

type FormState = Record<string, string>;
const EMPTY: FormState = CAMPOS.reduce<FormState>((acc, c) => ({ ...acc, [c.key]: "" }), {});

function ContratoFormandoPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [preview, setPreview] = useState(false);
  const [gerando, setGerando] = useState(false);

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  const valor = (c: Campo) => (c.type === "date" ? formatDatePt(form[c.key]) : (form[c.key] ?? "").trim());

  function validar() {
    const problemas = CAMPOS.filter(c => !(form[c.key] ?? "").trim()).map(c => c.label);
    if ((form.nif ?? "").trim() && !/^\d{9}$/.test(form.nif.trim())) problemas.push("NIF com exatamente 9 algarismos");
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
      const replacements = CAMPOS.reduce<Record<string, string>>((acc, c) => ({ ...acc, [c.token]: valor(c) }), {});
      const blob = await gerarContratoFormandoDocx(replacements as never);
      const { error: histErro } = await supabase.from("contratos_historico").insert({
        tipo_contrato: "FORMANDO",
        nome_formador: form.nome.trim(),
        ufcd: form.curso.trim(),
      });
      downloadBlob(blob, `Contrato_Formando_${sanitizeFilename(form.nome)}.docx`);
      if (histErro) {
        toast.warning("Contrato gerado, mas não foi possível registar no histórico", { description: histErro.message });
      } else {
        toast.success("Contrato gerado e registado no histórico");
      }
    } catch (e) {
      toast.error("Erro ao gerar o contrato", { description: e instanceof Error ? e.message : "Erro desconhecido" });
    } finally {
      setGerando(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Contrato de Formando"
        description="Preencha os dados e gere o contrato em Word (DOCX) a partir do modelo integrado na aplicação."
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
        {GRUPOS.map(grupo => (
          <Card key={grupo}>
            <CardHeader>
              <CardTitle className="text-base">{grupo}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {CAMPOS.filter(c => c.grupo === grupo).map(c => (
                <div key={c.key} className="space-y-1.5">
                  <Label htmlFor={c.key}>{c.label}</Label>
                  <Input
                    id={c.key}
                    type={c.type}
                    placeholder={c.placeholder || undefined}
                    value={form[c.key] ?? ""}
                    onChange={e => set(c.key, e.target.value)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        {preview && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pré-visualização dos dados</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
              {CAMPOS.map(c => (
                <div key={c.key} className="flex justify-between gap-3 border-b border-border/60 py-1">
                  <span className="text-muted-foreground">{c.label}</span>
                  <span className="font-medium text-right break-words">{valor(c) || "—"}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
