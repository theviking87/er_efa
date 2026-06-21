import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";

type Estado = "presente" | "justificada" | "injustificada";

export function PresencasDialog({
  open, onOpenChange, sessao,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessao: { id: string; curso_id: string; data: string; horas: number; hora_inicio: string; hora_fim: string } | null;
}) {
  const qc = useQueryClient();

  const inscritos = useQuery({
    queryKey: ["presencas-inscritos", sessao?.curso_id],
    enabled: !!sessao && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("curso_formandos")
        .select("id, estado, formando:formandos(id, nome)")
        .eq("curso_id", sessao!.curso_id)
        .in("estado", ["inscrito", "em_formacao"]);
      if (error) throw error;
      return (data ?? []).filter((i: any) => i.formando);
    },
  });

  const faltas = useQuery({
    queryKey: ["presencas-faltas", sessao?.id],
    enabled: !!sessao && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formando_faltas")
        .select("id, curso_formando_id, tipo, horas, observacoes")
        .eq("sessao_id", sessao!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [obs, setObs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !inscritos.data || !faltas.data) return;
    const e: Record<string, Estado> = {};
    const o: Record<string, string> = {};
    for (const i of inscritos.data) {
      const f = faltas.data.find((x: any) => x.curso_formando_id === i.id);
      e[i.id] = (f?.tipo as Estado) ?? "presente";
      o[i.id] = f?.observacoes ?? "";
    }
    setEstados(e);
    setObs(o);
  }, [open, inscritos.data, faltas.data]);

  async function save() {
    if (!sessao) return;
    setSaving(true);
    try {
      const existentes = new Map((faltas.data ?? []).map((f: any) => [f.curso_formando_id, f]));
      const aInserir: any[] = [];
      const aAtualizar: { id: string; tipo: Estado; observacoes: string }[] = [];
      const aRemover: string[] = [];

      for (const i of inscritos.data ?? []) {
        const estado = estados[i.id] ?? "presente";
        const obsTxt = (obs[i.id] ?? "").trim();
        const ex: any = existentes.get(i.id);
        if (estado === "presente") {
          if (ex) aRemover.push(ex.id);
        } else {
          if (ex) {
            if (ex.tipo !== estado || (ex.observacoes ?? "") !== obsTxt) {
              aAtualizar.push({ id: ex.id, tipo: estado, observacoes: obsTxt });
            }
          } else {
            aInserir.push({
              curso_formando_id: i.id,
              sessao_id: sessao.id,
              data: sessao.data,
              horas: sessao.horas,
              tipo: estado,
              observacoes: obsTxt || null,
            });
          }
        }
      }

      if (aRemover.length) {
        const { error } = await supabase.from("formando_faltas").delete().in("id", aRemover);
        if (error) throw error;
      }
      for (const u of aAtualizar) {
        const { error } = await supabase.from("formando_faltas")
          .update({ tipo: u.tipo, observacoes: u.observacoes || null } as never)
          .eq("id", u.id);
        if (error) throw error;
      }
      if (aInserir.length) {
        const { error } = await supabase.from("formando_faltas").insert(aInserir as never);
        if (error) throw error;
      }

      toast.success("Presenças guardadas");
      qc.invalidateQueries({ queryKey: ["presencas-faltas", sessao.id] });
      qc.invalidateQueries({ queryKey: ["presencas-count", sessao.curso_id] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Erro a guardar", { description: e.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Presenças</DialogTitle>
          {sessao && (
            <div className="text-xs text-muted-foreground">
              {fmtDate(sessao.data)} · {sessao.hora_inicio?.slice(0, 5)}–{sessao.hora_fim?.slice(0, 5)} · {sessao.horas}h
            </div>
          )}
        </DialogHeader>

        {(inscritos.isLoading || faltas.isLoading) && <div className="text-sm text-muted-foreground py-6 text-center">A carregar…</div>}
        {!inscritos.isLoading && (inscritos.data?.length ?? 0) === 0 && (
          <div className="text-sm text-muted-foreground py-6 text-center">Sem formandos ativos inscritos neste curso.</div>
        )}

        {(inscritos.data?.length ?? 0) > 0 && (
          <div className="max-h-[55vh] overflow-y-auto -mx-6 px-6">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground sticky top-0 bg-background">
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">Formando</th>
                  <th className="text-center py-2 font-medium w-[90px]">Presente</th>
                  <th className="text-center py-2 font-medium w-[110px]">Falta just.</th>
                  <th className="text-center py-2 font-medium w-[110px]">Falta injust.</th>
                  <th className="text-left py-2 font-medium w-[200px]">Observações</th>
                </tr>
              </thead>
              <tbody>
                {(inscritos.data ?? []).map((i: any) => {
                  const estado = estados[i.id] ?? "presente";
                  return (
                    <tr key={i.id} className="border-b last:border-0">
                      <td className="py-2 pr-2">{i.formando.nome}</td>
                      {(["presente", "justificada", "injustificada"] as Estado[]).map(e => (
                        <td key={e} className="text-center">
                          <input
                            type="radio"
                            name={`p-${i.id}`}
                            checked={estado === e}
                            onChange={() => setEstados(s => ({ ...s, [i.id]: e }))}
                          />
                        </td>
                      ))}
                      <td className="py-1">
                        <Input
                          value={obs[i.id] ?? ""}
                          onChange={ev => setObs(s => ({ ...s, [i.id]: ev.target.value }))}
                          placeholder="—"
                          className="h-8 text-xs"
                          disabled={estado === "presente"}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving || (inscritos.data?.length ?? 0) === 0}>
            {saving ? "A guardar…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
