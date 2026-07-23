import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { compareUfcdCodigo } from "@/lib/utils";

/**
 * Painel financeiro simplificado do formando.
 * — Escolhe tipo de bolsa (BF / BFM / nenhuma) e valor mensal.
 * — Escolhe UCs frequentadas por inscrição (as não marcadas ficam como "ausência").
 * Restantes parâmetros (SA, km, IRS/IVA) vêm da Configuração Financeira Global.
 */
export function FormandoFinanceiroPanel({ formandoId }: { formandoId: string }) {
  const cfg = useQuery({
    queryKey: ["fin-config"],
    queryFn: async () => {
      const { data } = await supabase.from("fin_config").select("limite_km_dia, tr_teto_mensal, valor_km, atl_teto_mensal").limit(1).maybeSingle();
      return data;
    },
  });
  const qc = useQueryClient();

  const bolsa = useQuery({
    queryKey: ["fin-bolsa-formando", formandoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fin_bolsa_config").select("*").eq("formando_id", formandoId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const inscricoes = useQuery({
    queryKey: ["fin-inscricoes", formandoId],
    queryFn: async () => {
      const { data, error } = await supabase.from("curso_formandos")
        .select("id, curso:cursos(id, codigo, nome)")
        .eq("formando_id", formandoId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [tipo, setTipo] = useState<string>("nenhuma");
  const [valor, setValor] = useState<number>(0);
  const [elegSa, setElegSa] = useState<boolean>(true);
  const [elegTr, setElegTr] = useState<boolean>(false);
  const [kmDia, setKmDia] = useState<number>(0);
  useEffect(() => {
    if (bolsa.data) {
      setTipo(bolsa.data.tipo);
      setValor(Number(bolsa.data.valor_mensal ?? 0));
      setElegSa(bolsa.data.elegivel_sa ?? true);
      setElegTr(bolsa.data.elegivel_tr ?? false);
      setKmDia(Number(bolsa.data.km_diario ?? 0));
    }
  }, [bolsa.data]);

  const saveBolsa = useMutation({
    mutationFn: async () => {
      const payload = {
        tipo, valor_mensal: valor, elegivel_sa: elegSa, elegivel_tr: elegTr,
        km_diario: kmDia,
      };
      if (bolsa.data?.id) {
        const { error } = await supabase.from("fin_bolsa_config")
          .update(payload as never).eq("id", bolsa.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("fin_bolsa_config")
          .insert({ formando_id: formandoId, ...payload } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fin-bolsa-formando", formandoId] }); toast.success("Bolsa guardada"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Bolsa & elegibilidades</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Tipo de bolsa</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhuma">Sem bolsa</SelectItem>
                <SelectItem value="BF">BF — Bolsa de formação</SelectItem>
                <SelectItem value="BFM">BFM — Bolsa formação mista</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Valor mensal (€)</Label>
            <Input type="number" step="0.01" value={valor} onChange={e => setValor(Number(e.target.value))} disabled={tipo === "nenhuma"} />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Checkbox id="sa" checked={elegSa} onCheckedChange={v => setElegSa(!!v)} />
            <Label htmlFor="sa" className="text-sm">Elegível a Subsídio de Alimentação</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="tr" checked={elegTr} onCheckedChange={v => setElegTr(!!v)} />
            <Label htmlFor="tr" className="text-sm">Elegível a Transporte</Label>
          </div>
          {elegTr && (
            <div className="space-y-1.5">
              <Label>Km diários (ida + volta)</Label>
              <Input type="number" step="0.1" value={kmDia} onChange={e => setKmDia(Number(e.target.value))} />
              <p className="text-[11px] text-muted-foreground">
                Máximo de <strong>{Number((cfg.data as any)?.limite_km_dia ?? 50)} km/dia</strong> aplicado pela Configuração Financeira.
                {Number((cfg.data as any)?.tr_teto_mensal ?? 0) > 0 && (
                  <> Tecto mensal de transporte: <strong>{Number((cfg.data as any)?.tr_teto_mensal).toFixed(2)} €</strong>.</>
                )}
              </p>
            </div>
          )}
          <div><Button onClick={() => saveBolsa.mutate()} disabled={saveBolsa.isPending}>Guardar</Button></div>
          <p className="text-xs text-muted-foreground">Valor por dia de SA e €/km vêm da Configuração Financeira global.</p>
        </CardContent>
      </Card>


      <Card>
        <CardHeader><CardTitle className="text-base">UCs frequentadas por curso</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {(inscricoes.data ?? []).map(i => (
            <UcsPorInscricao key={i.id} inscricaoId={i.id} cursoId={i.curso?.id ?? ""} cursoLabel={`${i.curso?.codigo} — ${i.curso?.nome}`} />
          ))}
          {!inscricoes.data?.length && <div className="text-sm text-muted-foreground">Formando sem inscrições em cursos.</div>}
        </CardContent>
      </Card>
    </div>
  );
}

function UcsPorInscricao({ inscricaoId, cursoId, cursoLabel }: { inscricaoId: string; cursoId: string; cursoLabel: string }) {
  const qc = useQueryClient();
  const ufcds = useQuery({
    queryKey: ["ucs-curso", cursoId],
    enabled: !!cursoId,
    queryFn: async () => {
      const { data, error } = await supabase.from("curso_ufcds")
        .select("id, ufcd:ufcds(codigo, designacao)")
        .eq("curso_id", cursoId);
      if (error) throw error;
      return (data ?? []).sort((a: any, b: any) => compareUfcdCodigo(a.ufcd?.codigo, b.ufcd?.codigo));
    },
  });
  const seleccionadas = useQuery({
    queryKey: ["ucs-seleccionadas", inscricaoId],
    queryFn: async () => {
      const { data, error } = await supabase.from("curso_formando_ufcds")
        .select("curso_ufcd_id").eq("curso_formando_id", inscricaoId);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.curso_ufcd_id));
    },
  });
  const toggle = useMutation({
    mutationFn: async ({ cursoUfcdId, on }: { cursoUfcdId: string; on: boolean }) => {
      if (on) {
        const { error } = await supabase.from("curso_formando_ufcds")
          .insert({ curso_formando_id: inscricaoId, curso_ufcd_id: cursoUfcdId } as never);
        if (error && !String(error.message).includes("duplicate")) throw error;
      } else {
        const { error } = await supabase.from("curso_formando_ufcds")
          .delete().eq("curso_formando_id", inscricaoId).eq("curso_ufcd_id", cursoUfcdId);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ucs-seleccionadas", inscricaoId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="border rounded-md p-3">
      <div className="text-sm font-medium mb-2">{cursoLabel}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {(ufcds.data ?? []).map((cu: any) => {
          const on = seleccionadas.data?.has(cu.id) ?? false;
          return (
            <label key={cu.id} className="flex items-start gap-2 text-xs cursor-pointer">
              <Checkbox checked={on} onCheckedChange={v => toggle.mutate({ cursoUfcdId: cu.id, on: !!v })} />
              <span><span className="font-mono">{cu.ufcd?.codigo}</span> · {cu.ufcd?.designacao}</span>
            </label>
          );
        })}
        {!ufcds.data?.length && <div className="text-xs text-muted-foreground">Curso sem UCs.</div>}
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">
        UCs não marcadas aparecem como <strong>Ausência</strong> nos registos de faltas e não contam para bolsa/subsídios.
      </p>
    </div>
  );
}
