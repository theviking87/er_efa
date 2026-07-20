import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, Check } from "lucide-react";
import { listarUtilizadores, criarUtilizador, atualizarUtilizador, eliminarUtilizador } from "@/lib/financeiro/services/utilizadores";
import { getUtilizadorAtivo, setUtilizadorAtivo } from "@/lib/financeiro/current-user";
import type { FinUtilizador } from "@/lib/financeiro/types";

export const Route = createFileRoute("/_authenticated/financeiro/utilizadores")({
  head: () => ({ meta: [{ title: "Financeiro — Utilizadores" }] }),
  component: UtilizadoresPage,
});

const PERFIS = ["administrador", "operador", "consulta"];

function UtilizadoresPage() {
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["fin-utilizadores"], queryFn: listarUtilizadores });
  const [ativoId, setAtivoId] = useState<string | null>(null);

  useEffect(() => { setAtivoId(getUtilizadorAtivo().id); }, []);

  const [nova, setNova] = useState<Partial<FinUtilizador>>({ nome: "", nome_utilizador: "", perfil: "operador", ativo: true });

  const create = useMutation({
    mutationFn: () => criarUtilizador(nova as any),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fin-utilizadores"] }); toast.success("Utilizador criado"); setNova({ nome: "", nome_utilizador: "", perfil: "operador", ativo: true }); },
    onError: (e: any) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: ({ id, patch, antes }: { id: string; patch: Partial<FinUtilizador>; antes: FinUtilizador }) => atualizarUtilizador(id, patch, antes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fin-utilizadores"] }),
    onError: (e: any) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: ({ id, antes }: { id: string; antes: FinUtilizador }) => eliminarUtilizador(id, antes),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fin-utilizadores"] }); toast.success("Utilizador eliminado"); },
    onError: (e: any) => toast.error(e.message),
  });

  function activate(u: FinUtilizador) {
    setUtilizadorAtivo(u);
    setAtivoId(u.id);
    toast.success(`Sessão financeira: ${u.nome_utilizador}`);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Utilizadores Locais (Financeiro)"
        description="Identificação usada nos registos de auditoria — independente do login geral."
      />

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Novo utilizador</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-5">
          <div><Label>Nome</Label><Input value={nova.nome ?? ""} onChange={e => setNova(n => ({ ...n, nome: e.target.value }))} /></div>
          <div><Label>Nome de utilizador</Label><Input value={nova.nome_utilizador ?? ""} onChange={e => setNova(n => ({ ...n, nome_utilizador: e.target.value }))} /></div>
          <div>
            <Label>Perfil</Label>
            <select className="w-full border rounded-md h-9 px-3 text-sm bg-background"
              value={nova.perfil ?? "operador"} onChange={e => setNova(n => ({ ...n, perfil: e.target.value }))}>
              {PERFIS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 mt-6"><Switch checked={!!nova.ativo} onCheckedChange={v => setNova(n => ({ ...n, ativo: v }))} /><Label>Ativo</Label></div>
          <div className="flex items-end"><Button onClick={() => create.mutate()} disabled={!nova.nome || !nova.nome_utilizador}><Plus className="size-4" /> Criar</Button></div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {(users.data ?? []).map(u => (
          <Card key={u.id} className={ativoId === u.id ? "border-primary/60 bg-primary/5" : ""}>
            <CardContent className="grid gap-3 sm:grid-cols-8 items-center py-4">
              <div className="sm:col-span-2"><Input defaultValue={u.nome} onBlur={e => e.target.value !== u.nome && update.mutate({ id: u.id, patch: { nome: e.target.value }, antes: u })} /></div>
              <div className="sm:col-span-2"><Input defaultValue={u.nome_utilizador} onBlur={e => e.target.value !== u.nome_utilizador && update.mutate({ id: u.id, patch: { nome_utilizador: e.target.value }, antes: u })} /></div>
              <div>
                <select className="w-full border rounded-md h-9 px-3 text-sm bg-background"
                  defaultValue={u.perfil}
                  onChange={e => update.mutate({ id: u.id, patch: { perfil: e.target.value }, antes: u })}>
                  {PERFIS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2"><Switch checked={u.ativo} onCheckedChange={v => update.mutate({ id: u.id, patch: { ativo: v }, antes: u })} /><span className="text-xs">Ativo</span></div>
              <div className="flex justify-end gap-1">
                <Button size="sm" variant={ativoId === u.id ? "default" : "outline"} onClick={() => activate(u)}>
                  <Check className="size-4" /> {ativoId === u.id ? "Ativo" : "Usar"}
                </Button>
              </div>
              <div className="flex justify-end">
                <Button variant="ghost" size="icon" onClick={() => confirm(`Eliminar ${u.nome_utilizador}?`) && remove.mutate({ id: u.id, antes: u })}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!users.data?.length && <div className="text-muted-foreground text-sm">Sem utilizadores.</div>}
      </div>
    </PageContainer>
  );
}
