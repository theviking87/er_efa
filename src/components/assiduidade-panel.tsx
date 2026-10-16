import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { calcularAssiduidade } from "@/lib/financeiro/regras";
import { fmtDate } from "@/lib/format";

const ESTADOS_REC: Record<string, string> = {
  em_analise: "Para análise da coordenação",
  em_curso: "Plano em curso",
  concluida: "Recuperação concluída",
  nao_aprovada: "Decisão: não recuperável",
};

/** Assiduidade EFA (90% global / 50% por UFCD) + registo de recuperação pedagógica. Nada é bloqueado automaticamente. */
export function AssiduidadePanel({ formandoId }: { formandoId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["assiduidade-efa", formandoId],
    queryFn: async () => {
      const { data: insc, error } = await supabase
        .from("curso_formandos")
        .select("id, curso_id, curso:cursos(codigo, nome), curso_formando_ufcds(curso_ufcd_id, frequenta)")
        .eq("formando_id", formandoId);
      if (error) throw error;
      const hoje = new Date().toISOString().slice(0, 10);
      const out: any[] = [];
      for (const i of (insc ?? []) as any[]) {
        const [ucsR, sessR, faltR, recR] = await Promise.all([
          supabase.from("curso_ufcds").select("id, ordem, ufcd:ufcds(codigo, designacao)").eq("curso_id", i.curso_id).order("ordem"),
          supabase.from("sessoes").select("id, curso_ufcd_id, horas, estado").eq("curso_id", i.curso_id).lte("data", hoje).range(0, 9999),
          supabase.from("formando_faltas").select("sessao_id, horas, tipo").eq("curso_formando_id", i.id).range(0, 9999),
          supabase.from("recuperacao_pedagogica").select("*").eq("curso_formando_id", i.id).order("created_at"),
        ]);
        const rows = (i.curso_formando_ufcds ?? []) as any[];
        const sel = new Set(rows.filter((r) => r.frequenta !== false).map((r) => r.curso_ufcd_id));
        const aus = new Set(rows.filter((r) => r.frequenta === false).map((r) => r.curso_ufcd_id));
        const ucs = ((ucsR.data ?? []) as any[])
          .filter((u) => (rows.length ? sel.has(u.id) : !aus.has(u.id)))
          .map((u) => ({ curso_ufcd_id: u.id, nome: `${u.ufcd?.codigo ?? ""} ${u.ufcd?.designacao ?? ""}`.trim() }));
        const recs = (recR.data ?? []) as any[];
        const recPorUc = new Map<string, number>();
        recs.filter((r) => r.estado === "concluida" && r.curso_ufcd_id).forEach((r) => recPorUc.set(r.curso_ufcd_id, (recPorUc.get(r.curso_ufcd_id) ?? 0) + Number(r.horas_recuperadas || 0)));
        const a = calcularAssiduidade({ ucs, sessoes: (sessR.data ?? []) as any[], faltas: (faltR.data ?? []) as any[], recuperadasPorUc: recPorUc });
        out.push({ insc: i, a, ucs, recs });
      }
      return out;
    },
  });

  if (q.isLoading) return <div className="text-sm text-muted-foreground py-4">A calcular assiduidade…</div>;
  if (!q.data?.length) return <div className="text-sm text-muted-foreground py-4">Sem inscrições.</div>;

  return (
    <div className="space-y-4">
      {q.data.map(({ insc, a, ucs, recs }) => (
        <Card key={insc.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex flex-wrap items-center gap-2">
              {insc.curso?.codigo} — {insc.curso?.nome}
              <Badge variant={a.cumpre90 ? "secondary" : "destructive"}>Global {a.pctGlobal}% {a.cumpre90 ? "≥ 90%" : "< 90%"}</Badge>
              {a.alerta !== "ok" && <Badge variant="outline">Alerta interno (preventivo): {a.alerta}</Badge>}
              {a.requerAnalise && <Badge variant="destructive">Para análise da coordenação</Badge>}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Horas dadas {a.horasDadas}h · presença {a.presenca}h · faltas just. {a.faltasJust}h · injust. {a.faltasInjust}h · recuperadas {a.recuperadas}h. Online conta como presença; sessões canceladas não contam.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground"><tr className="border-b"><th className="text-left py-1">UFCD</th><th className="text-right">Dadas</th><th className="text-right">F. just.</th><th className="text-right">F. injust.</th><th className="text-right">Recup.</th><th className="text-right">Assiduidade</th></tr></thead>
                <tbody>
                  {a.porUc.filter((u: any) => u.horasDadas > 0).map((u: any) => (
                    <tr key={u.curso_ufcd_id} className="border-b last:border-0">
                      <td className="py-1">{u.nome}</td><td className="text-right">{u.horasDadas}</td><td className="text-right">{u.faltasJust}</td><td className="text-right">{u.faltasInjust}</td><td className="text-right">{u.recuperadas}</td>
                      <td className={`text-right font-medium ${u.cumpre50 ? "" : "text-destructive"}`}>{u.pct}%{!u.cumpre50 && " (< 50%)"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <RecuperacoesBloco cursoFormandoId={insc.id} ucs={ucs} recs={recs} onSaved={() => qc.invalidateQueries({ queryKey: ["assiduidade-efa", formandoId] })} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RecuperacoesBloco({ cursoFormandoId, ucs, recs, onSaved }: { cursoFormandoId: string; ucs: { curso_ufcd_id: string; nome: string }[]; recs: any[]; onSaved: () => void }) {
  const vazio = { id: "", curso_ufcd_id: "", motivo: "", plano: "", responsavel: "", prazo: "", horas_recuperadas: 0, estado: "em_analise", decisao: "" };
  const [f, setF] = useState<any | null>(null);
  async function guardar() {
    const payload = { curso_formando_id: cursoFormandoId, curso_ufcd_id: f.curso_ufcd_id || null, motivo: f.motivo, plano: f.plano || null, responsavel: f.responsavel || null, prazo: f.prazo || null, horas_recuperadas: Number(f.horas_recuperadas) || 0, estado: f.estado, decisao: f.decisao || null };
    const r = f.id ? await supabase.from("recuperacao_pedagogica").update(payload).eq("id", f.id) : await supabase.from("recuperacao_pedagogica").insert(payload);
    if (r.error) return toast.error(r.error.message);
    toast.success("Registo guardado"); setF(null); onSaved();
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Recuperação pedagógica</h4>{!f && <Button size="sm" variant="outline" onClick={() => setF(vazio)}>Novo registo</Button>}</div>
      {recs.length === 0 && !f && <p className="text-xs text-muted-foreground">Sem registos.</p>}
      {recs.map((r) => (
        <div key={r.id} className="rounded-md border p-2 text-xs flex flex-wrap items-center gap-2">
          <Badge variant="outline">{ESTADOS_REC[r.estado] ?? r.estado}</Badge>
          <span>{ucs.find((u) => u.curso_ufcd_id === r.curso_ufcd_id)?.nome ?? "Percurso global"}</span>
          <span className="text-muted-foreground">· {r.horas_recuperadas}h recuperadas{r.prazo ? ` · prazo ${fmtDate(r.prazo)}` : ""} · {r.motivo}</span>
          {r.decisao && <span className="text-muted-foreground">· Decisão: {r.decisao}</span>}
          <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => setF({ ...vazio, ...r, prazo: r.prazo ?? "", plano: r.plano ?? "", responsavel: r.responsavel ?? "", decisao: r.decisao ?? "", curso_ufcd_id: r.curso_ufcd_id ?? "" })}>Editar</Button>
        </div>
      ))}
      {f && (
        <div className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-2">
          <label className="text-xs space-y-1">UFCD<select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={f.curso_ufcd_id} onChange={(e) => setF({ ...f, curso_ufcd_id: e.target.value })}><option value="">Percurso global</option>{ucs.map((u) => <option key={u.curso_ufcd_id} value={u.curso_ufcd_id}>{u.nome}</option>)}</select></label>
          <label className="text-xs space-y-1">Estado<select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>{Object.entries(ESTADOS_REC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="text-xs space-y-1 sm:col-span-2">Motivo / justificação<Input value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} /></label>
          <label className="text-xs space-y-1 sm:col-span-2">Plano (objetivos, atividades, evidências)<Textarea value={f.plano} onChange={(e) => setF({ ...f, plano: e.target.value })} /></label>
          <label className="text-xs space-y-1">Responsável<Input value={f.responsavel} onChange={(e) => setF({ ...f, responsavel: e.target.value })} /></label>
          <label className="text-xs space-y-1">Prazo<Input type="date" value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} /></label>
          <label className="text-xs space-y-1">Horas recuperadas (contam só quando "concluída")<Input type="number" step="0.5" value={f.horas_recuperadas} onChange={(e) => setF({ ...f, horas_recuperadas: e.target.value })} /></label>
          <label className="text-xs space-y-1">Decisão fundamentada<Input value={f.decisao} onChange={(e) => setF({ ...f, decisao: e.target.value })} /></label>
          <div className="flex gap-2 sm:col-span-2 justify-end"><Button size="sm" variant="outline" onClick={() => setF(null)}>Cancelar</Button><Button size="sm" onClick={guardar} disabled={!f.motivo.trim()}>Guardar</Button></div>
        </div>
      )}
    </div>
  );
}
