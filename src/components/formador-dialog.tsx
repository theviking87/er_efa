import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Formador = {
  id?: string;
  nome: string;
  nif?: string | null;
  cc?: string | null;
  validade_cc?: string | null;
  morada?: string | null;
  codigo_postal?: string | null;
  localidade?: string | null;
  telemovel?: string | null;
  email?: string | null;
  iban?: string | null;
  habilitacoes?: string | null;
  ccp?: string | null;
  validade_ccp?: string | null;
  observacoes?: string | null;
  estado?: string;
  cor?: string;
};

const COLORS = ["#E11D48","#2563EB","#059669","#D97706","#7C3AED","#0891B2","#DB2777","#65A30D","#DC2626","#4F46E5"];

export function FormadorDialog({
  open, onOpenChange, initial,
}: { open: boolean; onOpenChange: (v: boolean) => void; initial?: Formador }) {
  const qc = useQueryClient();
  const [f, setF] = useState<Formador>(initial ?? { nome: "", estado: "ativo", cor: COLORS[0] });

  useEffect(() => {
    if (open) setF(initial ?? { nome: "", estado: "ativo", cor: COLORS[Math.floor(Math.random() * COLORS.length)] });
  }, [open, initial]);

  const save = useMutation({
    mutationFn: async (v: Formador) => {
      const payload = { ...v };
      // empty strings -> null for date fields
      (["validade_cc","validade_ccp"] as const).forEach(k => { if (!payload[k]) payload[k] = null; });
      if (v.id) {
        const { error } = await supabase.from("formadores").update(payload).eq("id", v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("formadores").insert(payload as any);  // eslint-disable-line @typescript-eslint/no-explicit-any
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(initial?.id ? "Formador atualizado" : "Formador criado");
      qc.invalidateQueries({ queryKey: ["formadores"] });
      qc.invalidateQueries({ queryKey: ["formador"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error("Erro a guardar", { description: e.message }),
  });

  function field<K extends keyof Formador>(k: K) {
    return { value: (f[k] ?? "") as any, onChange: (e: any) => setF({ ...f, [k]: e.target.value }) };
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Editar formador" : "Novo formador"}</DialogTitle>
        </DialogHeader>
        <form
          id="formador-form"
          onSubmit={(e) => { e.preventDefault(); if (!f.nome.trim()) { toast.error("Nome obrigatório"); return; } save.mutate(f); }}
          className="grid grid-cols-2 gap-3"
        >
          <div className="col-span-2 space-y-1.5">
            <Label>Nome completo *</Label>
            <Input required {...field("nome")} />
          </div>
          <div className="space-y-1.5"><Label>NIF</Label><Input {...field("nif")} /></div>
          <div className="space-y-1.5"><Label>Cartão de Cidadão</Label><Input {...field("cc")} /></div>
          <div className="space-y-1.5"><Label>Validade CC</Label><Input type="date" {...field("validade_cc")} /></div>
          <div className="space-y-1.5"><Label>Telemóvel</Label><Input {...field("telemovel")} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input type="email" {...field("email")} /></div>
          <div className="space-y-1.5"><Label>IBAN</Label><Input {...field("iban")} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Morada</Label><Input {...field("morada")} /></div>
          <div className="space-y-1.5"><Label>Código Postal</Label><Input {...field("codigo_postal")} /></div>
          <div className="space-y-1.5"><Label>Localidade</Label><Input {...field("localidade")} /></div>
          <div className="space-y-1.5"><Label>CCP</Label><Input {...field("ccp")} /></div>
          <div className="space-y-1.5"><Label>Validade CCP</Label><Input type="date" {...field("validade_ccp")} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Habilitações</Label><Input {...field("habilitacoes")} /></div>
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={f.estado} onValueChange={v => setF({ ...f, estado: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
                <SelectItem value="ferias">Férias</SelectItem>
                <SelectItem value="baixa_medica">Baixa Médica</SelectItem>
                <SelectItem value="suspenso">Suspenso</SelectItem>
                <SelectItem value="arquivado">Arquivado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Cor (cronograma)</Label>
            <div className="flex gap-1.5 flex-wrap pt-1.5">
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => setF({ ...f, cor: c })}
                  className={`size-6 rounded-full border-2 transition ${f.cor === c ? "border-foreground" : "border-transparent"}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
          <div className="col-span-2 space-y-1.5"><Label>Observações</Label><Textarea {...field("observacoes")} rows={3} /></div>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" form="formador-form" disabled={save.isPending}>{save.isPending ? "A guardar…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
