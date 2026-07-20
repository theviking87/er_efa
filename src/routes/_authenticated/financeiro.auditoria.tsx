import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import UtilizadoresLocaisCard from "@/components/financeiro/utilizadores-card";

export const Route = createFileRoute("/_authenticated/financeiro/auditoria")({
  head: () => ({ meta: [{ title: "Financeiro — Auditoria" }] }),
  component: AuditoriaPage,
});

function AuditoriaPage() {
  const logs = useQuery({
    queryKey: ["fin-auditoria"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fin_auditoria")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  return (
    <PageContainer>
      <PageHeader title="Auditoria Financeira" description="Registo de operações e utilizadores locais para rastreabilidade." />
      <Tabs defaultValue="log" className="space-y-4">
        <TabsList>
          <TabsTrigger value="log">Registo de operações</TabsTrigger>
          <TabsTrigger value="utilizadores">Utilizadores Locais</TabsTrigger>
        </TabsList>
        <TabsContent value="log">
          <Card>
            <CardHeader><CardTitle className="text-base">{logs.data?.length ?? 0} registo(s)</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground border-b">
                    <tr>
                      <th className="py-2 pr-3">Data</th>
                      <th className="py-2 pr-3">Utilizador</th>
                      <th className="py-2 pr-3">Operação</th>
                      <th className="py-2 pr-3">Entidade</th>
                      <th className="py-2 pr-3">Campo</th>
                      <th className="py-2 pr-3">Antes</th>
                      <th className="py-2 pr-3">Depois</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(logs.data ?? []).map((r: any) => (
                      <tr key={r.id} className="border-b">
                        <td className="py-2 pr-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-PT")}</td>
                        <td className="py-2 pr-3">{r.nome_utilizador ?? "—"}</td>
                        <td className="py-2 pr-3"><Badge variant="secondary">{r.operacao}</Badge></td>
                        <td className="py-2 pr-3 text-xs">{r.entidade}</td>
                        <td className="py-2 pr-3 text-xs">{r.campo_alterado ?? "—"}</td>
                        <td className="py-2 pr-3 text-xs truncate max-w-[180px]">{r.valor_anterior ?? "—"}</td>
                        <td className="py-2 pr-3 text-xs truncate max-w-[180px]">{r.valor_novo ?? "—"}</td>
                      </tr>
                    ))}
                    {(logs.data ?? []).length === 0 && (
                      <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Sem registos.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="utilizadores">
          <UtilizadoresLocaisCard />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
