import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  listarRubricas, criarRubrica, atualizarRubrica, eliminarRubrica,
} from "@/lib/financeiro/services/rubricas";
import type { FinRubrica } from "@/lib/financeiro/types";

export const Route = createFileRoute("/_authenticated/financeiro/rubricas")({
  head: () => ({ meta: [{ title: "Financeiro — Rubricas" }] }),
  component: RubricasPage,
});

const CATEGORIAS = ["Bolsa", "Subsídio", "Deslocação", "Honorários", "Prémio", "Outros"];

function RubricasPage() {
  const qc = useQueryClient();
  const [nova, setNova] = useState<Partial<FinRubrica>>({ codigo: "", descricao: "", categoria: "Outros", ativo: true, ordem: 100, permite_edicao_manual: true, gera_documento: false, gera_exportacao: true });
  const rubs = useQuery({ queryKey: ["fin-rubricas"], queryFn: listarRubricas });

  const create = useMutation({
    mutationFn: () => criarRubrica(nova as any),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fin-rubricas"] }); toast.success("Rubrica criada"); setNova({ codigo: "", descricao: "", categoria: "Outros", ativo: true, ordem: 100, permite_edicao_manual: true, gera_documento: false, gera_exportacao: true }); },
    onError: (e: any) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, patch, antes }: { id: string; patch: Partial<FinRubrica>; antes: FinRubrica }) => atualizarRubrica(id, patch, antes),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fin-rubricas"] }); toast.success("Rubrica atualizada"); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: ({ id, antes }: { id: string; antes: FinRubrica }) => eliminarRubrica(id, antes),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fin-rubricas"] }); toast.success("Rubrica eliminada"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <PageContainer>
      <PageHeader title="Rubricas Financeiras" description="Catálogo central de tipos de pagamento e receita." />

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Nova rubrica</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-6">
          <div><Label>Código</Label><Input value={nova.codigo ?? ""} onChange={e => setNova(n => ({ ...n, codigo: e.target.value }))} /></div>
          <div className="sm:col-span-2"><Label>Descrição</Label><Input value={nova.descricao ?? ""} onChange={e => setNova(n => ({ ...n, descricao: e.target.value }))} /></div>
          <div>
            <Label>Categoria</Label>
            <select className="w-full border rounded-md h-9 px-3 text-sm bg-background"
              value={nova.categoria ?? "Outros"} onChange={e => setNova(n => ({ ...n, categoria: e.target.value }))}>
              {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div><Label>Ordem</Label><Input type="number" value={nova.ordem ?? 100} onChange={e => setNova(n => ({ ...n, ordem: Number(e.target.value) }))} /></div>
          <div className="flex items-end"><Button onClick={() => create.mutate()} disabled={!nova.codigo || !nova.descricao}><Plus className="size-4" /> Criar</Button></div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {(rubs.data ?? []).map(r => (
          <Card key={r.id}>
            <CardContent className="grid gap-3 sm:grid-cols-12 items-center py-4">
              <div className="sm:col-span-2 font-mono text-sm">{r.codigo}</div>
              <div className="sm:col-span-4">
                <Input defaultValue={r.descricao} onBlur={e => e.target.value !== r.descricao && update.mutate({ id: r.id, patch: { descricao: e.target.value }, antes: r })} />
              </div>
              <div className="sm:col-span-2">
                <select className="w-full border rounded-md h-9 px-3 text-sm bg-background"
                  defaultValue={r.categoria}
                  onChange={e => update.mutate({ id: r.id, patch: { categoria: e.target.value }, antes: r })}>
                  {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="sm:col-span-1 flex items-center gap-1"><Switch checked={r.ativo} onCheckedChange={v => update.mutate({ id: r.id, patch: { ativo: v }, antes: r })} /><span className="text-xs">Ativa</span></div>
              <div className="sm:col-span-1 flex items-center gap-1"><Switch checked={r.gera_documento} onCheckedChange={v => update.mutate({ id: r.id, patch: { gera_documento: v }, antes: r })} /><span className="text-xs">Documento</span></div>
              <div className="sm:col-span-1 flex items-center gap-1"><Switch checked={r.gera_exportacao} onCheckedChange={v => update.mutate({ id: r.id, patch: { gera_exportacao: v }, antes: r })} /><span className="text-xs">Exporta</span></div>
              <div className="sm:col-span-1 flex justify-end">
                <Button variant="ghost" size="icon" onClick={() => confirm(`Eliminar rubrica ${r.codigo}?`) && remove.mutate({ id: r.id, antes: r })}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!rubs.data?.length && <div className="text-muted-foreground text-sm">Sem rubricas.</div>}
      </div>
    </PageContainer>
  );
}
