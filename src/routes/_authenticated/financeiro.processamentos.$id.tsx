import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { FileSpreadsheet, Lock, LockOpen, Trash2 } from "lucide-react";
import { exportProcessamentoExcel } from "@/lib/financeiro/excel";

export const Route = createFileRoute("/_authenticated/financeiro/processamentos/$id")({
  head: () => ({ meta: [{ title: "Financeiro — Detalhe do processamento" }] }),
  component: DetailPage,
});

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function DetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const proc = useQuery({
    queryKey: ["fin-proc", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("fin_processamento")
        .select("*, curso:curso_id(codigo, nome)").eq("id", id).single();
      if (error) throw error; return data;
    },
  });

  const linhas = useQuery({
    queryKey: ["fin-proc-linhas", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("fin_processamento_linha")
        .select("*, formando:formando_id(nome), formador:formador_id(nome)")
        .eq("processamento_id", id);
      if (error) throw error; return data ?? [];
    },
  });

  const cfg = useQuery({
    queryKey: ["fin-config"],
    queryFn: async () => (await supabase.from("fin_config").select("*").limit(1).maybeSingle()).data,
  });

  const toggleEstado = useMutation({
    mutationFn: async (novo: "rascunho" | "fechado") => {
      const { error } = await supabase.from("fin_processamento")
        .update({ estado: novo, fechado_em: novo === "fechado" ? new Date().toISOString() : null } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fin-proc", id] }); toast.success("Estado atualizado."); },
    onError: (e: any) => toast.error(e.message),
  });

  const eliminar = useMutation({
    mutationFn: async () => {
      await supabase.from("fin_processamento_linha").delete().eq("processamento_id", id);
      const { error } = await supabase.from("fin_processamento").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Eliminado."); window.location.href = "/financeiro/processamentos"; },
    onError: (e: any) => toast.error(e.message),
  });

  async function exportar() {
    if (!proc.data || !linhas.data) return;
    const fmds = linhas.data.filter((l: any) => l.formando_id).map((l: any) => ({
      nome: l.formando?.nome ?? "—", rubrica: l.rubrica,
      horas_previstas: Number(l.horas_previstas ?? 0), horas_frequentadas: Number(l.horas_frequentadas ?? 0),
      dias_elegiveis: Number(l.dias_elegiveis ?? 0), valor: Number(l.valor ?? 0),
    }));
    const fdrs = linhas.data.filter((l: any) => l.formador_id).map((l: any) => ({
      nome: l.formador?.nome ?? "—", horas_frequentadas: Number(l.horas_frequentadas ?? 0),
      valor_hora: Number(l.valor_hora ?? 0), valor: Number(l.valor ?? 0),
    }));
    await exportProcessamentoExcel({
      ano: proc.data.ano, mes: proc.data.mes, curso: proc.data.curso,
      totais: {
        BF: Number(proc.data.total_bf), BFM: Number(proc.data.total_bfm),
        SA: Number(proc.data.total_sa), TR: Number(proc.data.total_tr),
        HN: Number(proc.data.total_hn), geral: Number(proc.data.total_geral),
      },
      formandos: fmds, formadores: fdrs,
      empresa: cfg.data ? { nome: cfg.data.empresa_nome, nif: cfg.data.empresa_nif, morada: cfg.data.empresa_morada } : null,
      logoEmpresaUrl: cfg.data?.logo_empresa_url ?? null,
      logoDgertUrl: cfg.data?.logo_dgert_url ?? null,
      logoPessoas2030Url: cfg.data?.logo_pessoas2030_url ?? null,
    });
  }

  if (proc.isLoading) return <PageContainer><div className="text-sm text-muted-foreground">A carregar…</div></PageContainer>;
  if (!proc.data) return <PageContainer><div className="text-sm">Processamento não encontrado.</div></PageContainer>;

  const p = proc.data as any;
  const fechado = p.estado === "fechado";
  const fmds = (linhas.data ?? []).filter((l: any) => l.formando_id);
  const fdrs = (linhas.data ?? []).filter((l: any) => l.formador_id);

  return (
    <PageContainer>
      <PageHeader
        title={`${MESES[p.mes-1]} / ${p.ano}`}
        description={`${p.curso?.codigo} — ${p.curso?.nome}`}
        actions={
          <div className="flex gap-2 items-center">
            <Badge variant={fechado ? "default" : "secondary"}>{p.estado}</Badge>
            <Button variant="outline" onClick={exportar}><FileSpreadsheet className="size-4" />Excel</Button>
            {fechado ? (
              <Button variant="outline" onClick={() => toggleEstado.mutate("rascunho")}><LockOpen className="size-4" />Reabrir</Button>
            ) : (
              <Button onClick={() => toggleEstado.mutate("fechado")}><Lock className="size-4" />Fechar</Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="destructive" size="icon"><Trash2 className="size-4" /></Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Eliminar processamento?</AlertDialogTitle>
                  <AlertDialogDescription>Esta ação é irreversível.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => eliminar.mutate()}>Eliminar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button asChild variant="ghost"><Link to="/financeiro/processamentos">Voltar</Link></Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-6 mb-4">
        <Stat label="BF" v={p.total_bf} /><Stat label="BFM" v={p.total_bfm} />
        <Stat label="SA" v={p.total_sa} /><Stat label="TR" v={p.total_tr} />
        <Stat label="HN" v={p.total_hn} /><Stat label="Total" v={p.total_geral} strong />
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-3"><CardTitle className="text-base">Formandos</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Formando</TableHead><TableHead>Rubrica</TableHead>
              <TableHead className="text-right">H. prev.</TableHead><TableHead className="text-right">H. freq.</TableHead>
              <TableHead className="text-right">Dias</TableHead><TableHead className="text-right">Valor (€)</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {fmds.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell>{l.formando?.nome}</TableCell>
                  <TableCell><Badge variant="secondary">{l.rubrica}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{Number(l.horas_previstas).toFixed(1)}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(l.horas_frequentadas).toFixed(1)}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.dias_elegiveis}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{Number(l.valor).toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {!fmds.length && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Sem linhas.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Honorários — Formadores</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Formador</TableHead>
              <TableHead className="text-right">Horas</TableHead>
              <TableHead className="text-right">€/h</TableHead>
              <TableHead className="text-right">Valor (€)</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {fdrs.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell>{l.formador?.nome}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(l.horas_frequentadas).toFixed(1)}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(l.valor_hora).toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{Number(l.valor).toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {!fdrs.length && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">Sem linhas.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <errorComp />
    </PageContainer>
  );
}

function errorComp() { return null; }

function Stat({ label, v, strong }: { label: string; v: number; strong?: boolean }) {
  return (
    <Card><CardContent className="p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 tabular-nums ${strong ? "text-lg font-semibold" : "text-base font-medium"}`}>{Number(v ?? 0).toFixed(2)} €</div>
    </CardContent></Card>
  );
}
