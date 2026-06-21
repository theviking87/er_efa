import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Trash2, Plus, ChevronLeft, ChevronRight, Printer, FileSpreadsheet } from "lucide-react";
import { exportSigoCurso, exportFaltasCurso } from "@/lib/exports";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ESTADO_CURSO_LABEL, TIPOLOGIA_LABEL, fmtDate, fmtHoras, diffHoras, MONTH_NAMES,
  INSCRICAO_ESTADO_LABEL, FALTA_TIPO_LABEL,
} from "@/lib/format";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/cursos/$id")({
  head: () => ({ meta: [{ title: "Curso — Gestão Pedagógica" }] }),
  component: CursoDetail,
});

function CursoDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const curso = useQuery({
    queryKey: ["curso", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("cursos").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const remove = async () => {
    const { error } = await supabase.from("cursos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Curso eliminado");
    qc.invalidateQueries({ queryKey: ["cursos"] });
    navigate({ to: "/cursos" });
  };

  if (curso.isLoading) return <PageContainer><div className="text-muted-foreground">A carregar…</div></PageContainer>;
  if (!curso.data) return <PageContainer><div className="text-muted-foreground">Curso não encontrado.</div></PageContainer>;

  const c = curso.data;

  return (
    <PageContainer>
      <div className="mb-4">
        <Link to="/cursos" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
          <ArrowLeft className="size-3.5" /> Cursos
        </Link>
      </div>
      <PageHeader
        title={c.nome}
        description={`${c.codigo} · ${TIPOLOGIA_LABEL[c.tipologia]} · ${ESTADO_CURSO_LABEL[c.estado]}`}
        actions={
          <>
            <Button variant="outline" onClick={() => exportSigoCurso(id).then(() => toast.success("Exportado")).catch(e => toast.error(e.message))}>
              <FileSpreadsheet className="size-4" /> SIGO
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="outline" className="text-destructive hover:text-destructive"><Trash2 className="size-4" /> Eliminar</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Eliminar curso?</AlertDialogTitle><AlertDialogDescription>Esta ação remove também todas as UFCD atribuídas e sessões.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={remove}>Eliminar</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        }
      />

      <Tabs defaultValue="ufcds">
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="ufcds">UFCD</TabsTrigger>
          <TabsTrigger value="formandos">Formandos</TabsTrigger>
          <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
          <TabsTrigger value="faltas">Faltas</TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <Card><CardContent className="p-6 grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <Field label="Código" value={c.codigo} />
            <Field label="Tipologia" value={TIPOLOGIA_LABEL[c.tipologia]} />
            <Field label="Início" value={fmtDate(c.data_inicio)} />
            <Field label="Fim" value={fmtDate(c.data_fim)} />
            <Field label="Estado" value={ESTADO_CURSO_LABEL[c.estado]} />
            <div className="sm:col-span-2"><Field label="Observações" value={c.observacoes} /></div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="ufcds">
          <UfcdsTab cursoId={id} />
        </TabsContent>

        <TabsContent value="formandos">
          <FormandosTab cursoId={id} />
        </TabsContent>

        <TabsContent value="cronograma">
          <CronogramaTab cursoId={id} cursoNome={c.nome} cursoCodigo={c.codigo} />
        </TabsContent>

        <TabsContent value="faltas">
          <FaltasTab cursoId={id} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

// ---------------- UFCD TAB ----------------
function UfcdsTab({ cursoId }: { cursoId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const data = useQuery({
    queryKey: ["curso-ufcds", cursoId],
    queryFn: async () => {
      const [cu, sess] = await Promise.all([
        supabase.from("curso_ufcds")
          .select("id, horas_totais, ordem, concluida, ufcd:ufcds(id, codigo, designacao, horas_referencia), formadores:curso_ufcd_formadores(formador:formadores(id, nome, cor))")
          .eq("curso_id", cursoId).order("ordem"),
        supabase.from("sessoes").select("curso_ufcd_id, horas").eq("curso_id", cursoId),
      ]);
      if (cu.error) throw cu.error;
      const horasRealizadasMap = new Map<string, number>();
      (sess.data ?? []).forEach((s: any) => {
        horasRealizadasMap.set(s.curso_ufcd_id, (horasRealizadasMap.get(s.curso_ufcd_id) ?? 0) + Number(s.horas));
      });
      return (cu.data ?? []).map((u: any) => ({
        ...u,
        horas_realizadas: horasRealizadasMap.get(u.id) ?? 0,
      }));
    },
  });

  async function del(id: string) {
    const { error } = await supabase.from("curso_ufcds").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["curso-ufcds", cursoId] });
  }

  async function toggleConcluida(u: any) {
    await supabase.from("curso_ufcds").update({ concluida: !u.concluida }).eq("id", u.id);
    qc.invalidateQueries({ queryKey: ["curso-ufcds", cursoId] });
  }

  return (
    <Card><CardContent className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">{data.data?.length ?? 0} UFCD atribuídas</div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" /> Atribuir UFCD</Button>
      </div>
      {(data.data?.length ?? 0) === 0 && <div className="text-sm text-muted-foreground text-center py-8">Sem UFCD atribuídas. Atribua a primeira.</div>}
      <div className="space-y-2">
        {(data.data ?? []).map((u: any) => {
          const pct = u.horas_totais > 0 ? Math.min(100, (u.horas_realizadas / u.horas_totais) * 100) : 0;
          const emFalta = Math.max(0, u.horas_totais - u.horas_realizadas);
          return (
            <div key={u.id} className="border rounded-md p-3">
              <div className="flex items-start gap-3">
                <Checkbox checked={u.concluida} onCheckedChange={() => toggleConcluida(u)} className="mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground">{u.ufcd.codigo}</span>
                    <span className="font-medium">{u.ufcd.designacao}</span>
                    {u.concluida && <Badge variant="secondary" className="text-[10px]">Concluída</Badge>}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{fmtHoras(u.horas_realizadas)} / {u.horas_totais} h</span>
                    {emFalta > 0 && <span>· {fmtHoras(emFalta)} em falta</span>}
                  </div>
                  <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-foreground transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {u.formadores.length === 0 && <span className="text-xs text-muted-foreground italic">Sem formador atribuído</span>}
                    {u.formadores.map((ff: any) => (
                      <span key={ff.formador.id} className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-muted">
                        <span className="size-1.5 rounded-full" style={{ background: ff.formador.cor }} />
                        {ff.formador.nome}
                      </span>
                    ))}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => del(u.id)}><Trash2 className="size-3.5" /></Button>
              </div>
            </div>
          );
        })}
      </div>
      <AtribuirUfcdDialog open={open} onOpenChange={setOpen} cursoId={cursoId} onSaved={() => qc.invalidateQueries({ queryKey: ["curso-ufcds", cursoId] })} />
    </CardContent></Card>
  );
}

function AtribuirUfcdDialog({ open, onOpenChange, cursoId, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; cursoId: string; onSaved: () => void }) {
  const [ufcdId, setUfcdId] = useState("");
  const [horas, setHoras] = useState(25);
  const [formadores, setFormadores] = useState<string[]>([]);

  const ufcds = useQuery({ queryKey: ["ufcds"], queryFn: async () => (await supabase.from("ufcds").select("*").order("codigo")).data ?? [] });
  const formadoresList = useQuery({ queryKey: ["formadores-ativos"], queryFn: async () => (await supabase.from("formadores").select("id, nome, cor, estado").eq("estado","ativo").order("nome")).data ?? [] });

  async function save() {
    if (!ufcdId) return toast.error("Escolha uma UFCD");
    const { data, error } = await supabase.from("curso_ufcds").insert({ curso_id: cursoId, ufcd_id: ufcdId, horas_totais: horas } as never).select().single();
    if (error) return toast.error(error.message);
    if (formadores.length) {
      const cu = data as any;
      await supabase.from("curso_ufcd_formadores").insert(formadores.map(fid => ({ curso_ufcd_id: cu.id, formador_id: fid })) as never);
    }
    toast.success("UFCD atribuída");
    onOpenChange(false);
    setUfcdId(""); setHoras(25); setFormadores([]);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Atribuir UFCD ao curso</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>UFCD *</Label>
            <Select value={ufcdId} onValueChange={(v) => { setUfcdId(v); const u = (ufcds.data ?? []).find((x: any) => x.id === v); if (u) setHoras((u as any).horas_referencia); }}>
              <SelectTrigger><SelectValue placeholder="Escolher…" /></SelectTrigger>
              <SelectContent>{(ufcds.data ?? []).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.codigo} — {u.designacao}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Horas totais</Label><Input type="number" min={1} value={horas} onChange={e => setHoras(Number(e.target.value))} /></div>
          <div className="space-y-1.5">
            <Label>Formadores</Label>
            <div className="border rounded-md max-h-40 overflow-y-auto p-2 space-y-1">
              {(formadoresList.data ?? []).length === 0 && <div className="text-xs text-muted-foreground px-1">Sem formadores ativos.</div>}
              {(formadoresList.data ?? []).map((f: any) => (
                <label key={f.id} className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-muted cursor-pointer">
                  <Checkbox checked={formadores.includes(f.id)} onCheckedChange={(c) => setFormadores(c ? [...formadores, f.id] : formadores.filter(x => x !== f.id))} />
                  <span className="size-2 rounded-full" style={{ background: f.cor }} />
                  {f.nome}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save}>Atribuir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- CRONOGRAMA TAB ----------------
function CronogramaTab({ cursoId, cursoNome, cursoCodigo }: { cursoId: string; cursoNome: string; cursoCodigo: string }) {
  const qc = useQueryClient();
  const [mes, setMes] = useState(() => { const d = new Date(); return { ano: d.getFullYear(), mes: d.getMonth() }; });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogData, setDialogData] = useState<string | null>(null);

  const inicioMes = new Date(mes.ano, mes.mes, 1).toISOString().slice(0, 10);
  const fimMes = new Date(mes.ano, mes.mes + 1, 0).toISOString().slice(0, 10);

  const sessoes = useQuery({
    queryKey: ["sessoes", cursoId, inicioMes, fimMes],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessoes")
        .select("id, data, hora_inicio, hora_fim, horas, formador:formadores(id,nome,cor), curso_ufcd:curso_ufcds(id, ufcd:ufcds(codigo, designacao))")
        .eq("curso_id", cursoId).gte("data", inicioMes).lte("data", fimMes)
        .order("data").order("hora_inicio");
      if (error) throw error;
      return data ?? [];
    },
  });

  const sessoesByDay = useMemo(() => {
    const m = new Map<string, any[]>();
    (sessoes.data ?? []).forEach((s: any) => {
      const arr = m.get(s.data) ?? [];
      arr.push(s); m.set(s.data, arr);
    });
    return m;
  }, [sessoes.data]);

  // Build calendar grid (Mon first)
  const grid = useMemo(() => {
    const first = new Date(mes.ano, mes.mes, 1);
    const last = new Date(mes.ano, mes.mes + 1, 0);
    const startDow = (first.getDay() + 6) % 7; // 0=Mon
    const days: ({ d: number; iso: string } | null)[] = [];
    for (let i = 0; i < startDow; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) {
      const iso = new Date(mes.ano, mes.mes, d).toISOString().slice(0, 10);
      days.push({ d, iso });
    }
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [mes]);

  function prev() { setMes(m => m.mes === 0 ? { ano: m.ano - 1, mes: 11 } : { ano: m.ano, mes: m.mes - 1 }); }
  function next() { setMes(m => m.mes === 11 ? { ano: m.ano + 1, mes: 0 } : { ano: m.ano, mes: m.mes + 1 }); }

  return (
    <Card><CardContent className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prev}><ChevronLeft className="size-4" /></Button>
          <div className="font-semibold text-lg min-w-[170px] text-center">{MONTH_NAMES[mes.mes]} {mes.ano}</div>
          <Button variant="outline" size="icon" onClick={next}><ChevronRight className="size-4" /></Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="size-4" /> Imprimir</Button>
          <Button size="sm" onClick={() => { setDialogData(null); setDialogOpen(true); }}><Plus className="size-4" /> Nova sessão</Button>
        </div>
      </div>

      <div id="cronograma-print" className="border rounded-md overflow-hidden bg-card">
        <div className="hidden print:block px-4 py-3 border-b">
          <div className="text-xs text-muted-foreground">{cursoCodigo}</div>
          <div className="font-semibold">{cursoNome} · Cronograma {MONTH_NAMES[mes.mes]} {mes.ano}</div>
        </div>
        <div className="grid grid-cols-7 bg-muted/40 text-xs uppercase text-muted-foreground">
          {["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map(d => <div key={d} className="px-2 py-1.5 text-center font-medium">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 auto-rows-[minmax(110px,auto)]">
          {grid.map((cell, i) => (
            <div key={i} className="border-t border-l border-border first:border-l-0 [&:nth-child(7n+1)]:border-l-0 p-1.5 min-h-[110px] bg-card">
              {cell && (
                <>
                  <button onClick={() => { setDialogData(cell.iso); setDialogOpen(true); }} className="text-xs text-muted-foreground hover:text-foreground w-full text-left mb-1">
                    {cell.d}
                  </button>
                  <div className="space-y-1">
                    {(sessoesByDay.get(cell.iso) ?? []).map((s: any) => (
                      <SessaoChip key={s.id} sessao={s} onDelete={async () => {
                        await supabase.from("sessoes").delete().eq("id", s.id);
                        qc.invalidateQueries({ queryKey: ["sessoes", cursoId] });
                        qc.invalidateQueries({ queryKey: ["curso-ufcds", cursoId] });
                      }} />
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <SessaoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        cursoId={cursoId}
        defaultDate={dialogData ?? undefined}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["sessoes", cursoId] });
          qc.invalidateQueries({ queryKey: ["curso-ufcds", cursoId] });
        }}
      />
    </CardContent></Card>
  );
}

function SessaoChip({ sessao, onDelete }: { sessao: any; onDelete: () => void }) {
  return (
    <div className="text-[11px] leading-tight rounded px-1.5 py-1 group relative" style={{ background: `${sessao.formador?.cor}15`, color: sessao.formador?.cor, borderLeft: `2px solid ${sessao.formador?.cor}` }}>
      <div className="font-medium">{sessao.hora_inicio?.slice(0,5)}–{sessao.hora_fim?.slice(0,5)}</div>
      <div className="truncate">{sessao.formador?.nome}</div>
      <div className="truncate opacity-80">{sessao.curso_ufcd?.ufcd?.codigo}</div>
      <button onClick={onDelete} className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition text-[10px] hover:underline print:hidden" title="Apagar">×</button>
    </div>
  );
}

function SessaoDialog({ open, onOpenChange, cursoId, defaultDate, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; cursoId: string; defaultDate?: string; onSaved: () => void }) {
  const [data, setData] = useState("");
  const [hi, setHi] = useState("09:00");
  const [hf, setHf] = useState("13:00");
  const [cufId, setCufId] = useState("");
  const [formadorId, setFormadorId] = useState("");

  // refresh defaults when opening
  useState(() => { /* noop */ });
  if (open && data === "" && defaultDate) setTimeout(() => setData(defaultDate), 0);

  const ufcds = useQuery({
    queryKey: ["curso-ufcds-flat", cursoId],
    queryFn: async () => (await supabase.from("curso_ufcds")
      .select("id, concluida, ufcd:ufcds(codigo,designacao), formadores:curso_ufcd_formadores(formador_id, formador:formadores(id,nome,cor))")
      .eq("curso_id", cursoId).eq("concluida", false)).data ?? [],
    enabled: open,
  });

  const formadoresDaUfcd = useMemo(() => {
    const u = (ufcds.data ?? []).find((x: any) => x.id === cufId);
    return (u?.formadores ?? []).map((f: any) => f.formador);
  }, [cufId, ufcds.data]);

  // Disponibilidades do formador para a data escolhida
  const disp = useQuery({
    queryKey: ["disp-sessao", formadorId, data],
    enabled: !!formadorId && !!data,
    queryFn: async () => {
      const { data: rows } = await supabase.from("formador_disponibilidades" as any)
        .select("hora_inicio, hora_fim, tipo, notas")
        .eq("formador_id", formadorId).eq("data", data);
      return (rows ?? []) as any[];
    },
  });

  async function save() {
    if (!data || !cufId || !formadorId) return toast.error("Preencha todos os campos");
    const horas = diffHoras(hi, hf);
    if (horas <= 0) return toast.error("Horas inválidas");

    // Validate conflict for this formador on this day
    const { data: conflitos } = await supabase.from("sessoes")
      .select("hora_inicio, hora_fim").eq("formador_id", formadorId).eq("data", data);
    const hasConflict = (conflitos ?? []).some(s => !(hf <= s.hora_inicio || hi >= s.hora_fim));
    if (hasConflict) return toast.error("Conflito de horário", { description: "Formador tem outra sessão neste período." });

    // Validate inatividade
    const { data: inat } = await supabase.from("formador_inatividades")
      .select("data_inicio, data_fim, motivo").eq("formador_id", formadorId)
      .lte("data_inicio", data).gte("data_fim", data);
    if ((inat ?? []).length > 0) {
      const i = inat![0];
      return toast.error("Formador indisponível", { description: `${i.motivo || "Inatividade"} (${i.data_inicio} → ${i.data_fim})` });
    }

    // Validate disponibilidades declaradas (se existirem para o dia)
    const dispRows = (disp.data ?? []) as any[];
    if (dispRows.length > 0) {
      const indisp = dispRows.some(d => d.tipo === "indisponivel" && !(hf <= d.hora_inicio || hi >= d.hora_fim));
      if (indisp) return toast.error("Formador marcado como indisponível neste período");
      const temDisp = dispRows.some(d => d.tipo === "disponivel");
      if (temDisp) {
        const dentro = dispRows.some(d => d.tipo === "disponivel" && hi >= d.hora_inicio && hf <= d.hora_fim);
        if (!dentro) return toast.error("Fora das horas declaradas como disponíveis pelo formador");
      }
    }

    const { error } = await supabase.from("sessoes").insert({
      curso_id: cursoId, curso_ufcd_id: cufId, formador_id: formadorId, data, hora_inicio: hi, hora_fim: hf, horas,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Sessão criada");
    onOpenChange(false);
    setData(""); setCufId(""); setFormadorId(""); setHi("09:00"); setHf("13:00");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setData(""); setCufId(""); setFormadorId(""); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova sessão</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>UFCD *</Label>
            <Select value={cufId} onValueChange={v => { setCufId(v); setFormadorId(""); }}>
              <SelectTrigger><SelectValue placeholder="Escolher UFCD…" /></SelectTrigger>
              <SelectContent>
                {(ufcds.data ?? []).length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Atribua UFCD ao curso primeiro</div>}
                {(ufcds.data ?? []).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.ufcd.codigo} — {u.ufcd.designacao}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Formador *</Label>
            <Select value={formadorId} onValueChange={setFormadorId}>
              <SelectTrigger><SelectValue placeholder={cufId ? "Escolher formador…" : "Escolha UFCD primeiro"} /></SelectTrigger>
              <SelectContent>
                {formadoresDaUfcd.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">UFCD sem formadores atribuídos</div>}
                {formadoresDaUfcd.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5"><Label>Data *</Label><Input type="date" value={data} onChange={e => setData(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Início</Label><Input type="time" value={hi} onChange={e => setHi(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Fim</Label><Input type="time" value={hf} onChange={e => setHf(e.target.value)} /></div>
          <div className="col-span-2 text-xs text-muted-foreground">Duração: {diffHoras(hi, hf).toFixed(2).replace(".", ",")} h</div>
          {formadorId && data && (disp.data ?? []).length > 0 && (
            <div className="col-span-2 text-xs rounded-md border bg-muted/40 px-3 py-2 space-y-0.5">
              <div className="font-medium text-foreground">Disponibilidade declarada</div>
              {(disp.data ?? []).map((d: any, idx: number) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <span className={"inline-block size-1.5 rounded-full " + (d.tipo === "disponivel" ? "bg-emerald-500" : "bg-rose-500")} />
                  <span>{d.hora_inicio?.slice(0,5)}–{d.hora_fim?.slice(0,5)} · {d.tipo === "disponivel" ? "Disponível" : "Indisponível"}{d.notas ? ` · ${d.notas}` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save}>Criar sessão</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- FORMANDOS TAB ----------------
function FormandosTab({ cursoId }: { cursoId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const data = useQuery({
    queryKey: ["curso-formandos", cursoId],
    queryFn: async () => {
      const { data, error } = await supabase.from("curso_formandos")
        .select("id, data_inscricao, estado, observacoes, formando:formandos(id, nome, email, telemovel, nif, estado)")
        .eq("curso_id", cursoId).order("data_inscricao", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function del(id: string) {
    const { error } = await supabase.from("curso_formandos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Inscrição removida");
    qc.invalidateQueries({ queryKey: ["curso-formandos", cursoId] });
  }

  async function setEstado(id: string, estado: string) {
    const { error } = await supabase.from("curso_formandos").update({ estado } as never).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["curso-formandos", cursoId] });
  }

  return (
    <Card><CardContent className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">{data.data?.length ?? 0} formandos inscritos</div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" /> Inscrever formando</Button>
      </div>
      {(data.data?.length ?? 0) === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">Sem formandos. Inscreva o primeiro.</div>
      ) : (
        <div className="border rounded-md divide-y">
          {(data.data ?? []).map((i: any) => (
            <div key={i.id} className="px-4 py-3 flex items-center gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <Link to="/formandos/$id" params={{ id: i.formando.id }} className="font-medium hover:underline truncate block">
                  {i.formando.nome}
                </Link>
                <div className="text-xs text-muted-foreground truncate">
                  {[i.formando.email, i.formando.telemovel, i.formando.nif && `NIF ${i.formando.nif}`].filter(Boolean).join(" · ") || "Sem contacto"}
                </div>
              </div>
              <Select value={i.estado} onValueChange={(v) => setEstado(i.id, v)}>
                <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(INSCRICAO_ESTADO_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground w-20 text-right">{fmtDate(i.data_inscricao)}</div>
              <Button variant="ghost" size="sm" onClick={() => del(i.id)}><Trash2 className="size-3.5" /></Button>
            </div>
          ))}
        </div>
      )}
      <InscreverFormandoDialog open={open} onOpenChange={setOpen} cursoId={cursoId} jaInscritos={new Set((data.data ?? []).map((i: any) => i.formando.id))} onSaved={() => qc.invalidateQueries({ queryKey: ["curso-formandos", cursoId] })} />
    </CardContent></Card>
  );
}

function InscreverFormandoDialog({ open, onOpenChange, cursoId, jaInscritos, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; cursoId: string; jaInscritos: Set<string>; onSaved: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [filtro, setFiltro] = useState("");

  const formandos = useQuery({
    queryKey: ["formandos-disponiveis"],
    queryFn: async () => (await supabase.from("formandos").select("id, nome, email, estado").eq("estado", "ativo").order("nome")).data ?? [],
    enabled: open,
  });

  const filtrados = (formandos.data ?? []).filter((f: any) =>
    !jaInscritos.has(f.id) && (!filtro || f.nome.toLowerCase().includes(filtro.toLowerCase()))
  );

  async function save() {
    if (selected.length === 0) return toast.error("Escolha pelo menos um formando");
    const rows = selected.map(fid => ({ curso_id: cursoId, formando_id: fid }));
    const { error } = await supabase.from("curso_formandos").insert(rows as never);
    if (error) return toast.error(error.message);
    toast.success(`${selected.length} formando(s) inscrito(s)`);
    setSelected([]); setFiltro("");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setSelected([]); setFiltro(""); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Inscrever formandos</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Procurar…" value={filtro} onChange={e => setFiltro(e.target.value)} />
          <div className="border rounded-md max-h-72 overflow-y-auto">
            {filtrados.length === 0 && <div className="px-3 py-6 text-xs text-muted-foreground text-center">Sem formandos disponíveis.</div>}
            {filtrados.map((f: any) => (
              <label key={f.id} className="flex items-center gap-2 text-sm px-3 py-2 border-b last:border-b-0 hover:bg-muted/40 cursor-pointer">
                <Checkbox checked={selected.includes(f.id)} onCheckedChange={(c) => setSelected(c ? [...selected, f.id] : selected.filter(x => x !== f.id))} />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{f.nome}</div>
                  {f.email && <div className="text-xs text-muted-foreground truncate">{f.email}</div>}
                </div>
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save}>Inscrever {selected.length > 0 && `(${selected.length})`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- FALTAS TAB ----------------
function FaltasTab({ cursoId }: { cursoId: string }) {
  const qc = useQueryClient();
  const [sessaoId, setSessaoId] = useState<string>("");

  const inscritos = useQuery({
    queryKey: ["curso-formandos-faltas", cursoId],
    queryFn: async () => {
      const { data, error } = await supabase.from("curso_formandos")
        .select("id, formando:formandos(id, nome)")
        .eq("curso_id", cursoId)
        .in("estado", ["inscrito", "em_formacao"]);
      if (error) throw error;
      return (data ?? []).sort((a: any, b: any) => a.formando.nome.localeCompare(b.formando.nome));
    },
  });

  const sessoes = useQuery({
    queryKey: ["sessoes-faltas", cursoId],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessoes")
        .select("id, data, hora_inicio, hora_fim, horas, curso_ufcd:curso_ufcds(ufcd:ufcds(codigo, designacao))")
        .eq("curso_id", cursoId)
        .order("data", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const faltas = useQuery({
    queryKey: ["faltas", cursoId, sessaoId],
    enabled: !!sessaoId,
    queryFn: async () => {
      const { data, error } = await supabase.from("formando_faltas")
        .select("id, curso_formando_id, horas, tipo, observacoes")
        .eq("sessao_id", sessaoId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const totaisPorFormando = useQuery({
    queryKey: ["faltas-totais", cursoId],
    queryFn: async () => {
      const { data, error } = await supabase.from("formando_faltas")
        .select("curso_formando_id, horas, tipo, curso_formando:curso_formandos!inner(curso_id)")
        .eq("curso_formando.curso_id", cursoId);
      if (error) throw error;
      const map = new Map<string, { just: number; injust: number }>();
      (data ?? []).forEach((f: any) => {
        const cur = map.get(f.curso_formando_id) ?? { just: 0, injust: 0 };
        if (f.tipo === "justificada") cur.just += Number(f.horas);
        else cur.injust += Number(f.horas);
        map.set(f.curso_formando_id, cur);
      });
      return map;
    },
  });

  const totalHorasCurso = (sessoes.data ?? []).reduce((s, x: any) => s + Number(x.horas ?? 0), 0);
  const sessao = (sessoes.data ?? []).find((s: any) => s.id === sessaoId) as any;
  const faltasMap = new Map((faltas.data ?? []).map((f: any) => [f.curso_formando_id, f]));

  async function registar(cursoFormandoId: string, horas: number, tipo: "justificada" | "injustificada") {
    if (!sessao) return;
    const existing = faltasMap.get(cursoFormandoId) as any;
    if (horas <= 0) {
      if (existing) {
        const { error } = await supabase.from("formando_faltas").delete().eq("id", existing.id);
        if (error) return toast.error(error.message);
      }
    } else if (existing) {
      const { error } = await supabase.from("formando_faltas")
        .update({ horas, tipo } as never).eq("id", existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("formando_faltas").insert({
        curso_formando_id: cursoFormandoId,
        sessao_id: sessao.id,
        data: sessao.data,
        horas,
        tipo,
      } as never);
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["faltas", cursoId, sessaoId] });
    qc.invalidateQueries({ queryKey: ["faltas-totais", cursoId] });
  }

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-6 space-y-4">
        <div className="flex items-end gap-3">
          <div className="flex-1 max-w-md">
            <Label className="text-xs">Sessão</Label>
            <Select value={sessaoId} onValueChange={setSessaoId}>
              <SelectTrigger><SelectValue placeholder="Escolher sessão para registar faltas" /></SelectTrigger>
              <SelectContent>
                {(sessoes.data ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {fmtDate(s.data)} · {s.hora_inicio.slice(0,5)}–{s.hora_fim.slice(0,5)} · {s.curso_ufcd?.ufcd?.codigo ?? "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {sessao && <div className="text-xs text-muted-foreground">Duração: {fmtHoras(sessao.horas)}</div>}
        </div>

        {sessao && (
          <div className="border rounded-md divide-y">
            <div className="grid grid-cols-[1fr_120px_160px] gap-3 px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground bg-muted/40">
              <div>Formando</div><div>Horas falta</div><div>Tipo</div>
            </div>
            {(inscritos.data ?? []).map((i: any) => {
              const f = faltasMap.get(i.id) as any;
              return (
                <div key={i.id} className="grid grid-cols-[1fr_120px_160px] gap-3 px-4 py-2 items-center text-sm">
                  <div className="truncate">{i.formando.nome}</div>
                  <Input
                    type="number" min={0} step={0.5} max={sessao.horas}
                    defaultValue={f?.horas ?? 0}
                    onBlur={e => registar(i.id, Number(e.target.value), (f?.tipo ?? "injustificada") as any)}
                    className="h-8"
                  />
                  <Select value={f?.tipo ?? "injustificada"} onValueChange={(v) => registar(i.id, Number(f?.horas ?? sessao.horas), v as any)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(FALTA_TIPO_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
            {(inscritos.data ?? []).length === 0 && (
              <div className="px-4 py-6 text-xs text-muted-foreground text-center">Sem formandos inscritos.</div>
            )}
          </div>
        )}
      </CardContent></Card>

      <Card><CardContent className="p-6 space-y-3">
        <div className="text-sm font-medium">Resumo de assiduidade</div>
        <div className="text-xs text-muted-foreground">Carga total do curso: {fmtHoras(totalHorasCurso)}</div>
        <div className="border rounded-md divide-y">
          <div className="grid grid-cols-[1fr_100px_100px_100px_100px] gap-3 px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground bg-muted/40">
            <div>Formando</div><div>Just.</div><div>Injust.</div><div>Total</div><div>Assiduidade</div>
          </div>
          {(inscritos.data ?? []).map((i: any) => {
            const t = totaisPorFormando.data?.get(i.id) ?? { just: 0, injust: 0 };
            const totalFaltas = t.just + t.injust;
            const ass = totalHorasCurso > 0 ? ((totalHorasCurso - totalFaltas) / totalHorasCurso) * 100 : 100;
            return (
              <div key={i.id} className="grid grid-cols-[1fr_100px_100px_100px_100px] gap-3 px-4 py-2 items-center text-sm">
                <Link to="/formandos/$id" params={{ id: i.formando.id }} className="truncate hover:underline">{i.formando.nome}</Link>
                <div>{fmtHoras(t.just)}</div>
                <div>{fmtHoras(t.injust)}</div>
                <div>{fmtHoras(totalFaltas)}</div>
                <div className={ass < 90 ? "text-destructive font-medium" : ""}>{ass.toFixed(1)}%</div>
              </div>
            );
          })}
        </div>
      </CardContent></Card>
    </div>
  );
}
