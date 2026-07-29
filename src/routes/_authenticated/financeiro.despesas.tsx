import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, FileSpreadsheet, Paperclip, Search, Download } from "lucide-react";
import { toast } from "sonner";
import { useProjetoAtivo } from "@/lib/projeto-context";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/financeiro/despesas")({
  head: () => ({ meta: [{ title: "Financeiro — Despesas" }] }),
  component: DespesasPage,
});

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function DespesasPage() {
  const { projetoId } = useProjetoAtivo();
  const [filtroCurso, setFiltroCurso] = useState<string>("__all__");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("__all__");
  const [filtroAno, setFiltroAno] = useState<string>(String(new Date().getFullYear()));
  const [filtroMes, setFiltroMes] = useState<string>("__all__");
  const [pesquisa, setPesquisa] = useState("");
  const [editar, setEditar] = useState<any | null>(null);
  const [abrirNovo, setAbrirNovo] = useState(false);

  const categorias = useQuery({
    queryKey: ["despesa-categorias"],
    queryFn: async () => (await supabase.from("despesa_categorias").select("*").order("ordem")).data ?? [],
  });

  const cursos = useQuery({
    queryKey: ["cursos-simples", projetoId],
    queryFn: async () => {
      let q = supabase.from("cursos").select("id, codigo, nome, projeto_id").order("codigo");
      if (projetoId && projetoId !== "all") q = q.eq("projeto_id", projetoId);
      return (await q).data ?? [];
    },
  });

  const despesas = useQuery({
    queryKey: ["despesas", projetoId, filtroCurso, filtroCategoria, filtroAno, filtroMes],
    queryFn: async () => {
      let q = supabase.from("despesas").select("*, categoria:categoria_id(nome), curso:curso_id(codigo, nome), projeto:projeto_id(codigo, nome)").order("data", { ascending: false });
      if (projetoId && projetoId !== "all") q = q.eq("projeto_id", projetoId);
      if (filtroCurso !== "__all__") q = q.eq("curso_id", filtroCurso);
      if (filtroCategoria !== "__all__") q = q.eq("categoria_id", filtroCategoria);
      if (filtroAno && filtroAno !== "__all__") {
        if (filtroMes && filtroMes !== "__all__") {
          const m = Number(filtroMes);
          const inicio = `${filtroAno}-${String(m).padStart(2, "0")}-01`;
          const lastDay = new Date(Date.UTC(Number(filtroAno), m, 0)).getUTCDate();
          const fim = `${filtroAno}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
          q = q.gte("data", inicio).lte("data", fim);
        } else {
          q = q.gte("data", `${filtroAno}-01-01`).lte("data", `${filtroAno}-12-31`);
        }
      }
      return (await q).data ?? [];
    },
  });

  const lista = useMemo(() => {
    const q = pesquisa.trim().toLowerCase();
    if (!q) return despesas.data ?? [];
    return (despesas.data ?? []).filter((d: any) =>
      (d.descricao ?? "").toLowerCase().includes(q) ||
      (d.fornecedor ?? "").toLowerCase().includes(q) ||
      (d.nif ?? "").toLowerCase().includes(q) ||
      (d.categoria?.nome ?? "").toLowerCase().includes(q) ||
      (d.curso?.codigo ?? "").toLowerCase().includes(q) ||
      (d.curso?.nome ?? "").toLowerCase().includes(q)
    );
  }, [despesas.data, pesquisa]);

  const totais = useMemo(() => {
    const total = lista.reduce((s: number, d: any) => s + Number(d.valor ?? 0), 0);
    const porCat = new Map<string, number>();
    const porCurso = new Map<string, number>();
    lista.forEach((d: any) => {
      const cat = d.categoria?.nome ?? "—";
      porCat.set(cat, (porCat.get(cat) ?? 0) + Number(d.valor ?? 0));
      const curso = d.curso ? `${d.curso.codigo} — ${d.curso.nome}` : "Sem curso";
      porCurso.set(curso, (porCurso.get(curso) ?? 0) + Number(d.valor ?? 0));
    });
    return { total, porCat: Array.from(porCat.entries()).sort((a,b) => b[1] - a[1]), porCurso: Array.from(porCurso.entries()).sort((a,b) => b[1] - a[1]) };
  }, [lista]);

  const anos = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i);

  async function exportar(modo: "consolidado" | "por_curso") {
    if (!lista.length) { toast.error("Sem despesas para exportar"); return; }
    const { exportDespesasExcel } = await import("@/lib/financeiro/despesas-excel");
    const { data: cfg } = await supabase.from("fin_config").select("*").limit(1).maybeSingle();
    const rows = lista.map((d: any) => ({
      id: d.id, data: d.data, categoria: d.categoria?.nome ?? "—", descricao: d.descricao,
      fornecedor: d.fornecedor, nif: d.nif, valor: Number(d.valor),
      curso_codigo: d.curso?.codigo ?? null, curso_nome: d.curso?.nome ?? null,
      observacoes: d.observacoes,
    }));
    const titulo = projetoId && projetoId !== "all"
      ? `Despesas — Projeto ${(cursos.data?.[0] as any)?.projeto?.codigo ?? ""}`
      : "Despesas — Todos os projetos";
    const periodo = filtroAno !== "__all__"
      ? (filtroMes !== "__all__" ? `${MESES[Number(filtroMes)-1]}/${filtroAno}` : filtroAno)
      : null;
    await exportDespesasExcel({
      titulo, periodo, modo, rows,
      empresa: cfg ? { nome: cfg.empresa_nome, nif: cfg.empresa_nif, morada: cfg.empresa_morada } : null,
      logoEmpresaUrl: cfg?.logo_empresa_url ?? null,
      logoDgertUrl: cfg?.logo_dgert_url ?? null,
      logoPessoas2030Url: cfg?.logo_pessoas2030_url ?? null,
    });
    toast.success("Excel gerado");
  }

  return (
    <PageContainer>
      <PageHeader
        title="Despesas"
        description="Registo autónomo de despesas dos cursos (não entra nos processamentos)."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportar("consolidado")} disabled={!lista.length}>
              <FileSpreadsheet className="size-4" />Excel — Consolidado
            </Button>
            <Button variant="outline" onClick={() => exportar("por_curso")} disabled={!lista.length}>
              <FileSpreadsheet className="size-4" />Excel — Por curso
            </Button>
            <Dialog open={abrirNovo} onOpenChange={setAbrirNovo}>
              <DialogTrigger asChild><Button><Plus className="size-4" />Nova despesa</Button></DialogTrigger>
              <DespesaDialog onClose={() => setAbrirNovo(false)} categorias={categorias.data ?? []} cursos={cursos.data ?? []} projetoId={projetoId} />
            </Dialog>
          </div>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4 grid gap-3 md:grid-cols-6">
          <div className="space-y-1.5"><Label>Curso</Label>
            <Select value={filtroCurso} onValueChange={setFiltroCurso}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {(cursos.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.codigo} — {c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Categoria</Label>
            <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {(categorias.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Ano</Label>
            <Select value={filtroAno} onValueChange={setFiltroAno}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {anos.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Mês</Label>
            <Select value={filtroMes} onValueChange={setFiltroMes} disabled={filtroAno === "__all__"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {MESES.map((m, i) => <SelectItem key={i} value={String(i+1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2"><Label>Pesquisar</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Descrição, fornecedor, NIF, categoria, curso…" value={pesquisa} onChange={e => setPesquisa(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3 mb-4">
        <Card><CardContent className="p-4">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total filtrado</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{totais.total.toFixed(2)} €</div>
          <div className="text-xs text-muted-foreground mt-1">{lista.length} despesa(s)</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Por categoria</div>
          {totais.porCat.length ? (
            <ul className="text-xs space-y-1 max-h-32 overflow-auto">
              {totais.porCat.map(([k, v]) => <li key={k} className="flex justify-between gap-2"><span className="truncate">{k}</span><span className="tabular-nums font-medium">{v.toFixed(2)} €</span></li>)}
            </ul>
          ) : <div className="text-xs text-muted-foreground">—</div>}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Por curso</div>
          {totais.porCurso.length ? (
            <ul className="text-xs space-y-1 max-h-32 overflow-auto">
              {totais.porCurso.map(([k, v]) => <li key={k} className="flex justify-between gap-2"><span className="truncate">{k}</span><span className="tabular-nums font-medium">{v.toFixed(2)} €</span></li>)}
            </ul>
          ) : <div className="text-xs text-muted-foreground">—</div>}
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Lista de despesas</CardTitle></CardHeader>
        <CardContent className="p-0">
          {despesas.isLoading && <div className="px-6 py-10 text-sm text-muted-foreground">A carregar…</div>}
          {!despesas.isLoading && !lista.length && <div className="px-6 py-10 text-sm text-muted-foreground text-center">Sem despesas.</div>}
          <ul className="divide-y">
            {lista.map((d: any) => (
              <li key={d.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30">
                <div className="w-20 text-xs font-mono tabular-nums text-muted-foreground">{fmtDate(d.data)}</div>
                <div className="w-32 text-xs"><span className="px-2 py-0.5 rounded bg-muted/70">{d.categoria?.nome ?? "—"}</span></div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-sm">{d.descricao}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {d.curso ? `${d.curso.codigo} — ${d.curso.nome}` : "Sem curso"}
                    {d.fornecedor && <> · {d.fornecedor}</>}
                    {d.nif && <> · NIF {d.nif}</>}
                  </div>
                </div>
                {d.anexo_storage_path && <AnexoLink path={d.anexo_storage_path} />}
                <div className="w-24 text-right text-sm font-semibold tabular-nums">{Number(d.valor).toFixed(2)} €</div>
                <Dialog>
                  <DialogTrigger asChild><Button variant="ghost" size="icon" onClick={() => setEditar(d)}><Pencil className="size-4" /></Button></DialogTrigger>
                  {editar?.id === d.id && (
                    <DespesaDialog onClose={() => setEditar(null)} despesa={editar} categorias={categorias.data ?? []} cursos={cursos.data ?? []} projetoId={projetoId} />
                  )}
                </Dialog>
                <DeleteButton id={d.id} anexo={d.anexo_storage_path} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function AnexoLink({ path }: { path: string }) {
  async function open() {
    const { data, error } = await supabase.storage.from("despesas-anexos").createSignedUrl(path, 60);
    if (error) { toast.error(error.message); return; }
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }
  return <Button variant="ghost" size="icon" onClick={open} title="Ver anexo"><Paperclip className="size-4" /></Button>;
}

function DeleteButton({ id, anexo }: { id: string; anexo: string | null }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async () => {
      if (anexo) await supabase.storage.from("despesas-anexos").remove([anexo]);
      const { error } = await supabase.from("despesas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["despesas"] }); toast.success("Eliminada"); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="size-4 text-destructive" /></Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Eliminar despesa?</AlertDialogTitle>
          <AlertDialogDescription>Esta ação é irreversível e apaga também o anexo, se existir.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => del.mutate()}>Eliminar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DespesaDialog({ onClose, despesa, categorias, cursos, projetoId }: { onClose: () => void; despesa?: any; categorias: any[]; cursos: any[]; projetoId: string }) {
  const qc = useQueryClient();
  const isEdit = !!despesa;
  const [data, setData] = useState<string>(despesa?.data ?? new Date().toISOString().slice(0, 10));
  const [categoriaId, setCategoriaId] = useState<string>(despesa?.categoria_id ?? (categorias.filter(c => c.ativo)[0]?.id ?? ""));
  const [cursoId, setCursoId] = useState<string>(despesa?.curso_id ?? "__none__");
  const [projeto, setProjeto] = useState<string>(despesa?.projeto_id ?? (projetoId && projetoId !== "all" ? projetoId : "__none__"));
  const [descricao, setDescricao] = useState<string>(despesa?.descricao ?? "");
  const [valor, setValor] = useState<string>(despesa?.valor != null ? String(despesa.valor) : "");
  const [fornecedor, setFornecedor] = useState<string>(despesa?.fornecedor ?? "");
  const [nif, setNif] = useState<string>(despesa?.nif ?? "");
  const [obs, setObs] = useState<string>(despesa?.observacoes ?? "");
  const [anexoPath, setAnexoPath] = useState<string | null>(despesa?.anexo_storage_path ?? null);
  const [uploading, setUploading] = useState(false);

  const projetos = useQuery({
    queryKey: ["projetos-simples"],
    queryFn: async () => (await supabase.from("projetos").select("id, codigo, nome").order("codigo")).data ?? [],
  });

  async function uploadAnexo(file: File) {
    setUploading(true);
    try {
      const key = `${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from("despesas-anexos").upload(key, file, { upsert: false });
      if (error) throw error;
      setAnexoPath(key);
      toast.success("Anexo carregado");
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!descricao.trim()) throw new Error("Descrição obrigatória");
      if (!categoriaId) throw new Error("Categoria obrigatória");
      const v = Number(valor.replace(",", "."));
      if (!Number.isFinite(v) || v < 0) throw new Error("Valor inválido");
      const payload: any = {
        data, categoria_id: categoriaId, descricao: descricao.trim(),
        valor: v, fornecedor: fornecedor.trim() || null, nif: nif.trim() || null,
        observacoes: obs.trim() || null, anexo_storage_path: anexoPath,
        curso_id: cursoId === "__none__" ? null : cursoId,
        projeto_id: projeto === "__none__" ? null : projeto,
      };
      if (isEdit) {
        const { error } = await supabase.from("despesas").update(payload as never).eq("id", despesa.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("despesas").insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["despesas"] }); toast.success(isEdit ? "Atualizada" : "Adicionada"); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{isEdit ? "Editar despesa" : "Nova despesa"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5"><Label>Data *</Label><Input type="date" value={data} onChange={e => setData(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Categoria *</Label>
          <Select value={categoriaId} onValueChange={setCategoriaId}>
            <SelectTrigger><SelectValue placeholder="Escolher…" /></SelectTrigger>
            <SelectContent>{categorias.filter(c => c.ativo || c.id === categoriaId).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}{!c.ativo && " (inativa)"}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Projeto</Label>
          <Select value={projeto} onValueChange={setProjeto}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sem projeto</SelectItem>
              {(projetos.data ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.codigo} — {p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Curso</Label>
          <Select value={cursoId} onValueChange={setCursoId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sem curso</SelectItem>
              {cursos.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.codigo} — {c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 md:col-span-2"><Label>Descrição *</Label><Input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex: Compra de alimentos para aula prática" /></div>
        <div className="space-y-1.5"><Label>Valor (€) *</Label><Input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Fornecedor</Label><Input value={fornecedor} onChange={e => setFornecedor(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>NIF fornecedor</Label><Input value={nif} onChange={e => setNif(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Anexo (fatura/recibo)</Label>
          <div className="flex gap-2 items-center">
            <label className="flex-1">
              <input type="file" accept="image/*,application/pdf" className="hidden" disabled={uploading} onChange={e => { const f = e.target.files?.[0]; if (f) uploadAnexo(f); }} />
              <Button asChild size="sm" variant="outline" className="w-full cursor-pointer" disabled={uploading}>
                <span><Download className="size-3" /> {uploading ? "…" : anexoPath ? "Substituir" : "Carregar"}</span>
              </Button>
            </label>
            {anexoPath && <Button size="sm" variant="ghost" onClick={() => setAnexoPath(null)}><Trash2 className="size-3" /></Button>}
          </div>
          {anexoPath && <div className="text-[10px] text-muted-foreground truncate">{anexoPath}</div>}
        </div>
        <div className="space-y-1.5 md:col-span-2"><Label>Observações</Label><Input value={obs} onChange={e => setObs(e.target.value)} /></div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{isEdit ? "Guardar" : "Adicionar"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
