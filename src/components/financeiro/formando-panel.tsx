import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { listarRubricas } from "@/lib/financeiro/services/rubricas";
import { listarRubricasDoFormando, upsertRubricaFormando } from "@/lib/financeiro/services/formando-rubricas";
import type { FinFormandoRubrica } from "@/lib/financeiro/types";

export function FinanceiroFormandoPanel({ formandoId }: { formandoId: string }) {
  const qc = useQueryClient();
  const rubs = useQuery({ queryKey: ["fin-rubricas"], queryFn: listarRubricas });
  const cfgs = useQuery({
    queryKey: ["fin-formando-rubricas", formandoId],
    queryFn: () => listarRubricasDoFormando(formandoId),
  });

  const [drafts, setDrafts] = useState<Record<string, Partial<FinFormandoRubrica>>>({});

  const save = useMutation({
    mutationFn: async (rubricaId: string) => {
      const existente = cfgs.data?.find(x => x.rubrica_id === rubricaId);
      const draft = drafts[rubricaId] ?? {};
      const payload: any = {
        ...existente,
        ...draft,
        formando_id: formandoId,
        rubrica_id: rubricaId,
      };
      // limpar campos numéricos vazios
      ["valor_especifico", "limite_especifico"].forEach(k => {
        if (payload[k] === "" || payload[k] === undefined) payload[k] = null;
        else if (payload[k] !== null) payload[k] = Number(payload[k]);
      });
      return upsertRubricaFormando(payload);
    },
    onSuccess: () => {
      toast.success("Rubrica atualizada");
      qc.invalidateQueries({ queryKey: ["fin-formando-rubricas", formandoId] });
      setDrafts({});
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (rubs.isLoading || cfgs.isLoading) return <div className="text-muted-foreground">A carregar…</div>;

  return (
    <div className="space-y-3">
      {(rubs.data ?? []).filter(r => r.ativo).map(r => {
        const cur = cfgs.data?.find(x => x.rubrica_id === r.id);
        const d = drafts[r.id] ?? {};
        const merged: any = { ...cur, ...d };
        return (
          <Card key={r.id}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm">{r.codigo} — {r.descricao}</CardTitle>
                <div className="text-xs text-muted-foreground">{r.categoria}</div>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Elegível</Label>
                <Switch
                  checked={merged.elegivel ?? false}
                  onCheckedChange={v => setDrafts(s => ({ ...s, [r.id]: { ...s[r.id], elegivel: v } }))}
                />
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label className="text-xs">Valor específico</Label>
                <Input type="number" step="0.01" value={merged.valor_especifico ?? ""} onChange={e => setDrafts(s => ({ ...s, [r.id]: { ...s[r.id], valor_especifico: e.target.value as any } }))} />
              </div>
              <div>
                <Label className="text-xs">Limite mensal</Label>
                <Input type="number" step="0.01" value={merged.limite_especifico ?? ""} onChange={e => setDrafts(s => ({ ...s, [r.id]: { ...s[r.id], limite_especifico: e.target.value as any } }))} />
              </div>
              <div>
                <Label className="text-xs">IBAN (opcional)</Label>
                <Input value={merged.iban ?? ""} onChange={e => setDrafts(s => ({ ...s, [r.id]: { ...s[r.id], iban: e.target.value } }))} />
              </div>
              <div className="flex items-end">
                <Button size="sm" onClick={() => save.mutate(r.id)} disabled={save.isPending}>Guardar</Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {!rubs.data?.length && <div className="text-muted-foreground text-sm">Ainda não existem rubricas configuradas.</div>}
    </div>
  );
}
