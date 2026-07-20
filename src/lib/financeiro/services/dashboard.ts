// Agrega dados para a dashboard financeira sem qualquer lógica de negócio nova.
import { supabase } from "@/integrations/supabase/client";

async function sum(table: string, col: string) {
  const { data, error } = await (supabase as any).from(table).select(col);
  if (error) throw error;
  return (data ?? []).reduce((acc: number, r: any) => acc + Number(r[col] ?? 0), 0);
}

export type DashboardTotais = {
  bolsas: number;
  subsidios: number;
  km: number;
  honorarios: number;
  geral: number;
  processamentosAbertos: number;
  processamentosValidados: number;
  rubricasAtivas: number;
};

export async function obterTotaisDashboard(): Promise<DashboardTotais> {
  const [bolsas, subsidios, km, honor, procs, rubs] = await Promise.all([
    sum("financeiro_bolsas", "valor_final").catch(() => 0),
    sum("financeiro_subsidios", "total").catch(() => 0),
    sum("financeiro_quilometros", "total").catch(() => 0),
    sum("financeiro_honorarios", "total").catch(() => 0),
    (supabase as any).from("financeiro_processamentos").select("id, estado"),
    (supabase as any).from("fin_rubricas").select("id, ativo"),
  ]);

  const procList = (procs?.data ?? []) as any[];
  const rubList = (rubs?.data ?? []) as any[];

  return {
    bolsas, subsidios, km, honorarios: honor,
    geral: bolsas + subsidios + km + honor,
    processamentosAbertos: procList.filter(p => p.estado === "aberto").length,
    processamentosValidados: procList.filter(p => p.estado === "validado").length,
    rubricasAtivas: rubList.filter(r => r.ativo).length,
  };
}
