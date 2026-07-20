import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { obterConfigFormador, guardarConfigFormador } from "@/lib/financeiro/services/formador-config";

export function FinanceiroFormadorPanel({ formadorId }: { formadorId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["fin-formador-config", formadorId],
    queryFn: () => obterConfigFormador(formadorId),
  });

  const [form, setForm] = useState({
    regime_iva: "isento",
    artigo_isencao: "",
    retencao_irs: true,
    percentagem_irs: 23,
    seguranca_social: false,
    percentagem_ss: 0,
    iban: "",
    observacoes: "",
  });

  useEffect(() => {
    if (q.data) {
      setForm({
        regime_iva: q.data.regime_iva ?? "isento",
        artigo_isencao: q.data.artigo_isencao ?? "",
        retencao_irs: !!q.data.retencao_irs,
        percentagem_irs: Number(q.data.percentagem_irs ?? 23),
        seguranca_social: !!q.data.seguranca_social,
        percentagem_ss: Number(q.data.percentagem_ss ?? 0),
        iban: q.data.iban ?? "",
        observacoes: q.data.observacoes ?? "",
      });
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => guardarConfigFormador(formadorId, {
      regime_iva: form.regime_iva,
      artigo_isencao: form.artigo_isencao || null,
      retencao_irs: form.retencao_irs,
      percentagem_irs: Number(form.percentagem_irs) || 0,
      seguranca_social: form.seguranca_social,
      percentagem_ss: form.seguranca_social ? Number(form.percentagem_ss) || 0 : null,
      iban: form.iban || null,
      observacoes: form.observacoes || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-formador-config", formadorId] });
      toast.success("Configuração fiscal guardada");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Configuração fiscal — Honorários</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Regime IVA</Label>
          <select
            className="w-full border rounded-md h-9 px-3 text-sm bg-background"
            value={form.regime_iva}
            onChange={e => setForm(f => ({ ...f, regime_iva: e.target.value }))}
          >
            <option value="isento">Isento</option>
            <option value="normal">Regime normal (23%)</option>
          </select>
        </div>
        <div>
          <Label>Artigo de isenção</Label>
          <Input value={form.artigo_isencao} onChange={e => setForm(f => ({ ...f, artigo_isencao: e.target.value }))} placeholder="ex: Art.º 9.º CIVA" />
        </div>

        <div className="flex items-center gap-2">
          <Switch checked={form.retencao_irs} onCheckedChange={v => setForm(f => ({ ...f, retencao_irs: v }))} />
          <Label>Retenção IRS</Label>
        </div>
        <div>
          <Label>% IRS</Label>
          <Input type="number" step="0.1" value={form.percentagem_irs} onChange={e => setForm(f => ({ ...f, percentagem_irs: Number(e.target.value) }))} disabled={!form.retencao_irs} />
        </div>

        <div className="flex items-center gap-2">
          <Switch checked={form.seguranca_social} onCheckedChange={v => setForm(f => ({ ...f, seguranca_social: v }))} />
          <Label>Segurança Social</Label>
        </div>
        <div>
          <Label>% SS</Label>
          <Input type="number" step="0.1" value={form.percentagem_ss} onChange={e => setForm(f => ({ ...f, percentagem_ss: Number(e.target.value) }))} disabled={!form.seguranca_social} />
        </div>

        <div className="sm:col-span-2">
          <Label>IBAN</Label>
          <Input value={form.iban} onChange={e => setForm(f => ({ ...f, iban: e.target.value }))} />
        </div>
        <div className="sm:col-span-2">
          <Label>Observações</Label>
          <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={3} />
        </div>
        <div className="sm:col-span-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Guardar</Button>
        </div>
      </CardContent>
    </Card>
  );
}
