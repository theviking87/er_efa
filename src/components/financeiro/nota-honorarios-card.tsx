import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { paintBeforeHeavyWork } from "@/lib/dom-helpers";


export function NotaHonorariosCard() {
  const [tipoFormador, setTipoFormador] = useState<"registado" | "externo">("registado");
  const [formadorId, setFormadorId] = useState("");
  const now = new Date();
  const [modo, setModo] = useState<"mes" | "ufcd">("mes");
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ufcdId, setUfcdId] = useState<string>("");

  const [valorHora, setValorHora] = useState<string>("15");
  const [retencao, setRetencao] = useState<string>("23");
  const [dataEmissao, setDataEmissao] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [aplicarIva, setAplicarIva] = useState(false);
  const [iva, setIva] = useState<string>("23");
  const [destNome, setDestNome] = useState("");
  const [destNif, setDestNif] = useState("");
  const [destMorada, setDestMorada] = useState("");
  const [numero, setNumero] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [busy, setBusy] = useState(false);

  const [extNome, setExtNome] = useState("");
  const [extNif, setExtNif] = useState("");
  const [extMorada, setExtMorada] = useState("");
  const [extCp, setExtCp] = useState("");
  const [extLocalidade, setExtLocalidade] = useState("");
  const [extEmail, setExtEmail] = useState("");
  const [extIban, setExtIban] = useState("");
  const [extHoras, setExtHoras] = useState<string>("");
  const [extDescricao, setExtDescricao] = useState<string>("Prestação de serviços de formação");
  const [extModoValor, setExtModoValor] = useState<"hora" | "total">("hora");
  const [extValorTotal, setExtValorTotal] = useState<string>("");

  const formadores = useQuery({
    enabled: tipoFormador === "registado",
    queryKey: ["formadores-nomes"],
    queryFn: async () => (await supabase.from("formadores").select("id, nome").order("nome")).data ?? [],
  });

  const formadorDet = useQuery({
    enabled: tipoFormador === "registado" && !!formadorId,
    queryKey: ["formador-det", formadorId],
    queryFn: async () => (await supabase.from("formadores").select("*").eq("id", formadorId).maybeSingle()).data,
  });

  const preview = useQuery({
    enabled: tipoFormador === "registado" && !!formadorId && (modo === "mes" || !!ufcdId),
    queryKey: ["nh-preview", formadorId, modo, ano, mes, ufcdId],
    queryFn: async () => {
      let q = supabase.from("sessoes")
        .select("data, hora_inicio, hora_fim, horas, curso_id, curso_ufcd_id")
        .eq("formador_id", formadorId);
      if (modo === "mes") {
        const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
        const fimDate = new Date(ano, mes, 0);
        const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(fimDate.getDate()).padStart(2, "0")}`;
        q = q.gte("data", inicio).lte("data", fim);
      }
      const { data: sess } = await q.order("data").order("hora_inicio");
      let sessoes = sess ?? [];
      const cufIds = Array.from(new Set(sessoes.map((s: any) => s.curso_ufcd_id).filter(Boolean)));
      const { data: cufs } = cufIds.length
        ? await supabase.from("curso_ufcds").select("id, ufcd_id, curso_id").in("id", cufIds)
        : { data: [] as any[] };
      const cufMap = new Map((cufs ?? []).map((c: any) => [c.id, c]));
      const ufcdIds = Array.from(new Set((cufs ?? []).map((c: any) => c.ufcd_id).filter(Boolean)));
      const { data: ufcds } = ufcdIds.length
        ? await supabase.from("ufcds").select("id, codigo, designacao").in("id", ufcdIds)
        : { data: [] as any[] };
      const ufcdMap = new Map((ufcds ?? []).map((u: any) => [u.id, u]));
      const cursoIds = Array.from(new Set(sessoes.map((s: any) => s.curso_id).filter(Boolean)));
      const { data: cursos } = cursoIds.length
        ? await supabase.from("cursos").select("id, codigo, nome").in("id", cursoIds)
        : { data: [] as any[] };
      const cursoMap = new Map((cursos ?? []).map((c: any) => [c.id, c]));
      if (modo === "ufcd" && ufcdId) {
        sessoes = sessoes.filter((s: any) => cufMap.get(s.curso_ufcd_id)?.ufcd_id === ufcdId);
      }
      return { sessoes, cufMap, ufcdMap, cursoMap };
    },
  });

  const ufcdsDisponiveis = useQuery({
    enabled: tipoFormador === "registado" && !!formadorId,
    queryKey: ["ufcds-formador", formadorId, modo, ano, mes],
    queryFn: async () => {
      let q = supabase.from("sessoes").select("curso_ufcd_id").eq("formador_id", formadorId);
      if (modo === "mes") {
        const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
        const fimDate = new Date(ano, mes, 0);
        const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(fimDate.getDate()).padStart(2, "0")}`;
        q = q.gte("data", inicio).lte("data", fim);
      }
      const { data: sess } = await q;
      const cufIds = Array.from(new Set((sess ?? []).map((s: any) => s.curso_ufcd_id).filter(Boolean)));
      if (!cufIds.length) return [];
      const { data: cufs } = await supabase.from("curso_ufcds").select("id, ufcd_id").in("id", cufIds);
      const ufcdIds = Array.from(new Set((cufs ?? []).map((c: any) => c.ufcd_id)));
      if (!ufcdIds.length) return [];
      const { data: ufcds } = await supabase.from("ufcds").select("id, codigo, designacao").in("id", ufcdIds).order("codigo");
      return ufcds ?? [];
    },
  });

  async function gerar() {
    const vh = parseFloat(valorHora.replace(",", ".")) || 0;
    const vTotal = parseFloat(extValorTotal.replace(",", ".")) || 0;
    if (tipoFormador === "externo") {
      if (!extNome.trim()) { toast.error("Nome do formador obrigatório"); return; }
      if (extModoValor === "total") {
        if (!vTotal || vTotal <= 0) { toast.error("Valor total inválido"); return; }
      } else {
        if (!vh || vh <= 0) { toast.error("Valor/hora inválido"); return; }
        const h = parseFloat(extHoras.replace(",", "."));
        if (!h || h <= 0) { toast.error("Horas inválidas"); return; }
      }
    } else {
      if (!vh || vh <= 0) { toast.error("Valor/hora inválido"); return; }
      if (!formadorId) { toast.error("Escolha um formador"); return; }
      if (modo === "ufcd" && !ufcdId) { toast.error("Escolha uma UFCD"); return; }
    }
    try {
      setBusy(true);
      await paintBeforeHeavyWork();
      const { exportNotaHonorariosPdf } = await import("@/lib/pdf-exports");
      await exportNotaHonorariosPdf({
        modo: tipoFormador === "externo" ? "avulso" : modo,
        formadorId: tipoFormador === "registado" ? formadorId : undefined,
        ano: tipoFormador === "registado" && modo === "mes" ? ano : undefined,
        mes: tipoFormador === "registado" && modo === "mes" ? mes : undefined,
        ufcdId: tipoFormador === "registado" ? (modo === "ufcd" ? ufcdId : (ufcdId || null)) : undefined,
        valorHora: vh,
        retencaoIrs: parseFloat(retencao.replace(",", ".")) || 0,
        iva: aplicarIva ? (parseFloat(iva.replace(",", ".")) || 0) : 0,
        aplicarIva,
        numero: numero || undefined,
        dataEmissao: dataEmissao || undefined,
        destinatario: (destNome || destNif || destMorada) ? { nome: destNome, nif: destNif, morada: destMorada } : undefined,
        observacoes: observacoes || undefined,
        formadorExterno: tipoFormador === "externo" ? {
          nome: extNome, nif: extNif, morada: extMorada, codigo_postal: extCp,
          localidade: extLocalidade, email: extEmail, iban: extIban,
        } : undefined,
        horasAvulso: tipoFormador === "externo" ? (parseFloat(extHoras.replace(",", ".")) || 0) : undefined,
        descricaoAvulso: tipoFormador === "externo" ? extDescricao : undefined,
        valorTotalAvulso: tipoFormador === "externo" && extModoValor === "total" ? vTotal : undefined,
      });
      toast.success("Nota de honorários gerada");
    } catch (e: any) {
      toast.error("Erro ao gerar", { description: e.message });
    } finally {
      setBusy(false);
    }
  }

  const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const anos = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <FileText className="size-4" /> Nota de honorários (formador)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Gera um PDF de nota de honorários. Escolha um <strong>formador registado</strong> (agrega sessões da base de dados) ou um <strong>formador externo</strong> (prestação única, sem histórico). Os logótipos e dados da empresa vêm da <em>Configuração Financeira</em>.
        </p>

        <div className="inline-flex rounded-md border border-input bg-background p-0.5 text-sm">
          <button type="button" onClick={() => setTipoFormador("registado")}
            className={`px-3 py-1.5 rounded ${tipoFormador === "registado" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>Formador registado</button>
          <button type="button" onClick={() => setTipoFormador("externo")}
            className={`px-3 py-1.5 rounded ${tipoFormador === "externo" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>Formador externo (prestação única)</button>
        </div>

        {tipoFormador === "externo" ? (
          <div className="grid gap-3 md:grid-cols-4 rounded-md border p-3 bg-muted/20">
            <div className="space-y-1.5 md:col-span-2"><Label>Nome do formador *</Label><Input value={extNome} onChange={e => setExtNome(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>NIF</Label><Input value={extNif} onChange={e => setExtNif(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>IBAN</Label><Input value={extIban} onChange={e => setExtIban(e.target.value)} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label>Morada</Label><Input value={extMorada} onChange={e => setExtMorada(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Código Postal</Label><Input value={extCp} onChange={e => setExtCp(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Localidade</Label><Input value={extLocalidade} onChange={e => setExtLocalidade(e.target.value)} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label>Email</Label><Input type="email" value={extEmail} onChange={e => setExtEmail(e.target.value)} /></div>
            <div className="space-y-1.5 md:col-span-4"><Label>Descrição da prestação</Label><Input value={extDescricao} onChange={e => setExtDescricao(e.target.value)} /></div>
            <div className="md:col-span-4">
              <div className="inline-flex rounded-md border border-input bg-background p-0.5 text-xs">
                <button type="button" onClick={() => setExtModoValor("hora")}
                  className={`px-3 py-1 rounded ${extModoValor === "hora" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>Valor por hora</button>
                <button type="button" onClick={() => setExtModoValor("total")}
                  className={`px-3 py-1 rounded ${extModoValor === "total" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>Valor total (avença)</button>
              </div>
            </div>
            {extModoValor === "hora" ? (
              <>
                <div className="space-y-1.5"><Label>Horas ministradas *</Label><Input type="number" step="0.01" min="0" value={extHoras} onChange={e => setExtHoras(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Valor / hora (€) *</Label><Input type="number" step="0.01" min="0" value={valorHora} onChange={e => setValorHora(e.target.value)} /></div>
              </>
            ) : (
              <>
                <div className="space-y-1.5"><Label>Horas (opcional)</Label><Input type="number" step="0.01" min="0" value={extHoras} onChange={e => setExtHoras(e.target.value)} placeholder="—" /></div>
                <div className="space-y-1.5"><Label>Valor total (€) *</Label><Input type="number" step="0.01" min="0" value={extValorTotal} onChange={e => setExtValorTotal(e.target.value)} /></div>
              </>
            )}
            <div className="space-y-1.5"><Label>Retenção IRS (%)</Label><Input type="number" step="0.01" min="0" max="100" value={retencao} onChange={e => setRetencao(e.target.value)} /></div>
          </div>
        ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Formador *</Label>
              <Select value={formadorId} onValueChange={(v) => { setFormadorId(v); setUfcdId(""); }}>
                <SelectTrigger><SelectValue placeholder="Escolher formador…" /></SelectTrigger>
                <SelectContent>{(formadores.data ?? []).map((f: any) => (<SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Filtrar por *</Label>
              <Select value={modo} onValueChange={(v: "mes" | "ufcd") => { setModo(v); setUfcdId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mes">Mês</SelectItem>
                  <SelectItem value="ufcd">UFCD ministrada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {modo === "mes" ? (
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5"><Label>Mês *</Label>
                <Select value={String(mes)} onValueChange={(v) => setMes(parseInt(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{meses.map((m, i) => <SelectItem key={i} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Ano *</Label>
                <Select value={String(ano)} onValueChange={(v) => setAno(parseInt(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{anos.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Valor / hora (€) *</Label><Input type="number" step="0.01" min="0" value={valorHora} onChange={e => setValorHora(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Retenção IRS (%)</Label><Input type="number" step="0.01" min="0" max="100" value={retencao} onChange={e => setRetencao(e.target.value)} /></div>
              <div className="space-y-1.5 md:col-span-4">
                <Label>UFCD (opcional — filtra dentro do mês)</Label>
                <Select value={ufcdId || "__all__"} onValueChange={(v) => setUfcdId(v === "__all__" ? "" : v)} disabled={!formadorId}>
                  <SelectTrigger><SelectValue placeholder="Todas as UFCD do mês" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas as UFCD do mês</SelectItem>
                    {(ufcdsDisponiveis.data ?? []).map((u: any) => (<SelectItem key={u.id} value={u.id}>{u.codigo} — {u.designacao}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5 md:col-span-3">
                <Label>UFCD ministrada *</Label>
                <Select value={ufcdId} onValueChange={setUfcdId} disabled={!formadorId}>
                  <SelectTrigger><SelectValue placeholder="Escolher UFCD…" /></SelectTrigger>
                  <SelectContent>{(ufcdsDisponiveis.data ?? []).map((u: any) => (<SelectItem key={u.id} value={u.id}>{u.codigo} — {u.designacao}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Valor / hora (€) *</Label><Input type="number" step="0.01" min="0" value={valorHora} onChange={e => setValorHora(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Retenção IRS (%)</Label><Input type="number" step="0.01" min="0" max="100" value={retencao} onChange={e => setRetencao(e.target.value)} /></div>
            </div>
          )}
        </>
        )}

        <div className="grid gap-3 md:grid-cols-3 items-end rounded-md border p-3 bg-muted/30">
          <div className="flex items-center gap-2 md:col-span-1">
            <input id="aplicar-iva" type="checkbox" className="size-4" checked={aplicarIva} onChange={e => setAplicarIva(e.target.checked)} />
            <Label htmlFor="aplicar-iva" className="cursor-pointer">Acrescer IVA (recibo com IVA)</Label>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Taxa de IVA (%)</Label>
            <Input type="number" step="0.01" min="0" max="100" value={iva} onChange={e => setIva(e.target.value)} disabled={!aplicarIva} />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5"><Label>Nº da nota (opcional)</Label><Input placeholder="Auto se vazio" value={numero} onChange={e => setNumero(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Destinatário — Nome</Label><Input value={destNome} onChange={e => setDestNome(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Destinatário — NIF</Label><Input value={destNif} onChange={e => setDestNif(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Destinatário — Morada</Label><Input value={destMorada} onChange={e => setDestMorada(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Data de emissão</Label><Input type="date" value={dataEmissao} onChange={e => setDataEmissao(e.target.value)} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label>Observações</Label><Input value={observacoes} onChange={e => setObservacoes(e.target.value)} /></div>
        </div>

        {(() => {
          const isExt = tipoFormador === "externo";
          const vh = parseFloat(valorHora.replace(",", ".")) || 0;
          const retPct = parseFloat(retencao.replace(",", ".")) || 0;
          const ivaPct = aplicarIva ? (parseFloat(iva.replace(",", ".")) || 0) : 0;
          const sessoes = isExt ? [] : (preview.data?.sessoes ?? []);
          const horasExt = parseFloat((extHoras || "0").replace(",", ".")) || 0;
          const totalExt = parseFloat((extValorTotal || "0").replace(",", ".")) || 0;
          const usaTotalExt = isExt && extModoValor === "total" && totalExt > 0;
          const totalHoras = isExt ? horasExt : sessoes.reduce((a: number, s: any) => a + Number(s.horas || 0), 0);
          const subtotal = usaTotalExt ? totalExt : totalHoras * vh;
          const ivaVal = subtotal * (ivaPct / 100);
          const ret = subtotal * (retPct / 100);
          const total = subtotal + ivaVal - ret;
          const ufcdSel = !isExt && modo === "ufcd" && ufcdId ? preview.data?.ufcdMap.get(ufcdId) : null;
          const periodoLabel = isExt
            ? `Prestação de serviços — ${fmtDate(dataEmissao)}`
            : modo === "mes" ? `${meses[mes-1]} ${ano}` : (ufcdSel ? `UFCD ${ufcdSel.codigo} — ${ufcdSel.designacao}` : "UFCD");
          const numSuf = isExt
            ? (dataEmissao || "").replace(/-/g,"")
            : modo === "mes" ? `${ano}${String(mes).padStart(2,"0")}` : (ufcdSel ? String(ufcdSel.codigo).replace(/\s+/g,"") : "UFCD");
          const form: any = isExt
            ? { nome: extNome, nif: extNif, morada: extMorada, codigo_postal: extCp, localidade: extLocalidade, email: extEmail, iban: extIban }
            : (formadorDet.data ?? {});
          const nDoc = numero || ((isExt ? extNome : formadorId) ? `NH-${numSuf}-${String(form.nome || "").replace(/\s+/g,"").slice(0,4).toUpperCase()}` : "NH-…");
          const fmtEUR = (v: number) => `${v.toFixed(2).replace(".", ",")} €`;
          return (
            <div className="mt-2 rounded-lg border-2 border-emerald-700/40 bg-emerald-50 dark:bg-emerald-950/30 p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between border-b-2 border-emerald-700/40 pb-2">
                <div>
                  <div className="text-xs uppercase tracking-wider text-emerald-900/70 dark:text-emerald-200/70">Pré-visualização</div>
                  <div className="text-lg font-bold text-emerald-900 dark:text-emerald-100">NOTA DE HONORÁRIOS</div>
                </div>
                <div className="text-right text-xs text-emerald-900/80 dark:text-emerald-200/80">
                  <div><span className="font-semibold">Nº</span> {nDoc}</div>
                  <div><span className="font-semibold">Data:</span> {fmtDate(dataEmissao)}</div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 text-xs text-emerald-950 dark:text-emerald-50">
                <div>
                  <div className="font-semibold uppercase text-[10px] tracking-wider text-emerald-900/60 dark:text-emerald-200/60 mb-1">Emitente</div>
                  <div className="font-medium">{form.nome || "—"}</div>
                  {form.nif && <div>NIF: {form.nif}</div>}
                  {form.morada && <div>{form.morada}</div>}
                  {(form.codigo_postal || form.localidade) && <div>{`${form.codigo_postal ?? ""} ${form.localidade ?? ""}`.trim()}</div>}
                  {form.email && <div>{form.email}</div>}
                  {form.iban && <div>IBAN: {form.iban}</div>}
                </div>
                <div>
                  <div className="font-semibold uppercase text-[10px] tracking-wider text-emerald-900/60 dark:text-emerald-200/60 mb-1">Destinatário</div>
                  <div className="font-medium">{destNome || "—"}</div>
                  {destNif && <div>NIF: {destNif}</div>}
                  {destMorada && <div>{destMorada}</div>}
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-emerald-700/30 text-xs text-emerald-950 dark:text-emerald-50">
                <div className="flex justify-between font-semibold">
                  <span>Período: {periodoLabel}</span>
                  <span>{isExt ? "Prestação única" : `${sessoes.length} sessão(ões)`}</span>
                </div>
              </div>
              <div className="mt-2 max-h-56 overflow-auto rounded border border-emerald-700/20 bg-white/60 dark:bg-emerald-950/40">
                {isExt ? (
                  <table className="w-full text-[11px]">
                    <thead className="bg-emerald-700/10 text-emerald-900 dark:text-emerald-100">
                      <tr><th className="text-left px-2 py-1">Descrição</th><th className="text-right px-2 py-1">Horas</th><th className="text-right px-2 py-1">V/h</th><th className="text-right px-2 py-1">Total</th></tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-emerald-700/10">
                        <td className="px-2 py-1">{extDescricao || "Prestação de serviços de formação"}</td>
                        <td className="px-2 py-1 text-right">{usaTotalExt && horasExt === 0 ? "—" : `${horasExt.toFixed(2)}h`}</td>
                        <td className="px-2 py-1 text-right">{usaTotalExt ? "—" : fmtEUR(vh)}</td>
                        <td className="px-2 py-1 text-right font-semibold">{fmtEUR(subtotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead className="bg-emerald-700/10 text-emerald-900 dark:text-emerald-100">
                      <tr>
                        <th className="text-left px-2 py-1">Data</th><th className="text-left px-2 py-1">Curso</th>
                        <th className="text-left px-2 py-1">UFCD</th><th className="text-left px-2 py-1">Horário</th>
                        <th className="text-right px-2 py-1">Horas</th><th className="text-right px-2 py-1">V/h</th>
                        <th className="text-right px-2 py-1">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessoes.length === 0 ? (
                        <tr><td colSpan={7} className="text-center px-2 py-3 text-emerald-900/60 dark:text-emerald-200/60">Sem sessões no período</td></tr>
                      ) : sessoes.map((s: any, i: number) => {
                        const cuf = preview.data?.cufMap.get(s.curso_ufcd_id);
                        const ufcd = cuf ? preview.data?.ufcdMap.get(cuf.ufcd_id) : null;
                        const curso = preview.data?.cursoMap.get(s.curso_id);
                        return (
                          <tr key={i} className="border-t border-emerald-700/10">
                            <td className="px-2 py-1">{fmtDate(s.data)}</td>
                            <td className="px-2 py-1">{curso?.nome ?? ""}</td>
                            <td className="px-2 py-1 truncate max-w-[180px]">{ufcd ? `${ufcd.codigo} — ${ufcd.designacao}` : ""}</td>
                            <td className="px-2 py-1">{(s.hora_inicio ?? "").slice(0,5)}–{(s.hora_fim ?? "").slice(0,5)}</td>
                            <td className="px-2 py-1 text-right">{Number(s.horas).toFixed(2)}h</td>
                            <td className="px-2 py-1 text-right">{fmtEUR(vh)}</td>
                            <td className="px-2 py-1 text-right font-semibold">{fmtEUR(Number(s.horas) * vh)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="mt-3 flex justify-end">
                <div className="w-full max-w-xs space-y-1 text-xs text-emerald-950 dark:text-emerald-50">
                  {!(usaTotalExt && horasExt === 0) && (
                    <div className="flex justify-between"><span>Total de horas:</span><span>{totalHoras.toFixed(2)}h</span></div>
                  )}
                  <div className="flex justify-between"><span>Subtotal:</span><span>{fmtEUR(subtotal)}</span></div>
                  {!aplicarIva || ivaPct === 0
                    ? <div className="flex justify-between"><span>IVA:</span><span>Regime de isenção</span></div>
                    : <div className="flex justify-between"><span>IVA ({ivaPct}%):</span><span>+ {fmtEUR(ivaVal)}</span></div>}
                  {retPct === 0
                    ? <div className="flex justify-between"><span>Retenção IRS:</span><span>Regime de isenção</span></div>
                    : <div className="flex justify-between"><span>Retenção IRS ({retPct}%):</span><span>- {fmtEUR(ret)}</span></div>}
                  <div className="flex justify-between border-t-2 border-emerald-700/50 pt-1 text-sm font-bold text-emerald-900 dark:text-emerald-100">
                    <span>TOTAL A PAGAR:</span><span>{fmtEUR(total)}</span>
                  </div>
                </div>
              </div>
              {observacoes && (
                <div className="mt-3 text-xs text-emerald-950 dark:text-emerald-50">
                  <div className="font-semibold uppercase text-[10px] tracking-wider text-emerald-900/60 dark:text-emerald-200/60">Observações</div>
                  <div>{observacoes}</div>
                </div>
              )}
              <div className="mt-3 text-[10px] italic text-emerald-900/60 dark:text-emerald-200/60">Pré-visualização — o PDF final inclui os logótipos e dados da empresa.</div>
            </div>
          );
        })()}

        <div className="flex gap-2">
          <Button onClick={gerar} disabled={busy || (tipoFormador === "registado" ? !formadorId : !extNome.trim())}>
            <FileText className="size-4" /> {busy ? "A gerar…" : "Gerar PDF"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
