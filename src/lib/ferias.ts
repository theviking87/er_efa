import { supabase } from "@/integrations/supabase/client";

/**
 * Remove um único dia de férias de um curso.
 * Se o dia estiver no meio de um intervalo, o intervalo é dividido em dois.
 */
function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export async function removerDiaFerias(cursoId: string, iso: string) {
  const { data, error } = await supabase
    .from("curso_ferias" as any)
    .select("id, curso_id, data_inicio, data_fim, motivo")
    .eq("curso_id", cursoId)
    .lte("data_inicio", iso)
    .gte("data_fim", iso);
  if (error) throw error;

  const linhas = (data ?? []) as any[];
  if (!linhas.length) return 0;

  for (const f of linhas) {
    const ini = String(f.data_inicio).slice(0, 10);
    const fim = String(f.data_fim).slice(0, 10);

    if (ini === iso && fim === iso) {
      const { error: e } = await supabase.from("curso_ferias" as any).delete().eq("id", f.id);
      if (e) throw e;
    } else if (ini === iso) {
      const { error: e } = await supabase
        .from("curso_ferias" as any)
        .update({ data_inicio: addDaysISO(iso, 1) })
        .eq("id", f.id);
      if (e) throw e;
    } else if (fim === iso) {
      const { error: e } = await supabase
        .from("curso_ferias" as any)
        .update({ data_fim: addDaysISO(iso, -1) })
        .eq("id", f.id);
      if (e) throw e;
    } else {
      // dia no meio → encurta o registo e cria a segunda metade
      const { error: e1 } = await supabase
        .from("curso_ferias" as any)
        .update({ data_fim: addDaysISO(iso, -1) })
        .eq("id", f.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("curso_ferias" as any).insert({
        curso_id: f.curso_id,
        data_inicio: addDaysISO(iso, 1),
        data_fim: fim,
        motivo: f.motivo ?? null,
      } as any);
      if (e2) throw e2;
    }
  }
  return linhas.length;
}
