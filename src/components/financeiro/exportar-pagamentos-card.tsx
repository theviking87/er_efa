import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { exportPagamentosGlobal } from "@/lib/financeiro/excel-pagamentos-global";

export function ExportarPagamentosCard() {
  const hoje = new Date();
  const atual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const [de, setDe] = useState(`${hoje.getFullYear()}-01`);
  const [ate, setAte] = useState(atual);
  const [curso, setCurso] = useState("");
  const [busy, setBusy] = useState(false);

  const cursos = useQuery({
    queryKey: ["cursos-export-pag"],
    queryFn: async () => (await supabase.from("cursos").select("id, codigo, nome").order("codigo")).data ?? [],
  });

  async function gerar() {
    if (!de || !ate || de > ate) { toast.error("Período inválido."); return; }
    setBusy(true);
    try {
      const n = await exportPagamentosGlobal({ de, ate, cursoId: curso || null });
      toast.success(`Gerado: ${n}`);
    } catch (e: any) {
      toast.error(e.message ?? "Erro a gerar o Excel.");
    } finally { setBusy(false); }
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Exportar pagamentos (Excel)</CardTitle>
        <p className="text-xs text-muted-foreground">Formadores por mês, por curso e por UFCD; formandos por rubrica e mês. Inclui rascunhos e fechados.</p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
        <div className="space-y-1"><Label>De (mês)</Label><Input type="month" value={de} onChange={e => setDe(e.target.value)} /></div>
        <div className="space-y-1"><Label>Até (mês)</Label><Input type="month" value={ate} onChange={e => setAte(e.target.value)} /></div>
        <div className="space-y-1">
          <Label>Curso</Label>
          <select className="w-full h-9 text-sm border border-input rounded-md px-2 bg-background" value={curso} onChange={e => setCurso(e.target.value)}>
            <option value="">Todos os cursos</option>
            {(cursos.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>)}
          </select>
        </div>
        <Button onClick={gerar} disabled={busy}><FileSpreadsheet className="size-4" />{busy ? "A gerar…" : "Gerar Excel"}</Button>
      </CardContent>
    </Card>
  );
}
