
// ---------------- FORMANDOS TAB ----------------
function FormandosTab({ cursoId }: { cursoId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const data = useQuery({
    queryKey: ["curso-formandos", cursoId],
    queryFn: async () => {
      const { data, error } = await supabase.from("curso_formandos")
        .select("id, data_inscricao, estado, observacoes, formando:formandos(id, nome, email, telemovel, nif, estado)")
        .eq("curso_id", cursoId).order("data_inscricao", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function del(id: string) {
    const { error } = await supabase.from("curso_formandos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Inscrição removida");
    qc.invalidateQueries({ queryKey: ["curso-formandos", cursoId] });
  }

  async function setEstado(id: string, estado: string) {
    const { error } = await supabase.from("curso_formandos").update({ estado } as never).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["curso-formandos", cursoId] });
  }

  return (
    <Card><CardContent className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">{data.data?.length ?? 0} formandos inscritos</div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" /> Inscrever formando</Button>
      </div>
      {(data.data?.length ?? 0) === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">Sem formandos. Inscreva o primeiro.</div>
      ) : (
        <div className="border rounded-md divide-y">
          {(data.data ?? []).map((i: any) => (
            <div key={i.id} className="px-4 py-3 flex items-center gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <Link to="/formandos/$id" params={{ id: i.formando.id }} className="font-medium hover:underline truncate block">
                  {i.formando.nome}
                </Link>
                <div className="text-xs text-muted-foreground truncate">
                  {[i.formando.email, i.formando.telemovel, i.formando.nif && `NIF ${i.formando.nif}`].filter(Boolean).join(" · ") || "Sem contacto"}
                </div>
              </div>
              <Select value={i.estado} onValueChange={(v) => setEstado(i.id, v)}>
                <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(INSCRICAO_ESTADO_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground w-20 text-right">{fmtDate(i.data_inscricao)}</div>
              <Button variant="ghost" size="sm" onClick={() => del(i.id)}><Trash2 className="size-3.5" /></Button>
            </div>
          ))}
        </div>
      )}
      <InscreverFormandoDialog open={open} onOpenChange={setOpen} cursoId={cursoId} jaInscritos={new Set((data.data ?? []).map((i: any) => i.formando.id))} onSaved={() => qc.invalidateQueries({ queryKey: ["curso-formandos", cursoId] })} />
    </CardContent></Card>
  );
}

function InscreverFormandoDialog({ open, onOpenChange, cursoId, jaInscritos, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; cursoId: string; jaInscritos: Set<string>; onSaved: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [filtro, setFiltro] = useState("");

  const formandos = useQuery({
    queryKey: ["formandos-disponiveis"],
    queryFn: async () => (await supabase.from("formandos").select("id, nome, email, estado").eq("estado", "ativo").order("nome")).data ?? [],
    enabled: open,
  });

  const filtrados = (formandos.data ?? []).filter((f: any) =>
    !jaInscritos.has(f.id) && (!filtro || f.nome.toLowerCase().includes(filtro.toLowerCase()))
  );

  async function save() {
    if (selected.length === 0) return toast.error("Escolha pelo menos um formando");
    const rows = selected.map(fid => ({ curso_id: cursoId, formando_id: fid }));
    const { error } = await supabase.from("curso_formandos").insert(rows as never);
    if (error) return toast.error(error.message);
    toast.success(`${selected.length} formando(s) inscrito(s)`);
    setSelected([]); setFiltro("");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setSelected([]); setFiltro(""); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Inscrever formandos</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Procurar…" value={filtro} onChange={e => setFiltro(e.target.value)} />
          <div className="border rounded-md max-h-72 overflow-y-auto">
            {filtrados.length === 0 && <div className="px-3 py-6 text-xs text-muted-foreground text-center">Sem formandos disponíveis.</div>}
            {filtrados.map((f: any) => (
              <label key={f.id} className="flex items-center gap-2 text-sm px-3 py-2 border-b last:border-b-0 hover:bg-muted/40 cursor-pointer">
                <Checkbox checked={selected.includes(f.id)} onCheckedChange={(c) => setSelected(c ? [...selected, f.id] : selected.filter(x => x !== f.id))} />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{f.nome}</div>
                  {f.email && <div className="text-xs text-muted-foreground truncate">{f.email}</div>}
                </div>
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save}>Inscrever {selected.length > 0 && `(${selected.length})`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
