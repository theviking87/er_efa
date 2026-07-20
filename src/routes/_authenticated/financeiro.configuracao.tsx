import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  obterConfiguracaoAtiva,
  listarConfiguracoes,
  guardarNovaConfiguracao,
} from "@/lib/financeiro/services/config-global";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/financeiro/configuracao")({
  head: () => ({ meta: [{ title: "Financeiro — Configuração Global" }] }),
  component: ConfiguracaoPage,
});

function ConfiguracaoPage() {
  const qc = useQueryClient();
  const ativa = useQuery({ queryKey: ["fin-cfg-ativa"], queryFn: obterConfiguracaoAtiva });
  const historico = useQuery({ queryKey: ["fin-cfg-hist"], queryFn: listarConfiguracoes });

  const [form, setForm] = useState({
    horas_mes_referencia: 150,
    valor_subsidio_alimentacao: 6,
    valor_km: 0.4,
    moeda: "EUR",
    casas_decimais: 2,
    data_inicio: new Date().toISOString().slice(0, 10),
    observacoes: "",
  });

  useEffect(() => {
    if (ativa.data) {
      setForm(f => ({
        ...f,
        horas_mes_referencia: Number(ativa.data!.horas_mes_referencia),
        valor_subsidio_alimentacao: Number(ativa.data!.valor_subsidio_alimentacao),
        valor_km: Number(ativa.data!.valor_km),
        moeda: ativa.data!.moeda,
        casas_decimais: Number(ativa.data!.casas_decimais),
      }));
    }
  }, [ativa.data]);

  const save = useMutation({
    mutationFn: () => guardarNovaConfiguracao({
      horas_mes_referencia: Number(form.horas_mes_referencia),
      valor_subsidio_alimentacao: Number(form.valor_subsidio_alimentacao),
      valor_km: Number(form.valor_km),
      moeda: form.moeda,
      casas_decimais: Number(form.casas_decimais),
      data_inicio: form.data_inicio,
      observacoes: form.observacoes || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-cfg-ativa"] });
      qc.invalidateQueries({ queryKey: ["fin-cfg-hist"] });
      toast.success("Nova versão da configuração criada");
      setForm(f => ({ ...f, observacoes: "" }));
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <PageContainer>
      <PageHeader
        title="Configuração Financeira Global"
        description="Parâmetros globais versionados — cada gravação cria uma nova versão ativa e mantém as anteriores no histórico."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Nova versão</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Horas mensais de referência</Label>
              <Input type="number" value={form.horas_mes_referencia}
                onChange={e => setForm(f => ({ ...f, horas_mes_referencia: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>Subsídio de alimentação (€)</Label>
              <Input type="number" step="0.01" value={form.valor_subsidio_alimentacao}
                onChange={e => setForm(f => ({ ...f, valor_subsidio_alimentacao: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>Valor por km (€)</Label>
              <Input type="number" step="0.001" value={form.valor_km}
                onChange={e => setForm(f => ({ ...f, valor_km: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>Moeda</Label>
              <Input value={form.moeda}
                onChange={e => setForm(f => ({ ...f, moeda: e.target.value }))} />
            </div>
            <div>
              <Label>Casas decimais</Label>
              <Input type="number" value={form.casas_decimais}
                onChange={e => setForm(f => ({ ...f, casas_decimais: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>Data de início</Label>
              <Input type="date" value={form.data_inicio}
                onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label>Observações</Label>
              <Textarea rows={3} value={form.observacoes}
                onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>Guardar nova versão</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-[520px] overflow-auto">
            {(historico.data ?? []).map(h => (
              <div key={h.id} className={`text-xs border rounded-md p-2 ${h.ativo ? "bg-primary/5 border-primary/40" : ""}`}>
                <div className="flex justify-between font-medium">
                  <span>{fmtDate(h.data_inicio)}</span>
                  <span>{h.ativo ? "Ativa" : "Inativa"}</span>
                </div>
                <div className="text-muted-foreground">
                  SA {Number(h.valor_subsidio_alimentacao).toFixed(2)} € · KM {Number(h.valor_km).toFixed(3)} € · {h.horas_mes_referencia}h
                </div>
                {h.utilizador_nome && <div className="text-muted-foreground">por {h.utilizador_nome}</div>}
              </div>
            ))}
            {!historico.data?.length && <div className="text-muted-foreground text-sm">Sem histórico ainda.</div>}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
