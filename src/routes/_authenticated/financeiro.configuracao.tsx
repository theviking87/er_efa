import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/financeiro/configuracao")({
  head: () => ({ meta: [{ title: "Financeiro — Configuração" }] }),
  component: ConfiguracaoPage,
});

function ConfiguracaoPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ id: "", valor_refeicao: 6, valor_km: 0.4, horas_mes: 150, iva: 23, moeda: "EUR" });

  const cfg = useQuery({
    queryKey: ["configuracao-financeira"],
    queryFn: async () => {
      const { data, error } = await supabase.from("configuracao_financeira").select("*").order("created_at").limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (cfg.data) setForm({
      id: cfg.data.id,
      valor_refeicao: Number(cfg.data.valor_refeicao),
      valor_km: Number(cfg.data.valor_km),
      horas_mes: Number(cfg.data.horas_mes),
      iva: Number(cfg.data.iva),
      moeda: cfg.data.moeda,
    });
  }, [cfg.data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        valor_refeicao: form.valor_refeicao, valor_km: form.valor_km, horas_mes: form.horas_mes,
        iva: form.iva, moeda: form.moeda, atualizacao: new Date().toISOString(),
      };
      if (form.id) {
        const { error } = await supabase.from("configuracao_financeira").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("configuracao_financeira").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["configuracao-financeira"] }); toast.success("Configuração guardada"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <PageContainer>
      <PageHeader title="Configuração Financeira" description="Parâmetros globais aplicados aos processamentos." />

      <Card className="max-w-2xl">
        <CardHeader><CardTitle className="text-base">Parâmetros</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Valor refeição (€)</Label><Input type="number" step="0.01" value={form.valor_refeicao} onChange={e => setForm(f => ({ ...f, valor_refeicao: Number(e.target.value) }))} /></div>
            <div><Label>Valor por Km (€)</Label><Input type="number" step="0.001" value={form.valor_km} onChange={e => setForm(f => ({ ...f, valor_km: Number(e.target.value) }))} /></div>
            <div><Label>Horas mensais referência</Label><Input type="number" value={form.horas_mes} onChange={e => setForm(f => ({ ...f, horas_mes: Number(e.target.value) }))} /></div>
            <div><Label>IVA %</Label><Input type="number" step="0.1" value={form.iva} onChange={e => setForm(f => ({ ...f, iva: Number(e.target.value) }))} /></div>
            <div><Label>Moeda</Label><Input value={form.moeda} onChange={e => setForm(f => ({ ...f, moeda: e.target.value }))} /></div>
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Guardar</Button>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
