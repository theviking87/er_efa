import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { listarRubricas } from "@/lib/financeiro/services/rubricas";
import { listarRegras, criarRegra, atualizarRegra, eliminarRegra } from "@/lib/financeiro/services/rubricas";
import type { FinRubricaRegra } from "@/lib/financeiro/types";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/financeiro/regras")({
  head: () => ({ meta: [{ title: "Financeiro — Regras" }] }),
  component: RegrasPage,
});

function RegrasPage() {
  const qc = useQueryClient();
  const rubs = useQuery({ queryKey: ["fin-rubricas"], queryFn: listarRubricas });
  const [rubricaId, setRubricaId] = useState<string>("");
  const rubAtiva = rubs.data?.find(r => r.id === rubricaId) ?? rubs.data?.[0];
  const ativo = rubAtiva?.id ?? "";

  const regras = useQuery({
    queryKey: ["fin-regras", ativo],
    queryFn: () => (ativo ? listarRegras(ativo) : Promise.resolve([])),
    enabled: !!ativo,
  });

  const [form, setForm] = useState<Partial<FinRubricaRegra>>({
    valor_unitario: 0, valor_maximo: null, horas_referencia: null, dias_minimos: null,
    permite_limite: false, permite_edicao_manual: true, ativo: true,
    data_inicio: new Date().toISOString().slice(0, 10), data_fim: null, observacoes: "",
  });

  const create = useMutation({
    mutationFn: () => criarRegra({ ...(form as any), rubrica_id: ativo }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fin-regras", ativo] }); toast.success("Regra criada"); },
    onError: (e: any) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: ({ id, patch, antes }: { id: string; patch: Partial<FinRubricaRegra>; antes: FinRubricaRegra }) => atualizarRegra(id, patch, antes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fin-regras", ativo] }),
    onError: (e: any) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: ({ id, antes }: { id: string; antes: FinRubricaRegra }) => eliminarRegra(id, antes),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fin-regras", ativo] }); toast.success("Regra eliminada"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <PageContainer>
      <PageHeader title="Regras das Rubricas" description="Valores, limites e períodos de vigência por rubrica." />

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Selecionar rubrica</CardTitle></CardHeader>
        <CardContent>
          <select className="border rounded-md h-9 px-3 text-sm bg-background w-full sm:w-80"
            value={ativo}
            onChange={e => setRubricaId(e.target.value)}>
            {(rubs.data ?? []).map(r => (
              <option key={r.id} value={r.id}>{r.codigo} — {r.descricao}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      {ativo && (
        <>
          <Card className="mb-6">
            <CardHeader><CardTitle className="text-base">Nova regra</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-4">
              <div><Label>Valor unitário</Label><Input type="number" step="0.01" value={(form.valor_unitario as any) ?? ""} onChange={e => setForm(f => ({ ...f, valor_unitario: Number(e.target.value) }))} /></div>
              <div><Label>Valor máximo</Label><Input type="number" step="0.01" value={(form.valor_maximo as any) ?? ""} onChange={e => setForm(f => ({ ...f, valor_maximo: e.target.value === "" ? null : Number(e.target.value) }))} /></div>
              <div><Label>Horas de referência</Label><Input type="number" value={(form.horas_referencia as any) ?? ""} onChange={e => setForm(f => ({ ...f, horas_referencia: e.target.value === "" ? null : Number(e.target.value) }))} /></div>
              <div><Label>Dias mínimos</Label><Input type="number" value={(form.dias_minimos as any) ?? ""} onChange={e => setForm(f => ({ ...f, dias_minimos: e.target.value === "" ? null : Number(e.target.value) }))} /></div>
              <div><Label>Data início</Label><Input type="date" value={form.data_inicio ?? ""} onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))} /></div>
              <div><Label>Data fim</Label><Input type="date" value={form.data_fim ?? ""} onChange={e => setForm(f => ({ ...f, data_fim: e.target.value || null }))} /></div>
              <div className="flex items-center gap-2"><Switch checked={!!form.permite_limite} onCheckedChange={v => setForm(f => ({ ...f, permite_limite: v }))} /><Label>Permite limite</Label></div>
              <div className="flex items-center gap-2"><Switch checked={!!form.permite_edicao_manual} onCheckedChange={v => setForm(f => ({ ...f, permite_edicao_manual: v }))} /><Label>Edição manual</Label></div>
              <div className="sm:col-span-4"><Label>Observações</Label><Textarea rows={2} value={form.observacoes ?? ""} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} /></div>
              <div className="sm:col-span-4"><Button onClick={() => create.mutate()}><Plus className="size-4" /> Criar regra</Button></div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {(regras.data ?? []).map(r => (
              <Card key={r.id}>
                <CardContent className="grid gap-3 sm:grid-cols-8 items-center py-4 text-sm">
                  <div>Início <div className="font-medium">{fmtDate(r.data_inicio)}</div></div>
                  <div>Fim <div className="font-medium">{r.data_fim ? fmtDate(r.data_fim) : "—"}</div></div>
                  <div>Valor <div className="font-medium">{r.valor_unitario != null ? Number(r.valor_unitario).toFixed(2) : "—"}</div></div>
                  <div>Máx. <div className="font-medium">{r.valor_maximo != null ? Number(r.valor_maximo).toFixed(2) : "—"}</div></div>
                  <div>Horas <div className="font-medium">{r.horas_referencia ?? "—"}</div></div>
                  <div>Dias mín. <div className="font-medium">{r.dias_minimos ?? "—"}</div></div>
                  <div className="flex items-center gap-2"><Switch checked={r.ativo} onCheckedChange={v => update.mutate({ id: r.id, patch: { ativo: v }, antes: r })} /><span className="text-xs">Ativa</span></div>
                  <div className="flex justify-end">
                    <Button variant="ghost" size="icon" onClick={() => confirm("Eliminar regra?") && remove.mutate({ id: r.id, antes: r })}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {!regras.data?.length && <div className="text-muted-foreground text-sm">Sem regras para esta rubrica.</div>}
          </div>
        </>
      )}
    </PageContainer>
  );
}
