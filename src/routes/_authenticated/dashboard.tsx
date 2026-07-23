import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, BookOpen, Users, Calendar, ListChecks, FolderKanban, ClipboardList } from "lucide-react";
import { addDaysIso, fmtDate, fmtHoras, localDateIso } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Painel — Gestão Pedagógica" }] }),
  component: Dashboard,
});

function Dashboard() {
  const counts = useQuery({
    queryKey: ["dashboard-counts"],
    queryFn: async () => {
      const [cursos, formadores, ufcds, projetos, formandos, procs] = await Promise.all([
        supabase.from("cursos").select("id, estado"),
        supabase.from("formadores").select("id, estado, validade_ccp"),
        supabase.from("ufcds").select("id"),
        supabase.from("projetos").select("id, estado, ativo"),
        supabase.from("formandos").select("id"),
        supabase.from("fin_processamento").select("id, total_geral"),
      ]);
      return {
        cursosAtivos: (cursos.data ?? []).filter(c => c.estado === "ativo").length,
        cursosTotal: cursos.data?.length ?? 0,
        formadoresAtivos: (formadores.data ?? []).filter(f => f.estado === "ativo").length,
        formadoresTotal: formadores.data?.length ?? 0,
        ufcdsTotal: ufcds.data?.length ?? 0,
        projetosTotal: projetos.data?.length ?? 0,
        projetosAtivos: (projetos.data ?? []).filter((p: any) => p.ativo && p.estado === "ativo").length,
        formandosTotal: formandos.data?.length ?? 0,
        procsTotal: procs.data?.length ?? 0,
        procsValor: (procs.data ?? []).reduce((s: number, r: any) => s + Number(r.total_geral ?? 0), 0),
        ccpExpirado: (formadores.data ?? []).filter(f => f.validade_ccp && new Date(f.validade_ccp) < new Date()),
        ccpProximoExpirar: (formadores.data ?? []).filter(f => {
          if (!f.validade_ccp) return false;
          const d = new Date(f.validade_ccp);
          const now = new Date();
          const in60 = new Date(); in60.setDate(now.getDate() + 60);
          return d >= now && d <= in60;
        }),
      };
    },
  });

  const proximas = useQuery({
    queryKey: ["dashboard-proximas-sessoes"],
    queryFn: async () => {
      const hoje = localDateIso();
      const lim = addDaysIso(hoje, 7);
      const { data } = await supabase
        .from("sessoes")
        .select("id, data, hora_inicio, hora_fim, horas, formador:formadores(id,nome,abreviatura,cor), curso:cursos(id,nome,codigo), curso_ufcd:curso_ufcds(id, ufcd:ufcds(codigo, designacao))")
        .gte("data", hoje).lte("data", lim)
        .order("data", { ascending: true }).order("hora_inicio", { ascending: true })
        .limit(10);
      return data ?? [];
    },
  });

  const faltasAlerta = useQuery({
    queryKey: ["dashboard-faltas-limite"],
    queryFn: async () => {
      const { data: faltas } = await supabase
        .from("formando_faltas")
        .select("horas, sessao:sessoes(curso_ufcd_id), curso_formando:curso_formandos(id, formando:formandos(nome), curso:cursos(id, codigo, nome))");
      const { data: ucs } = await supabase
        .from("curso_ufcds")
        .select("id, horas_totais, ufcd:ufcds(codigo, designacao)");
      const ucMap = new Map((ucs ?? []).map((u: any) => [u.id, u]));
      // agrupar por (curso_formando_id, curso_ufcd_id)
      const agg = new Map<string, { horas: number; cf: any; uc: any }>();
      for (const f of (faltas ?? []) as any[]) {
        const ucId = f.sessao?.curso_ufcd_id;
        if (!ucId || !f.curso_formando) continue;
        const uc = ucMap.get(ucId);
        if (!uc) continue;
        const key = `${f.curso_formando.id}::${ucId}`;
        const cur = agg.get(key) ?? { horas: 0, cf: f.curso_formando, uc };
        cur.horas += Number(f.horas ?? 0);
        agg.set(key, cur);
      }
      const rows = Array.from(agg.values())
        .map(r => {
          const total = Number(r.uc.horas_totais ?? 0);
          const pct = total > 0 ? (r.horas / total) * 100 : 0;
          return { ...r, total, pct };
        })
        .filter(r => r.pct >= 8)
        .sort((a, b) => b.pct - a.pct);
      return rows;
    },
  });

  return (
    <PageContainer>
      <PageHeader title="Painel" description="Visão geral da atividade. Apenas o essencial." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Stat label="Projetos ativos" value={counts.data?.projetosAtivos ?? 0} total={counts.data?.projetosTotal} icon={FolderKanban} href="/projetos" />
        <Stat label="Cursos ativos" value={counts.data?.cursosAtivos ?? 0} total={counts.data?.cursosTotal} icon={BookOpen} href="/cursos" />
        <Stat label="Formadores ativos" value={counts.data?.formadoresAtivos ?? 0} total={counts.data?.formadoresTotal} icon={Users} href="/formadores" />
        <Stat label="Formandos" value={counts.data?.formandosTotal ?? 0} icon={Users} href="/formandos" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="UFCD no catálogo" value={counts.data?.ufcdsTotal ?? 0} icon={ListChecks} href="/ufcds" />
        <Stat label="Processamentos" value={counts.data?.procsTotal ?? 0} icon={ClipboardList} href="/financeiro/processamentos" />
        <Stat label="Valor processado (€)" value={(counts.data?.procsValor ?? 0).toFixed(2)} icon={ClipboardList} href="/financeiro/processamentos" />
        <Stat label="Próximas 7 dias" value={proximas.data?.length ?? 0} icon={Calendar} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Próximas sessões</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {proximas.isLoading && <div className="px-6 py-10 text-sm text-muted-foreground">A carregar…</div>}
            {!proximas.isLoading && (proximas.data?.length ?? 0) === 0 && (
              <div className="px-6 py-10 text-sm text-muted-foreground">Sem sessões nos próximos 7 dias.</div>
            )}
            <ul className="divide-y divide-border">
              {(proximas.data ?? []).map((s: any) => (
                <li key={s.id} className="px-6 py-3 flex items-center gap-4 text-sm">
                  <div className="w-16 shrink-0 text-xs">
                    <div className="font-medium">{fmtDate(s.data)}</div>
                    <div className="text-muted-foreground">{s.hora_inicio?.slice(0,5)}–{s.hora_fim?.slice(0,5)}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{s.curso_ufcd?.ufcd?.codigo} · {s.curso_ufcd?.ufcd?.designacao}</div>
                    <div className="text-xs text-muted-foreground truncate">{s.curso?.codigo} — {s.curso?.nome}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-block size-2 rounded-full" style={{ background: s.formador?.cor ?? "#999" }} />
                    <span className="text-xs">{s.formador?.nome}</span>
                  </div>
                  <div className="w-14 text-right text-xs text-muted-foreground">{fmtHoras(s.horas)}</div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2"><AlertTriangle className="size-4 text-warning" /> Alertas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {faltasAlerta.data?.length ? (
              <Alert
                tone={faltasAlerta.data.some(r => r.pct >= 10) ? "destructive" : "warning"}
                title={`${faltasAlerta.data.length} formando(s) com faltas ≥ 8% numa UC`}
              >
                <ul className="text-xs space-y-0.5 max-h-48 overflow-auto">
                  {faltasAlerta.data.slice(0, 10).map((r, i) => (
                    <li key={i} className={r.pct >= 10 ? "text-destructive" : ""}>
                      · {r.cf.formando?.nome} — {r.uc.ufcd?.codigo} ({r.horas.toFixed(1)}h / {r.total}h · <strong>{r.pct.toFixed(1)}%</strong>)
                      <span className="text-muted-foreground"> · {r.cf.curso?.codigo}</span>
                    </li>
                  ))}
                </ul>
              </Alert>
            ) : null}
            {counts.data?.ccpExpirado?.length ? (
              <Alert tone="destructive" title={`${counts.data.ccpExpirado.length} CCP expirados`}>
                <ul className="text-xs space-y-0.5">
                  {counts.data.ccpExpirado.slice(0,5).map(f => <li key={f.id}>· {(f as any).nome ?? f.id} ({fmtDate(f.validade_ccp)})</li>)}
                </ul>
              </Alert>
            ) : null}
            {counts.data?.ccpProximoExpirar?.length ? (
              <Alert tone="warning" title={`${counts.data.ccpProximoExpirar.length} CCP a expirar em 60 dias`} />
            ) : null}
            {!counts.data?.ccpExpirado?.length && !counts.data?.ccpProximoExpirar?.length && (
              <div className="text-xs text-muted-foreground">Sem alertas críticos.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

function Stat({ label, value, total, icon: Icon, href }: { label: string; value: number | string; total?: number; icon: any; href?: string }) {
  const inner = (
    <Card className="hover:border-foreground/30 transition-colors">
      <CardContent className="p-4 flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-semibold tracking-tight mt-1">
            {value}{total !== undefined ? <span className="text-sm text-muted-foreground font-normal"> / {total}</span> : null}
          </div>
        </div>
        <Icon className="size-4 text-muted-foreground" />
      </CardContent>
    </Card>
  );
  return href ? <Link to={href as any}>{inner}</Link> : inner;
}

function Alert({ tone, title, children }: { tone: "warning" | "destructive"; title: string; children?: React.ReactNode }) {
  const toneCls = tone === "destructive"
    ? "border-destructive/30 bg-destructive/5"
    : "border-warning/40 bg-warning/10";
  return (
    <div className={`rounded-md border px-3 py-2 ${toneCls}`}>
      <div className="text-xs font-medium">{title}</div>
      {children && <div className="mt-1 text-muted-foreground">{children}</div>}
    </div>
  );
}
