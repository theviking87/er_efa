import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const CHAVE = "lucro-valor-recebido";

/** Cartão de lucro: valor recebido efetivamente e % face ao valor processado. */
export function LucroCard({ processado }: { processado: number }) {
  const qc = useQueryClient();
  const [valor, setValor] = useState("");
  const [dirty, setDirty] = useState(false);

  const nota = useQuery({
    queryKey: ["painel-notas", CHAVE],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("painel_notas").select("id, texto")
        .eq("chave", CHAVE)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (error) throw error;
      return data as { id: string; texto: string } | null;
    },
  });

  useEffect(() => {
    if (!dirty) setValor(nota.data?.texto ?? "");
  }, [nota.data, dirty]);

  async function guardar() {
    setDirty(false);
    if (nota.data?.id) {
      await supabase.from("painel_notas").update({ texto: valor }).eq("id", nota.data.id);
    } else {
      await supabase.from("painel_notas").insert({ texto: valor, chave: CHAVE });
    }
    await qc.invalidateQueries({ queryKey: ["painel-notas", CHAVE] });
  }

  const recebido = Number(String(valor).replace(",", ".")) || 0;
  const pct = processado > 0 ? (recebido / processado) * 100 : 0;

  return (
    <Card className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20">
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">€ Lucro</div>
        <Input
          inputMode="decimal"
          placeholder="0,00"
          className="mt-1 h-8 tabular-nums text-lg font-semibold"
          value={valor}
          onChange={e => { setValor(e.target.value); setDirty(true); }}
          onBlur={() => { if (dirty) guardar(); }}
        />
        <div className="mt-1 text-xs text-muted-foreground tabular-nums">
          {pct.toFixed(1)}% de {processado.toFixed(2)} €
        </div>
      </CardContent>
    </Card>
  );
}
