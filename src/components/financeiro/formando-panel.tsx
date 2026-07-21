import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { listarRubricas } from "@/lib/financeiro/services/rubricas";
import { listarRubricasDoFormando, upsertRubricaFormando } from "@/lib/financeiro/services/formando-rubricas";

// Categorias configuráveis por formando: apenas elegibilidade.
// Valores, limites e IBAN são definidos globalmente no módulo Financeiro.
const CATEGORIAS_ELEGIVEIS = new Set(["Bolsa", "Subsídio", "Deslocação"]);

export function FinanceiroFormandoPanel({ formandoId }: { formandoId: string }) {
  const qc = useQueryClient();
  const rubs = useQuery({ queryKey: ["fin-rubricas"], queryFn: listarRubricas });
  const cfgs = useQuery({
    queryKey: ["fin-formando-rubricas", formandoId],
    queryFn: () => listarRubricasDoFormando(formandoId),
  });

  const toggle = useMutation({
    mutationFn: async ({ rubricaId, elegivel }: { rubricaId: string; elegivel: boolean }) => {
      const existente = cfgs.data?.find(x => x.rubrica_id === rubricaId);
      return upsertRubricaFormando({
        ...(existente ?? {}),
        formando_id: formandoId,
        rubrica_id: rubricaId,
        elegivel,
        valor_especifico: null,
        limite_especifico: null,
        iban: existente?.iban ?? null,
        data_inicio: existente?.data_inicio ?? null,
        data_fim: existente?.data_fim ?? null,
        observacoes: existente?.observacoes ?? null,
      } as any);
    },
    onSuccess: () => {
      toast.success("Rubrica atualizada");
      qc.invalidateQueries({ queryKey: ["fin-formando-rubricas", formandoId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (rubs.isLoading || cfgs.isLoading) return <div className="text-muted-foreground">A carregar…</div>;

  const rubricas = (rubs.data ?? []).filter(r => r.ativo && CATEGORIAS_ELEGIVEIS.has(r.categoria as string));

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Seleciona apenas as rubricas a que este formando tem direito. Os valores e limites são definidos no módulo Financeiro.
      </p>
      {rubricas.map(r => {
        const cur = cfgs.data?.find(x => x.rubrica_id === r.id);
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
                  checked={cur?.elegivel ?? false}
                  disabled={toggle.isPending}
                  onCheckedChange={v => toggle.mutate({ rubricaId: r.id, elegivel: v })}
                />
              </div>
            </CardHeader>
            <CardContent className="pt-0 pb-3 text-xs text-muted-foreground">
              Configuração de valores em <b>Financeiro → Rubricas / Regras</b>.
            </CardContent>
          </Card>
        );
      })}
      {!rubricas.length && <div className="text-muted-foreground text-sm">Sem rubricas configuráveis.</div>}
    </div>
  );
}
