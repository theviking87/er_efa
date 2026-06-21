import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { ESTADO_FORMANDO_LABEL } from "@/lib/format";
import { toast } from "sonner";

type Formando = {
  id?: string;
  nome: string;
  nif?: string | null;
  cc?: string | null;
  validade_cc?: string | null;
  data_nascimento?: string | null;
  telemovel?: string | null;
  email?: string | null;
  morada?: string | null;
  codigo_postal?: string | null;
  localidade?: string | null;
  habilitacoes?: string | null;
  situacao_emprego?: string | null;
  niss?: string | null;
  observacoes?: string | null;
  estado?: string;
};

const EMPTY: Formando = { nome: "", estado: "ativo" };

export function FormandoDialog({
  open, onOpenChange, initial,
}: { open: boolean; onOpenChange: (v: boolean) => void; initial?: Formando | null }) {
  const [form, setForm] = useState<Formando>(EMPTY);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  useEffect(() => { if (open) setForm(initial ?? EMPTY); }, [open, initial]);

  const set = <K extends keyof Formando>(k: K, v: Formando[K]) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.nome.trim()) return toast.error("Nome obrigatório");
    setSaving(true);
    const payload: any = { ...form };
    Object.keys(payload).forEach(k => { if (payload[k] === "") payload[k] = null; });
    const { error } = form.id
      ? await supabase.from("formandos").update(payload).eq("id", form.id)
      : await supabase.from("formandos").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(form.id ? "Formando atualizado" : "Formando criado");
    qc.invalidateQueries({ queryKey: ["formandos"] });
    if (form.id) qc.invalidateQueries({ queryKey: ["formando", form.id] });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{form.id ? "Editar formando" : "Novo formando"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5"><Label>Nome *</Label><Input value={form.nome} onChange={e => set("nome", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>NIF</Label><Input value={form.nif ?? ""} onChange={e => set("nif", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>NISS</Label><Input value={form.niss ?? ""} onChange={e => set("niss", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Cartão de Cidadão</Label><Input value={form.cc ?? ""} onChange={e => set("cc", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Validade CC</Label><Input type="date" value={form.validade_cc ?? ""} onChange={e => set("validade_cc", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Data de nascimento</Label><Input type="date" value={form.data_nascimento ?? ""} onChange={e => set("data_nascimento", e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={form.estado ?? "ativo"} onValueChange={v => set("estado", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ESTADO_FORMANDO_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Telemóvel</Label><Input value={form.telemovel ?? ""} onChange={e => set("telemovel", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email ?? ""} onChange={e => set("email", e.target.value)} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Morada</Label><Input value={form.morada ?? ""} onChange={e => set("morada", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Código Postal</Label><Input value={form.codigo_postal ?? ""} onChange={e => set("codigo_postal", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Localidade</Label><Input value={form.localidade ?? ""} onChange={e => set("localidade", e.target.value)} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Habilitações</Label><Input value={form.habilitacoes ?? ""} onChange={e => set("habilitacoes", e.target.value)} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Situação face ao emprego</Label><Input value={form.situacao_emprego ?? ""} onChange={e => set("situacao_emprego", e.target.value)} placeholder="Empregado, Desempregado, Estudante…" /></div>
          <div className="col-span-2 space-y-1.5"><Label>Observações</Label><Textarea rows={3} value={form.observacoes ?? ""} onChange={e => set("observacoes", e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "A guardar…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
