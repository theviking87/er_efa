import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NotebookPen } from "lucide-react";
import { toast } from "sonner";

/** Bloco de notas do painel — persiste até ser alterado ou apagado. */
export function NotasPainel() {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const nota = useQuery({
    queryKey: ["painel-notas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("painel_notas").select("id, texto, updated_at")
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (error) throw error;
      return data as { id: string; texto: string; updated_at: string } | null;
    },
  });

  useEffect(() => {
    if (!dirty) setTexto(nota.data?.texto ?? "");
  }, [nota.data, dirty]);

  async function guardar(valor: string) {
    setSaving(true);
    try {
      if (nota.data?.id) {
        const { error } = await supabase.from("painel_notas").update({ texto: valor }).eq("id", nota.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("painel_notas").insert({ texto: valor });
        if (error) throw error;
      }
      setDirty(false);
      await qc.invalidateQueries({ queryKey: ["painel-notas"] });
      toast.success("Notas guardadas.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <NotebookPen className="size-4" /> Notas
        </CardTitle>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-muted-foreground">Alterações por guardar</span>}
          <Button size="sm" variant="ghost" disabled={saving || (!texto && !dirty)} onClick={() => { setTexto(""); guardar(""); }}>Apagar</Button>
          <Button size="sm" disabled={saving || !dirty} onClick={() => guardar(texto)}>{saving ? "A guardar…" : "Guardar"}</Button>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          rows={4}
          placeholder="Coisas a não esquecer…"
          value={texto}
          onChange={e => { setTexto(e.target.value); setDirty(true); }}
        />
        {nota.data?.updated_at && !dirty && (
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Última atualização: {new Date(nota.data.updated_at).toLocaleString("pt-PT")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
