import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, X, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/financeiro/configuracao")({
  head: () => ({ meta: [{ title: "Financeiro — Configuração" }] }),
  component: ConfiguracaoPage,
});

type FinConfig = {
  id?: string;
  empresa_nome: string | null;
  empresa_nif: string | null;
  empresa_morada: string | null;
  empresa_email: string | null;
  empresa_telefone: string | null;
  horas_mes_referencia: number;
  valor_sa: number;
  valor_km: number;
  limite_km_dia: number;
  tr_teto_mensal: number;
  atl_teto_mensal: number;
  percentagem_irs: number;
  percentagem_iva: number;
  percentagem_ss: number;
  logo_empresa_url: string | null;
  logo_dgert_url: string | null;
  logo_pessoas2030_url: string | null;
};

const DEFAULT: FinConfig = {
  empresa_nome: "",
  empresa_nif: "",
  empresa_morada: "",
  empresa_email: "",
  empresa_telefone: "",
  horas_mes_referencia: 150,
  valor_sa: 6,
  valor_km: 0.4,
  limite_km_dia: 50,
  tr_teto_mensal: 0,
  atl_teto_mensal: 0,
  percentagem_irs: 23,
  percentagem_iva: 23,
  percentagem_ss: 11,
  logo_empresa_url: null,
  logo_dgert_url: null,
  logo_pessoas2030_url: null,
};

function useConfig() {
  return useQuery({
    queryKey: ["fin-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fin_config").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return (data ?? null) as FinConfig | null;
    },
  });
}

function ConfiguracaoPage() {
  const qc = useQueryClient();
  const cfg = useConfig();
  const [form, setForm] = useState<FinConfig>(DEFAULT);

  useEffect(() => {
    if (cfg.data) setForm({ ...DEFAULT, ...cfg.data });
  }, [cfg.data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form };
      if (cfg.data?.id) {
        const { error } = await supabase.from("fin_config").update(payload as never).eq("id", cfg.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("fin_config").insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fin-config"] }); toast.success("Configuração guardada"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <PageContainer>
      <PageHeader title="Configuração Financeira" description="Parâmetros globais do módulo financeiro. Aplicam-se a todos os processamentos." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Dados da entidade</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <F label="Nome"><Input value={form.empresa_nome ?? ""} onChange={e => setForm({ ...form, empresa_nome: e.target.value })} /></F>
            <F label="NIF"><Input value={form.empresa_nif ?? ""} onChange={e => setForm({ ...form, empresa_nif: e.target.value })} /></F>
            <F label="Morada"><Input value={form.empresa_morada ?? ""} onChange={e => setForm({ ...form, empresa_morada: e.target.value })} /></F>
            <div className="grid grid-cols-2 gap-3">
              <F label="Email"><Input value={form.empresa_email ?? ""} onChange={e => setForm({ ...form, empresa_email: e.target.value })} /></F>
              <F label="Telefone"><Input value={form.empresa_telefone ?? ""} onChange={e => setForm({ ...form, empresa_telefone: e.target.value })} /></F>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Parâmetros de cálculo</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <F label="Horas/mês referência (Bolsa)"><Input type="number" value={form.horas_mes_referencia} onChange={e => setForm({ ...form, horas_mes_referencia: Number(e.target.value) })} /></F>
            <F label="SA por dia (€)"><Input type="number" step="0.01" value={form.valor_sa} onChange={e => setForm({ ...form, valor_sa: Number(e.target.value) })} /></F>
            <F label="Valor por km (€)"><Input type="number" step="0.001" value={form.valor_km} onChange={e => setForm({ ...form, valor_km: Number(e.target.value) })} /></F>
            <F label="Limite km/dia"><Input type="number" value={form.limite_km_dia} onChange={e => setForm({ ...form, limite_km_dia: Number(e.target.value) })} /></F>
            <F label="Tecto mensal Transporte (€)"><Input type="number" step="0.01" value={form.tr_teto_mensal} onChange={e => setForm({ ...form, tr_teto_mensal: Number(e.target.value) })} /></F>
            <F label="Tecto mensal ATL por formando (€)"><Input type="number" step="0.01" value={form.atl_teto_mensal} onChange={e => setForm({ ...form, atl_teto_mensal: Number(e.target.value) })} /></F>
            <F label="IRS % (retenção padrão)"><Input type="number" step="0.01" value={form.percentagem_irs} onChange={e => setForm({ ...form, percentagem_irs: Number(e.target.value) })} /></F>
            <F label="IVA % (padrão)"><Input type="number" step="0.01" value={form.percentagem_iva} onChange={e => setForm({ ...form, percentagem_iva: Number(e.target.value) })} /></F>
            <F label="SS % (padrão)"><Input type="number" step="0.01" value={form.percentagem_ss} onChange={e => setForm({ ...form, percentagem_ss: Number(e.target.value) })} /></F>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Logótipos institucionais</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <LogoField label="Empresa" url={form.logo_empresa_url} onChange={u => setForm({ ...form, logo_empresa_url: u })} />
            <LogoField label="DGERT" url={form.logo_dgert_url} onChange={u => setForm({ ...form, logo_dgert_url: u })} />
            <LogoField label="Pessoas 2030" url={form.logo_pessoas2030_url} onChange={u => setForm({ ...form, logo_pessoas2030_url: u })} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Categorias de despesas</CardTitle></CardHeader>
          <CardContent><CategoriasDespesas /></CardContent>
        </Card>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Guardar</Button>
      </div>
    </PageContainer>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>{children}</div>;
}

function LogoField({ label, url, onChange }: { label: string; url: string | null; onChange: (u: string | null) => void }) {
  const [uploading, setUploading] = useState(false);
  async function upload(file: File) {
    setUploading(true);
    try {
      const key = `${label.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("empresa-logos").upload(key, file, { upsert: true });
      if (error) throw error;
      const { data: signed } = await supabase.storage.from("empresa-logos").createSignedUrl(key, 60 * 60 * 24 * 365);
      onChange(signed?.signedUrl ?? key);
      toast.success(`Logo ${label} carregado`);
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  }
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="border rounded-md p-3 h-32 flex items-center justify-center bg-muted/30">
        {url ? <img src={url} alt={label} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">Sem imagem</span>}
      </div>
      <div className="flex gap-2">
        <label className="flex-1">
          <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
          <Button asChild size="sm" variant="outline" className="w-full cursor-pointer" disabled={uploading}>
            <span><Upload className="size-3" /> {uploading ? "…" : "Carregar"}</span>
          </Button>
        </label>
        {url && <Button size="sm" variant="ghost" onClick={() => onChange(null)}><X className="size-3" /></Button>}
      </div>
    </div>
  );
}

function CategoriasDespesas() {
  const qc = useQueryClient();
  const cats = useQuery({
    queryKey: ["despesa-categorias-cfg"],
    queryFn: async () => (await supabase.from("despesa_categorias").select("*").order("ordem")).data ?? [],
  });
  const [novoNome, setNovoNome] = useState("");
  const invalidar = () => qc.invalidateQueries({ queryKey: ["despesa-categorias-cfg"] });

  const criar = useMutation({
    mutationFn: async () => {
      const nome = novoNome.trim(); if (!nome) throw new Error("Nome obrigatório");
      const ordem = (cats.data?.length ?? 0) + 1;
      const { error } = await supabase.from("despesa_categorias").insert({ nome, ordem } as never);
      if (error) throw error;
    },
    onSuccess: () => { setNovoNome(""); invalidar(); toast.success("Categoria adicionada"); },
    onError: (e: any) => toast.error(e.message),
  });
  const alterar = useMutation({
    mutationFn: async (p: { id: string; nome?: string; ativo?: boolean }) => {
      const { id, ...patch } = p;
      const { error } = await supabase.from("despesa_categorias").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: (e: any) => toast.error(e.message),
  });
  const eliminar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("despesa_categorias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidar(); toast.success("Eliminada"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Categorias usadas ao registar despesas. Categorias inativas ficam ocultas em novos registos mas mantêm-se nas despesas existentes.</p>
      <div className="flex gap-2">
        <Input placeholder="Nova categoria…" value={novoNome} onChange={e => setNovoNome(e.target.value)} onKeyDown={e => { if (e.key === "Enter") criar.mutate(); }} />
        <Button onClick={() => criar.mutate()} disabled={criar.isPending || !novoNome.trim()}><Plus className="size-4" />Adicionar</Button>
      </div>
      <ul className="divide-y border rounded-md">
        {(cats.data ?? []).map((c: any) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-2">
            <Input className="flex-1 h-8" defaultValue={c.nome} onBlur={e => { const v = e.target.value.trim(); if (v && v !== c.nome) alterar.mutate({ id: c.id, nome: v }); }} />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" className="size-3.5" checked={c.ativo} onChange={e => alterar.mutate({ id: c.id, ativo: e.target.checked })} />
              Ativa
            </label>
            <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Eliminar categoria "${c.nome}"?`)) eliminar.mutate(c.id); }}>
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
        {!(cats.data ?? []).length && <li className="p-3 text-xs text-muted-foreground text-center">Sem categorias.</li>}
      </ul>
    </div>
  );
}

