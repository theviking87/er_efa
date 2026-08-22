import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2, History as HistoryIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageContainer, PageHeader } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/contratos/historico")({
  head: () => ({
    meta: [
      { title: "Histórico de Contratos — Gestão de Formação" },
      {
        name: "description",
        content: "Consulte e faça a gestão dos contratos gerados através da aplicação, com data, formador e UFCD.",
      },
      { property: "og:title", content: "Histórico de Contratos" },
      { property: "og:description", content: "Registo dos contratos gerados na aplicação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoricoContratosPage,
});

type Registo = {
  id: string;
  tipo_contrato: string;
  data_geracao: string;
  nome_formador: string;
  ufcd: string;
};

function formatDataHora(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function HistoricoContratosPage() {
  const qc = useQueryClient();
  const [alvo, setAlvo] = useState<Registo | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["contratos-historico"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratos_historico")
        .select("id, tipo_contrato, data_geracao, nome_formador, ufcd")
        .order("data_geracao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Registo[];
    },
  });

  const eliminar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contratos_historico").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registo eliminado");
      setAlvo(null);
      qc.invalidateQueries({ queryKey: ["contratos-historico"] });
    },
    onError: (e) => toast.error("Erro ao eliminar", { description: e instanceof Error ? e.message : "Erro desconhecido" }),
  });

  const registos = data ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="Histórico de Contratos"
        description="Registo dos contratos gerados através da aplicação. Os ficheiros Word não são guardados."
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> A carregar histórico…
            </div>
          ) : registos.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <HistoryIcon className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Ainda não existem contratos no histórico.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[170px]">Data</TableHead>
                  <TableHead className="w-[220px]">Nome</TableHead>
                  <TableHead>UFCD / Curso</TableHead>
                  <TableHead className="w-[90px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registos.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDataHora(r.data_geracao)}
                      <Badge variant="secondary" className="ml-2 text-[10px]">{r.tipo_contrato}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{r.nome_formador}</TableCell>
                    <TableCell className="text-sm text-muted-foreground break-words">{r.ufcd || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar registo"
                        className="text-destructive"
                        disabled={eliminar.isPending && alvo?.id === r.id}
                        onClick={() => setAlvo(r)}
                      >
                        {eliminar.isPending && alvo?.id === r.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!alvo} onOpenChange={open => { if (!open && !eliminar.isPending) setAlvo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem a certeza que pretende eliminar este registo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é definitiva e não pode ser revertida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminar.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={eliminar.isPending}
              onClick={e => { e.preventDefault(); if (alvo) eliminar.mutate(alvo.id); }}
            >
              {eliminar.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
