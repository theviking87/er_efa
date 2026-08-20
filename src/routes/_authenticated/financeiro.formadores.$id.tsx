import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, RefreshCw, Lock, LockOpen } from "lucide-react";
import { NotasPainel } from "@/components/notas-painel";
import { calcularProcessamento, guardarProcessamento } from "@/lib/financeiro/engine";
import { HonorariosFormadores } from "@/components/financeiro/honorarios-formadores";

export const Route = createFileRoute("/_authenticated/financeiro/formadores/$id")({
  head: () => ({ meta: [{ title: "Financeiro — Processamento de formadores" }] }),
  component: ProcFormadorDetalhe,
});

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function ProcFormadorDetalhe() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const proc = useQuery({
    queryKey: ["fin-proc", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("fin_processamento")
        .select("*, curso:curso_id(codigo, nome)").eq("id", id).single();
      if (error) throw error; return data as any;
    },
  });

  const linhas = useQuery({
    queryKey: ["fin-proc-linhas-formadores", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("fin_processamento_linha")
        .select("*, formador:formador_id(id, nome, nif, morada, codigo_postal, localidade, sem_retencao, retencao_percentagem, aplica_iva, iva_percentagem)")
        .eq("processamento_id", id);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const cfg = useQuery({
    queryKey: ["fin-config"],
    queryFn: async () => (await supabase.from("fin_config").select("*").limit(1).maybeSingle()).data,
  });

  const honorarios = useMemo(() => {
    const m = new Map<string, { fid: string; nome: string; nif: string | null; horas: number; valorHora: number; valor: number; ids: string[]; recibo: boolean }>();
    for (const l of (linhas.data ?? [])) {
      if (l.rubrica !== "HN" || !l.formador_id) continue;
      const g = m.get(l.formador_id) ?? {
        fid: l.formador_id, nome: l.formador?.nome ?? "—", nif: l.formador?.nif ?? null,
        horas: 0, valorHora: Number(l.valor_hora ?? 0), valor: 0, ids: [] as string[], recibo: false,
      };
      g.horas += Number(l.horas_frequentadas ?? 0);
      g.valor += Number(l.valor ?? 0);
      g.ids.push(l.id);
      if (!g.valorHora) g.valorHora = Number(l.valor_hora ?? 0);
      if (l.recibo_confirmado) g.recibo = true;
      m.set(l.formador_id, g);
    }
    return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
  }, [linhas.data]);

  const extras = useMemo(
    () => (linhas.data ?? []).filter(l => l.rubrica === "OUT")
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
    [linhas.data],
  );

  const toggleEstado = useMutation({
    mutationFn: async (novo: "rascunho" | "fechado") => {
      const { error } = await supabase.from("fin_processamento")
        .update({ estado: novo, fechado_em: novo === "fechado" ? new Date().toISOString() : null } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-proc", id] });
      qc.invalidateQueries({ queryKey: ["fin-procs-formadores"] });
      toast.success("Estado atualizado.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const recalcular = useMutation({
    mutationFn: async () => {
      const p: any = proc.data;
      if (!p) throw new Error("Sem processamento.");
      if (p.estado === "fechado") throw new Error("Processamento fechado — reabre antes de recalcular.");
      const preview = await calcularProcessamento(p.curso_id, p.ano, p.mes);
      await guardarProcessamento(preview, p.projeto_id ?? null);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-proc", id] });
      qc.invalidateQueries({ queryKey: ["fin-proc-linhas-formadores", id] });
      qc.invalidateQueries({ queryKey: ["fin-procs-formadores"] });
      toast.success("Processamento recalculado.");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro a recalcular."),
  });

  const [desc, setDesc] = useState("");
  const [valor, setValor] = useState("");

  const addExtra = useMutation({
    mutationFn: async () => {
      const v = Number(valor.replace(",", "."));
      if (!desc.trim()) throw new Error("Indica a descrição da despesa.");
      if (!Number.isFinite(v) || v === 0) throw new Error("Indica um valor válido.");
      const { error } = await supabase.from("fin_processamento_linha").insert({
        processamento_id: id, rubrica: "OUT", valor: v,
        memoria_calculo: { descricao: desc.trim(), origem: "manual" },
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setDesc(""); setValor("");
      qc.invalidateQueries({ queryKey: ["fin-proc-linhas-formadores", id] });
      qc.invalidateQueries({ queryKey: ["fin-procs-formadores"] });
      toast.success("Despesa adicionada.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const delExtra = useMutation({
    mutationFn: async (linhaId: string) => {
      const { error } = await supabase.from("fin_processamento_linha").delete().eq("id", linhaId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-proc-linhas-formadores", id] });
      qc.invalidateQueries({ queryKey: ["fin-procs-formadores"] });
      toast.success("Despesa removida.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (proc.isLoading) return <PageContainer><div className="text-sm text-muted-foreground">A carregar…</div></PageContainer>;
  if (!proc.data) return <PageContainer><div className="text-sm">Processamento não encontrado.</div></PageContainer>;

  const p = proc.data;
  const fechado = p.estado === "fechado";
  const totalHn = honorarios.reduce((s, g) => s + g.valor, 0);
  const totalOut = extras.reduce((s, l) => s + Number(l.valor ?? 0), 0);
  const total = totalHn + totalOut;

  return (
    <PageContainer>
      <PageHeader
        title={`${MESES[p.mes-1]} / ${p.ano}`}
        description={`${p.curso?.codigo} — ${p.curso?.nome}`}
        actions={
          <div className="flex gap-2 items-center">
            <Badge variant={fechado ? "default" : "secondary"}>{p.estado}</Badge>
            {!fechado && (
              <Button variant="outline" onClick={() => recalcular.mutate()} disabled={recalcular.isPending}>
                <RefreshCw className="size-4" />{recalcular.isPending ? "A recalcular…" : "Recalcular"}
              </Button>
            )}
            {fechado ? (
              <Button variant="outline" onClick={() => toggleEstado.mutate("rascunho")} disabled={toggleEstado.isPending}>
                <LockOpen className="size-4" />Reabrir
              </Button>
            ) : (
              <Button onClick={() => toggleEstado.mutate("fechado")} disabled={toggleEstado.isPending}>
                <Lock className="size-4" />Fechar
              </Button>
            )}
            <Button asChild variant="ghost"><Link to="/financeiro/formadores">Voltar</Link></Button>
          </div>
        }
      />



      <div className="grid gap-3 sm:grid-cols-4 mb-4">
        <Stat label="Honorários (HN)" v={totalHn} />
        <Stat label="Outras despesas" v={totalOut} />
        <Stat label="Total" v={total} strong />
        <Card className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Lucro (40%)</div>
            <div className="mt-1 tabular-nums text-lg font-semibold">{(total * 0.4).toFixed(2)} €</div>
          </CardContent>
        </Card>
      </div>

      <NotasPainel chave={`processamento-formadores:${p.id}`} titulo="Notas deste mês" placeholder="Notas sobre honorários e despesas deste mês…" />

      <Card className="mb-4">
        <CardHeader className="pb-3"><CardTitle className="text-base">Notas de Honorários — Formadores</CardTitle></CardHeader>
        <CardContent className="p-0">
          <HonorariosFormadores
            linhas={(linhas.data ?? [])}
            ano={p.ano}
            mes={p.mes}
            cursoId={p.curso_id}
            cursoNome={p.curso?.nome}
            cursoCodigo={p.curso?.codigo}
            empresa={cfg.data ? { nome: (cfg.data as any).empresa_nome, nif: (cfg.data as any).empresa_nif, morada: (cfg.data as any).empresa_morada } : null}
            invalidateKey={["fin-proc-linhas-formadores", id]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Outras despesas</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {extras.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem despesas adicionais neste mês.</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right w-32">Valor (€)</TableHead>
                <TableHead className="w-12" />
              </TableRow></TableHeader>
              <TableBody>
                {extras.map(l => (
                  <TableRow key={l.id}>
                    <TableCell>{(l.memoria_calculo as any)?.descricao ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{Number(l.valor ?? 0).toFixed(2)}</TableCell>
                    <TableCell>
                      {!fechado && (
                        <Button size="icon" variant="ghost" onClick={() => delExtra.mutate(l.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {!fechado && (
            <div className="grid gap-3 sm:grid-cols-[1fr_9rem_auto] items-end border-t pt-4">
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ex.: deslocações, material…" />
              </div>
              <div className="space-y-1.5">
                <Label>Valor (€)</Label>
                <Input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" className="text-right" />
              </div>
              <Button onClick={() => addExtra.mutate()} disabled={addExtra.isPending}>
                <Plus className="size-4" />Adicionar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function Stat({ label, v, strong }: { label: string; v: number; strong?: boolean }) {
  return (
    <Card><CardContent className="p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 tabular-nums ${strong ? "text-lg font-semibold" : "text-sm font-medium"}`}>{v.toFixed(2)} €</div>
    </CardContent></Card>
  );
}
