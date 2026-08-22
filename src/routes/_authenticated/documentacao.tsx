import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export const Route = createFileRoute("/_authenticated/documentacao")({
  head: () => ({
    meta: [
      { title: "Gestão de Documentação — Formadores e Formandos" },
      {
        name: "description",
        content:
          "Matriz autónoma de documentação: controle os documentos entregues por formador e por formando, com estado Completo ou Pendente.",
      },
      { property: "og:title", content: "Gestão de Documentação" },
      {
        property: "og:description",
        content: "Controlo de documentos entregues por formador e formando.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DocumentacaoPage,
});

type Grupo = "formadores" | "formandos";
type Pessoa = { id: string; nome: string; vistos: Record<string, boolean> };
type GrupoDados = { documentos: string[]; pessoas: Pessoa[] };
type Dados = Record<Grupo, GrupoDados>;

const CHAVE = "gestao-documentacao";

function estruturaVazia(): Dados {
  return {
    formadores: { documentos: [], pessoas: [] },
    formandos: { documentos: [], pessoas: [] },
  };
}

function normalizar(raw: unknown): Dados {
  const base = estruturaVazia();
  const d = raw as Partial<Dados> | null;
  if (!d) return base;
  for (const g of ["formadores", "formandos"] as Grupo[]) {
    const grupo = d[g];
    if (!grupo) continue;
    base[g] = {
      documentos: Array.isArray(grupo.documentos) ? grupo.documentos.map(String) : [],
      pessoas: Array.isArray(grupo.pessoas)
        ? grupo.pessoas.map(p => ({
            id: String(p?.id ?? gerarId("p")),
            nome: String(p?.nome ?? ""),
            vistos: (p?.vistos ?? {}) as Record<string, boolean>,
          }))
        : [],
    };
  }
  return base;
}

function gerarId(prefixo: string) {
  return prefixo + Date.now() + Math.floor(Math.random() * 1000);
}

function pessoaCompleta(grupo: GrupoDados, pessoa: Pessoa) {
  if (grupo.documentos.length === 0) return false;
  return grupo.documentos.every(d => !!pessoa.vistos[d]);
}

function DocumentacaoPage() {
  const qc = useQueryClient();
  const [dados, setDados] = useState<Dados>(estruturaVazia());
  const [guardando, setGuardando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["documentacao-estado"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documentacao_estado")
        .select("dados")
        .eq("chave", CHAVE)
        .maybeSingle();
      if (error) throw error;
      return normalizar(data?.dados ?? null);
    },
  });

  useEffect(() => {
    if (data) setDados(data);
  }, [data]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function guardar(novos: Dados) {
    setDados(novos);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setGuardando(true);
      const { error } = await supabase
        .from("documentacao_estado")
        .upsert({ chave: CHAVE, dados: novos as never }, { onConflict: "chave" });
      setGuardando(false);
      if (error) toast.error("Erro ao guardar", { description: error.message });
      else qc.setQueryData(["documentacao-estado"], novos);
    }, 400);
  }

  function atualizarGrupo(grupo: Grupo, patch: (g: GrupoDados) => GrupoDados) {
    guardar({ ...dados, [grupo]: patch(dados[grupo]) });
  }

  function exportar() {
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-documentacao-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exportação concluída");
  }

  function importar(file: File) {
    const leitor = new FileReader();
    leitor.onload = e => {
      try {
        const novos = JSON.parse(String(e.target?.result)) as Partial<Dados>;
        if (!novos.formadores || !novos.formandos) {
          toast.error("Ficheiro inválido: estrutura não reconhecida.");
          return;
        }
        guardar(normalizar(novos));
        toast.success("Importação concluída");
      } catch (err) {
        toast.error("Erro ao ler o ficheiro", {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    };
    leitor.readAsText(file);
    if (importRef.current) importRef.current.value = "";
  }

  const resumo = useMemo(() => {
    let total = 0;
    let completos = 0;
    for (const g of ["formadores", "formandos"] as Grupo[]) {
      total += dados[g].pessoas.length;
      completos += dados[g].pessoas.filter(p => pessoaCompleta(dados[g], p)).length;
    }
    return { total, completos, pendentes: total - completos };
  }, [dados]);

  return (
    <PageContainer>
      <PageHeader
        title="Gestão de Documentação"
        description="Matriz autónoma de documentos entregues. Os formadores e formandos desta área são introduzidos manualmente e não estão ligados à Gestão de Formação."
        actions={
          <div className="flex items-center gap-2">
            {guardando && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) importar(f); }}
            />
            <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}>
              <Upload className="size-4" /> Importar
            </Button>
            <Button variant="outline" size="sm" onClick={exportar}>
              <Download className="size-4" /> Exportar
            </Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <Badge variant="secondary">{resumo.total} pessoa(s)</Badge>
        <span className="flex items-center gap-1.5 text-green-600">
          <CheckCircle2 className="size-4" /> {resumo.completos} completo(s)
        </span>
        <span className="flex items-center gap-1.5 text-amber-600">
          <AlertTriangle className="size-4" /> {resumo.pendentes} pendente(s)
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> A carregar documentação…
        </div>
      ) : (
        <Tabs defaultValue="formadores">
          <TabsList>
            <TabsTrigger value="formadores">Formadores</TabsTrigger>
            <TabsTrigger value="formandos">Formandos</TabsTrigger>
          </TabsList>
          <TabsContent value="formadores" className="mt-4">
            <GrupoPainel
              grupo="formadores"
              rotulo="Formador"
              dados={dados.formadores}
              onChange={patch => atualizarGrupo("formadores", patch)}
            />
          </TabsContent>
          <TabsContent value="formandos" className="mt-4">
            <GrupoPainel
              grupo="formandos"
              rotulo="Formando"
              dados={dados.formandos}
              onChange={patch => atualizarGrupo("formandos", patch)}
            />
          </TabsContent>
        </Tabs>
      )}
    </PageContainer>
  );
}

function GrupoPainel({
  grupo,
  rotulo,
  dados,
  onChange,
}: {
  grupo: Grupo;
  rotulo: string;
  dados: GrupoDados;
  onChange: (patch: (g: GrupoDados) => GrupoDados) => void;
}) {
  const [novaPessoa, setNovaPessoa] = useState<string>("");
  const [dialogPessoa, setDialogPessoa] = useState(false);
  const [novoDoc, setNovoDoc] = useState("");
  const [dialogDoc, setDialogDoc] = useState(false);
  const [pessoaAlvo, setPessoaAlvo] = useState<Pessoa | null>(null);
  const [docAlvo, setDocAlvo] = useState<string | null>(null);

  const completos = dados.pessoas.filter(p => pessoaCompleta(dados, p)).length;

  function adicionarPessoa() {
    const nome = novaPessoa.trim();
    if (!nome) return;
    const vistos: Record<string, boolean> = {};
    dados.documentos.forEach(d => { vistos[d] = false; });
    onChange(g => ({ ...g, pessoas: [...g.pessoas, { id: gerarId("p"), nome, vistos }] }));
    setNovaPessoa("");
    setDialogPessoa(false);
  }

  function adicionarDocumento() {
    const nome = novoDoc.trim();
    if (!nome) return;
    if (dados.documentos.includes(nome)) {
      toast.error("Já existe um documento com esse nome.");
      return;
    }
    onChange(g => ({
      documentos: [...g.documentos, nome],
      pessoas: g.pessoas.map(p => ({ ...p, vistos: { ...p.vistos, [nome]: false } })),
    }));
    setNovoDoc("");
    setDialogDoc(false);
  }

  function removerDocumento(nome: string) {
    onChange(g => ({
      documentos: g.documentos.filter(d => d !== nome),
      pessoas: g.pessoas.map(p => {
        const vistos = { ...p.vistos };
        delete vistos[nome];
        return { ...p, vistos };
      }),
    }));
    setDocAlvo(null);
  }

  function removerPessoa(id: string) {
    onChange(g => ({ ...g, pessoas: g.pessoas.filter(p => p.id !== id) }));
    setPessoaAlvo(null);
  }

  function alternarVisto(id: string, doc: string) {
    onChange(g => ({
      ...g,
      pessoas: g.pessoas.map(p =>
        p.id === id ? { ...p, vistos: { ...p.vistos, [doc]: !p.vistos[doc] } } : p,
      ),
    }));
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="text-sm text-muted-foreground">
            {completos}/{dados.pessoas.length} completo(s)
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setDialogDoc(true)}>
              <Plus className="size-4" /> Adicionar documento
            </Button>
            <Button size="sm" onClick={() => setDialogPessoa(true)}>
              <Plus className="size-4" /> Adicionar {rotulo}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">{rotulo}</TableHead>
                {dados.documentos.map(doc => (
                  <TableHead key={doc} className="text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      <span>{doc}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground hover:text-destructive"
                        aria-label={`Remover documento ${doc}`}
                        onClick={() => setDocAlvo(doc)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableHead>
                ))}
                <TableHead className="w-[120px]">Estado</TableHead>
                <TableHead className="w-[70px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.pessoas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={dados.documentos.length + 3} className="py-12 text-center">
                    <FileText className="mx-auto mb-2 size-7 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Sem {rotulo.toLowerCase()}es adicionados ainda.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                dados.pessoas.map(p => {
                  const completa = pessoaCompleta(dados, p);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.nome || "—"}</TableCell>
                      {dados.documentos.map(doc => (
                        <TableCell key={doc} className="text-center">
                          <Checkbox
                            checked={!!p.vistos[doc]}
                            aria-label={`${doc} — ${p.nome}`}
                            onCheckedChange={() => alternarVisto(p.id, doc)}
                          />
                        </TableCell>
                      ))}
                      <TableCell>
                        {completa ? (
                          <Badge className="bg-green-600 text-white hover:bg-green-600">Completo</Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-500 text-amber-600">
                            Pendente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          aria-label={`Eliminar ${p.nome}`}
                          onClick={() => setPessoaAlvo(p)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={dialogPessoa} onOpenChange={setDialogPessoa}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar {rotulo}</DialogTitle>
            <DialogDescription>Introduza o nome. Este registo é autónomo desta área.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`nome-${grupo}`}>Nome</Label>
            <Input
              id={`nome-${grupo}`}
              value={novaPessoa}
              autoFocus
              onChange={e => setNovaPessoa(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") adicionarPessoa(); }}
              placeholder="Nome completo"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogPessoa(false)}>Cancelar</Button>
            <Button onClick={adicionarPessoa} disabled={!novaPessoa.trim()}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogDoc} onOpenChange={setDialogDoc}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar documento</DialogTitle>
            <DialogDescription>
              O documento passa a ser uma coluna da tabela (ex: Cartão de Cidadão, CCP, Contrato).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`doc-${grupo}`}>Nome do documento</Label>
            <Input
              id={`doc-${grupo}`}
              value={novoDoc}
              autoFocus
              onChange={e => setNovoDoc(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") adicionarDocumento(); }}
              placeholder="Ex: Certificado"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogDoc(false)}>Cancelar</Button>
            <Button onClick={adicionarDocumento} disabled={!novoDoc.trim()}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pessoaAlvo} onOpenChange={open => { if (!open) setPessoaAlvo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem a certeza que pretende eliminar esta pessoa?</AlertDialogTitle>
            <AlertDialogDescription>
              Serão removidos o registo e todos os respetivos estados documentais.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => { e.preventDefault(); if (pessoaAlvo) removerPessoa(pessoaAlvo.id); }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!docAlvo} onOpenChange={open => { if (!open) setDocAlvo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar o documento "{docAlvo}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Os vistos deste documento serão perdidos em todas as pessoas deste grupo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => { e.preventDefault(); if (docAlvo) removerDocumento(docAlvo); }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
