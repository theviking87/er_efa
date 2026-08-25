import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { exportNotaHonorariosPdf } from "@/lib/pdf-exports";

type Empresa = { nome?: string | null; nif?: string | null; morada?: string | null } | null;

export function HonorariosFormadores({
  linhas, ano, mes, cursoId, cursoNome, cursoCodigo, empresa, invalidateKey,
}: {
  linhas: any[];
  ano: number;
  mes: number;
  cursoId?: string | null;
  cursoNome?: string;
  cursoCodigo?: string;
  empresa: Empresa;
  invalidateKey: unknown[];
}) {
  const qc = useQueryClient();
  const [gerandoId, setGerandoId] = useState<string | null>(null);

  // Um formador pode ter várias linhas (várias UFCDs); agrupamos por formador.
  const grupos = useMemo(() => {
    const m = new Map<string, { formador: any; horas: number; valorHora: number; valor: number; lineIds: string[]; recibo: boolean; mc: any }>();
    for (const l of linhas) {
      if (l.rubrica !== "HN" || !l.formador_id) continue;
      const fid = l.formador_id as string;
      const g = m.get(fid) ?? { formador: l.formador, horas: 0, valorHora: Number(l.valor_hora ?? 0), valor: 0, lineIds: [] as string[], recibo: false, mc: l.memoria_calculo ?? {} };
      g.horas += Number(l.horas_frequentadas ?? 0);
      g.valor += Number(l.valor ?? 0);
      g.lineIds.push(l.id);
      if (l.recibo_confirmado) g.recibo = true;
      if (!g.valorHora) g.valorHora = Number(l.valor_hora ?? 0);
      m.set(fid, g);
    }
    return Array.from(m.entries()).map(([fid, g]) => ({ fid, ...g }))
      .sort((a, b) => (a.formador?.nome ?? "").localeCompare(b.formador?.nome ?? "", "pt"));
  }, [linhas]);

  const reciboMut = useMutation({
    mutationFn: async ({ ids, valor }: { ids: string[]; valor: boolean }) => {
      const { error } = await supabase.from("fin_processamento_linha")
        .update({ recibo_confirmado: valor } as never).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: invalidateKey }),
    onError: (e: any) => toast.error(e.message ?? "Erro a guardar recibo."),
  });

  const taxMut = useMutation({
    mutationFn: async ({ ids, mc }: { ids: string[]; mc: Record<string, unknown> }) => {
      const { error } = await supabase.from("fin_processamento_linha")
        .update({ memoria_calculo: mc } as never).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: invalidateKey }),
    onError: (e: any) => toast.error(e.message ?? "Erro a guardar IVA/IRS."),
  });

  function currentTax(g: any) {
    const f = g?.formador ?? {};
    const mc = g?.mc ?? {};
    return {
      semRet: !(mc.aplica_retencao === true),
      retPct: Number(mc.retencao_pct ?? f.retencao_percentagem ?? 23),
      aplicaIva: mc.aplica_iva === true,
      ivaPct: Number(mc.iva_pct ?? f.iva_percentagem ?? 23),
      aplicaSelo: mc.aplica_selo === true,
      seloPct: Number(mc.selo_pct ?? 4),
    };
  }

  function updateTax(fid: string, patch: Partial<{ semRet: boolean; retPct: number; aplicaIva: boolean; ivaPct: number; aplicaSelo: boolean; seloPct: number }>) {
    const g = grupos.find(x => x.fid === fid);
    if (!g) return;
    const cur = currentTax(g);
    const next = { ...cur, ...patch };
    const mc = {
      ...(g.mc ?? {}),
      aplica_iva: next.aplicaIva,
      iva_pct: next.aplicaIva ? next.ivaPct : null,
      aplica_retencao: !next.semRet,
      retencao_pct: !next.semRet ? next.retPct : null,
      aplica_selo: next.aplicaSelo,
      selo_pct: next.aplicaSelo ? next.seloPct : null,
    };
    taxMut.mutate({ ids: g.lineIds, mc });
  }


  async function emitir(g: any) {
    if (!g.formador) { toast.error("Sem dados do formador."); return; }
    setGerandoId(g.fid);
    try {
      const f = g.formador;
      const t = currentTax(g);
      await exportNotaHonorariosPdf({
        modo: "mes",
        formadorId: f.id ?? g.fid,
        ano, mes,
        cursoId: cursoId ?? null,
        valorHora: g.valorHora,
        retencaoIrs: t.semRet ? 0 : t.retPct,
        aplicarIva: t.aplicaIva,
        iva: t.aplicaIva ? t.ivaPct : 0,
        destinatario: empresa ? { nome: empresa.nome ?? undefined, nif: empresa.nif ?? undefined, morada: empresa.morada ?? undefined } : undefined,
        observacoes: `Curso: ${cursoNome ?? cursoCodigo ?? ""}`,
      });
      toast.success("Nota de honorários gerada.");
    } catch (e: any) {
      toast.error(e.message ?? "Erro a gerar PDF.");
    } finally {
      setGerandoId(null);
    }
  }

  if (!grupos.length) return <div className="p-6 text-center text-sm text-muted-foreground">Sem formadores neste processamento.</div>;

  const taxCtrl = (cfg: {
    checked: boolean; onToggle: (v: boolean) => void; pct: number; onPct: (v: number) => void;
    val: number; sign: "+" | "−"; active: boolean;
  }) => (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        <input type="checkbox" title="Aplicar" className="size-3.5 shrink-0" checked={cfg.checked}
          onChange={e => cfg.onToggle(e.target.checked)} />
        <Input type="number" step="0.01" min="0" max="100" className="h-7 w-14 text-right text-xs px-1"
          disabled={!cfg.checked} value={cfg.checked ? cfg.pct : 0}
          onChange={e => cfg.onPct(Number(e.target.value))} />
        <span className="text-xs text-muted-foreground shrink-0">%</span>
      </div>
      {cfg.active && (
        <span className={`text-[10px] tabular-nums whitespace-nowrap ${cfg.sign === "+" ? "text-emerald-600" : "text-destructive"}`}>
          {cfg.sign} {cfg.val.toFixed(2)} €
        </span>
      )}
    </div>
  );

  return (
    <Table>
      <TableHeader><TableRow>
        <TableHead className="min-w-[220px]">Formador</TableHead>
        <TableHead className="text-right w-16">Horas</TableHead>
        <TableHead className="text-right w-20">€/h</TableHead>
        <TableHead className="text-right w-28">Valor ilíquido</TableHead>
        <TableHead className="text-center w-28">IVA</TableHead>
        <TableHead className="text-center w-28">Imp. Selo</TableHead>
        <TableHead className="text-right w-28">Total documento</TableHead>
        <TableHead className="text-center w-28">Retenção IRS</TableHead>
        <TableHead className="text-right w-28">Total a pagar</TableHead>
        <TableHead className="text-center w-24">Recibo</TableHead>
        <TableHead className="w-28"></TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {grupos.map(g => {
          const t = currentTax(g);
          const f = g.formador ?? {};
          const base = g.valor;
          const valIva = t.aplicaIva ? base * (t.ivaPct / 100) : 0;
          const valSelo = t.aplicaSelo ? base * (t.seloPct / 100) : 0;
          const totalDoc = base + valIva + valSelo;
          const valIrs = t.semRet ? 0 : base * (t.retPct / 100);
          const totalPagar = totalDoc - valIrs;
          return (
            <TableRow key={g.fid} className={g.recibo ? "bg-emerald-500/5" : undefined}>
              <TableCell className="font-medium whitespace-nowrap">
                <div className="truncate max-w-[260px]">{f.nome ?? "—"}</div>
                {f.nif ? <div className="text-xs text-muted-foreground">NIF {f.nif}</div> : null}
              </TableCell>
              <TableCell className="text-right tabular-nums">{g.horas.toFixed(1)}</TableCell>
              <TableCell className="text-right tabular-nums">{g.valorHora.toFixed(2)}</TableCell>
              <TableCell className="text-right tabular-nums font-semibold">{base.toFixed(2)}</TableCell>
              <TableCell className="bg-blue-500/5">{taxCtrl({
                checked: t.aplicaIva, onToggle: v => updateTax(g.fid, { aplicaIva: v }),
                pct: t.ivaPct, onPct: v => updateTax(g.fid, { ivaPct: v }),
                val: valIva, sign: "+", active: t.aplicaIva,
              })}</TableCell>
              <TableCell>{taxCtrl({
                checked: t.aplicaSelo, onToggle: v => updateTax(g.fid, { aplicaSelo: v }),
                pct: t.seloPct, onPct: v => updateTax(g.fid, { seloPct: v }),
                val: valSelo, sign: "+", active: t.aplicaSelo,
              })}</TableCell>
              <TableCell className="text-right tabular-nums font-medium">{totalDoc.toFixed(2)}</TableCell>
              <TableCell className="bg-red-500/5">{taxCtrl({
                checked: !t.semRet, onToggle: v => updateTax(g.fid, { semRet: !v }),
                pct: t.retPct, onPct: v => updateTax(g.fid, { retPct: v }),
                val: valIrs, sign: "−", active: !t.semRet,
              })}</TableCell>
              <TableCell className="text-right tabular-nums font-semibold">{totalPagar.toFixed(2)}</TableCell>
              <TableCell className="text-center">
                <label className="flex items-center gap-1.5 justify-center text-xs">
                  <Checkbox checked={g.recibo} disabled={reciboMut.isPending}
                    onCheckedChange={(v) => reciboMut.mutate({ ids: g.lineIds, valor: v === true })} />
                  <span className={g.recibo ? "text-emerald-600 font-medium" : "text-muted-foreground"}>
                    {g.recibo ? "Confirmado" : "Pendente"}
                  </span>
                </label>
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" onClick={() => emitir(g)} disabled={gerandoId === g.fid}>
                  <FileText className="size-4" />{gerandoId === g.fid ? "…" : "Emitir PDF"}
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

