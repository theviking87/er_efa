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
  abreviatura?: string | null;
  nif?: string | null;
  cc?: string | null;
  validade_cc?: string | null;
  data_nascimento?: string | null;
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

const COLORS = [
  // Vermelhos / rosas
  "#E11D48","#DC2626","#B91C1C","#F43F5E","#DB2777","#EC4899","#BE185D","#9D174D",
  // Laranjas / amarelos
  "#EA580C","#F97316","#FB923C","#D97706","#F59E0B","#FBBF24","#CA8A04","#A16207",
  // Verdes
  "#65A30D","#16A34A","#059669","#10B981","#22C55E","#15803D","#166534","#047857",
  // Cianos / azuis
  "#0891B2","#06B6D4","#0EA5E9","#2563EB","#3B82F6","#1D4ED8","#1E40AF","#0369A1",
  // Roxos / violetas
  "#7C3AED","#8B5CF6","#A855F7","#6D28D9","#5B21B6","#4F46E5","#4338CA","#3730A3",
  // Magentas / terra / neutros
  "#C026D3","#A21CAF","#86198F","#92400E","#78350F","#713F12","#525252","#404040",
];

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
        const { error } = await supabase.from("formadores").update(payload as never).eq("id", v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("formadores").insert(payload as never);
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
            <Input required {...field("nome")} onBlur={() => {
              if (!f.abreviatura && f.nome) {
                const parts = f.nome.trim().split(/\s+/);
                const abr = parts.length >= 2 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0];
                setF(s => ({ ...s, abreviatura: abr }));
              }
            }} />
          </div>
          <div className="space-y-1.5">
            <Label>Abreviatura <span className="text-xs text-muted-foreground font-normal">(ex.: João Silva — usada nos cronogramas)</span></Label>
            <Input {...field("abreviatura")} placeholder="Primeiro + último nome" />
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
            <div className="grid grid-cols-12 gap-1.5 pt-1.5">
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => setF({ ...f, cor: c })}
                  title={c}
                  className={`size-6 rounded-full border-2 transition ${f.cor === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ background: c }} />
              ))}
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Label className="text-xs font-normal text-muted-foreground">Personalizada:</Label>
              <input type="color" value={f.cor ?? "#000000"} onChange={e => setF({ ...f, cor: e.target.value })}
                className="h-7 w-12 rounded border border-input bg-background cursor-pointer" />
              <Input value={f.cor ?? ""} onChange={e => setF({ ...f, cor: e.target.value })}
                placeholder="#RRGGBB" className="h-7 w-24 text-xs font-mono" />
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
