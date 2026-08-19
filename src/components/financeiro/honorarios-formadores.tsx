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
  const [overrides, setOverrides] = useState<Record<string, { semRet: boolean; retPct: number; aplicaIva: boolean; ivaPct: number }>>({});

  // Um formador pode ter várias linhas (várias UFCDs); agrupamos por formador.
  const grupos = useMemo(() => {
    const m = new Map<string, { formador: any; horas: number; valorHora: number; valor: number; lineIds: string[]; recibo: boolean }>();
    for (const l of linhas) {
      if (l.rubrica !== "HN" || !l.formador_id) continue;
      const fid = l.formador_id as string;
      const g = m.get(fid) ?? { formador: l.formador, horas: 0, valorHora: Number(l.valor_hora ?? 0), valor: 0, lineIds: [] as string[], recibo: false };
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

  function currentTax(g: any) {
    const f = g?.formador ?? {};
    const base = {
      semRet: true,
      retPct: Number(f.retencao_percentagem ?? 23),
      aplicaIva: false,
      ivaPct: Number(f.iva_percentagem ?? 23),
    };
    return overrides[g?.fid] ?? base;
  }

  function updateTax(fid: string, patch: Partial<{ semRet: boolean; retPct: number; aplicaIva: boolean; ivaPct: number }>) {
    setOverrides(prev => {
      const g = grupos.find(x => x.fid === fid);
      const cur = prev[fid] ?? currentTax(g);
      return { ...prev, [fid]: { ...cur, ...patch } };
    });
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

  return (
    <Table>
      <TableHeader><TableRow>
        <TableHead>Formador</TableHead>
        <TableHead className="text-right">Horas</TableHead>
        <TableHead className="text-right">€/h</TableHead>
        <TableHead className="text-right">Valor (€)</TableHead>
        <TableHead className="text-center w-44">Retenção IRS</TableHead>
        <TableHead className="text-center w-40">IVA</TableHead>
        <TableHead className="text-right w-28">Total (€)</TableHead>
        <TableHead className="text-center w-28">Recibo</TableHead>
        <TableHead className="text-right w-32"></TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {grupos.map(g => {
          const t = currentTax(g);
          const f = g.formador ?? {};
          const base = g.valor;
          const valIva = t.aplicaIva ? base * (t.ivaPct / 100) : 0;
          const valIrs = t.semRet ? 0 : base * (t.retPct / 100);
          const totalPagar = base + valIva - valIrs;
          return (
            <TableRow key={g.fid} className={g.recibo ? "bg-emerald-500/5" : undefined}>
              <TableCell className="font-medium">{f.nome ?? "—"}{f.nif ? <span className="text-xs text-muted-foreground ml-2">NIF {f.nif}</span> : null}</TableCell>
              <TableCell className="text-right tabular-nums">{g.horas.toFixed(1)}</TableCell>
              <TableCell className="text-right tabular-nums">{g.valorHora.toFixed(2)}</TableCell>
              <TableCell className="text-right tabular-nums font-semibold">{base.toFixed(2)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5 justify-center">
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" className="size-3.5" checked={!t.semRet}
                      onChange={e => updateTax(g.fid, { semRet: !e.target.checked })} />
                    Faz
                  </label>
                  <Input type="number" step="0.01" min="0" max="100" className="h-7 w-16 text-right"
                    disabled={t.semRet} value={t.semRet ? 0 : t.retPct}
                    onChange={e => updateTax(g.fid, { retPct: Number(e.target.value) })} />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                {!t.semRet && (
                  <div className="text-[11px] text-right text-destructive tabular-nums mt-1">− {valIrs.toFixed(2)} €</div>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5 justify-center">
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" className="size-3.5" checked={t.aplicaIva}
                      onChange={e => updateTax(g.fid, { aplicaIva: e.target.checked })} />
                    Aplica
                  </label>
                  <Input type="number" step="0.01" min="0" max="100" className="h-7 w-16 text-right"
                    disabled={!t.aplicaIva} value={t.aplicaIva ? t.ivaPct : 0}
                    onChange={e => updateTax(g.fid, { ivaPct: Number(e.target.value) })} />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                {t.aplicaIva && (
                  <div className="text-[11px] text-right text-muted-foreground tabular-nums mt-1">+ {valIva.toFixed(2)} €</div>
                )}
              </TableCell>
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
