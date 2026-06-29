import { useState, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { all, exec, one } from "../db/sqljs";
import { fmtDate, uid, nowIso, ESTADO_FORMADOR_LABEL } from "../lib/format";
import { FormadorDialog } from "../components/FormadorDialog";
import { writeFileAt, readFileAt, deleteFileAt } from "../db/persistence";

type Formador = Record<string, any>;
type Inat = { id: string; data_inicio: string; data_fim: string; motivo?: string | null };
type Doc = {
  id: string;
  tipo: string;
  nome: string;
  storage_path: string;
  validade?: string | null;
  created_at?: string | null;
};

export default function FormadorDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<"dados" | "inatividades" | "documentos">("dados");
  const [editing, setEditing] = useState(false);

  const refresh = () => setTick((t) => t + 1);

  const f = useMemo<Formador | null>(() => {
    try {
      return one<Formador>(`SELECT * FROM formadores WHERE id=?`, [id]);
    } catch {
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tick]);

  if (!f) {
    return (
      <div className="p-8">
        <Link to="/formadores" className="text-sm text-slate-500 hover:underline">← Formadores</Link>
        <p className="mt-4 text-slate-500">Formador não encontrado.</p>
      </div>
    );
  }

  function remove() {
    if (!confirm("Eliminar este formador? Esta ação não pode ser revertida.")) return;
    exec(`DELETE FROM formador_documentos WHERE formador_id=?`, [id]);
    exec(`DELETE FROM formador_inatividades WHERE formador_id=?`, [id]);
    exec(`DELETE FROM formadores WHERE id=?`, [id]);
    navigate("/formadores");
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link to="/formadores" className="text-sm text-slate-500 hover:underline">← Formadores</Link>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{f.nome}</h1>
          <p className="text-sm text-slate-500">{f.email ?? f.telemovel ?? "Sem contacto registado"}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full" style={{ background: f.cor ?? "#94a3b8" }} />
              {ESTADO_FORMADOR_LABEL[f.estado] ?? f.estado ?? "—"}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline" onClick={() => setEditing(true)}>Editar</button>
          <button className="btn btn-outline text-red-600" onClick={remove}>Eliminar</button>
        </div>
      </div>

      <div className="mt-6 border-b border-slate-200 flex gap-1">
        {[
          ["dados", "Dados"],
          ["inatividades", "Inatividades"],
          ["documentos", "Documentos"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k as typeof tab)}
            className={`px-4 py-2 text-sm border-b-2 ${tab === k ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "dados" && <DadosTab f={f} />}
        {tab === "inatividades" && <InatividadesTab formadorId={id} onChange={refresh} />}
        {tab === "documentos" && <DocumentosTab formadorId={id} onChange={refresh} />}
      </div>

      <FormadorDialog
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={() => { setEditing(false); refresh(); }}
        initial={f as any}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value?: any }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm">{value || <span className="text-slate-400">—</span>}</div>
    </div>
  );
}

function DadosTab({ f }: { f: Formador }) {
  return (
    <div className="card grid sm:grid-cols-2 gap-x-8 gap-y-3">
      <Field label="NIF" value={f.nif} />
      <Field label="Cartão de Cidadão" value={f.cc} />
      <Field label="Validade CC" value={fmtDate(f.validade_cc)} />
      <Field label="Data de Nascimento" value={fmtDate(f.data_nascimento)} />
      <Field label="Telemóvel" value={f.telemovel} />
      <Field label="Email" value={f.email} />
      <Field label="IBAN" value={f.iban} />
      <Field label="Morada" value={f.morada} />
      <Field label="Código Postal" value={[f.codigo_postal, f.localidade].filter(Boolean).join(" ")} />
      <Field label="Habilitações" value={f.habilitacoes} />
      <Field label="CCP" value={f.ccp} />
      <Field label="Validade CCP" value={fmtDate(f.validade_ccp)} />
      <div className="sm:col-span-2"><Field label="Observações" value={f.observacoes} /></div>
    </div>
  );
}

function InatividadesTab({ formadorId, onChange }: { formadorId: string; onChange: () => void }) {
  const [tick, setTick] = useState(0);
  const items = useMemo<Inat[]>(() => {
    try {
      return all<Inat>(
        `SELECT id, data_inicio, data_fim, motivo FROM formador_inatividades WHERE formador_id=? ORDER BY data_inicio DESC`,
        [formadorId],
      );
    } catch { return []; }
  }, [formadorId, tick]);

  const [form, setForm] = useState({ data_inicio: "", data_fim: "", motivo: "" });
  const bump = () => { setTick((t) => t + 1); onChange(); };

  function add() {
    if (!form.data_inicio || !form.data_fim) { alert("Datas obrigatórias"); return; }
    exec(
      `INSERT INTO formador_inatividades (id, formador_id, data_inicio, data_fim, motivo) VALUES (?,?,?,?,?)`,
      [uid(), formadorId, form.data_inicio, form.data_fim, form.motivo || null],
    );
    setForm({ data_inicio: "", data_fim: "", motivo: "" });
    bump();
  }
  function del(id: string) {
    if (!confirm("Eliminar período?")) return;
    exec(`DELETE FROM formador_inatividades WHERE id=?`, [id]);
    bump();
  }

  return (
    <div className="card space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_2fr_auto] gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Início</label>
          <input type="date" className="input" value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Fim</label>
          <input type="date" className="input" value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Motivo</label>
          <input className="input" value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
        </div>
        <button className="btn btn-primary" onClick={add}>Adicionar</button>
      </div>

      {items.length === 0 ? (
        <div className="text-sm text-slate-500 text-center py-8">Sem períodos registados.</div>
      ) : (
        <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
          {items.map((i) => (
            <div key={i.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
              <div>
                <span className="font-medium">{fmtDate(i.data_inicio)} → {fmtDate(i.data_fim)}</span>
                {i.motivo && <span className="text-slate-500"> · {i.motivo}</span>}
              </div>
              <button className="text-xs text-red-600 hover:underline" onClick={() => del(i.id)}>Eliminar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentosTab({ formadorId, onChange }: { formadorId: string; onChange: () => void }) {
  const [tick, setTick] = useState(0);
  const items = useMemo<Doc[]>(() => {
    try {
      return all<Doc>(
        `SELECT id, tipo, nome, storage_path, validade, created_at FROM formador_documentos WHERE formador_id=? ORDER BY created_at DESC`,
        [formadorId],
      );
    } catch { return []; }
  }, [formadorId, tick]);
  const bump = () => { setTick((t) => t + 1); onChange(); };

  const [tipo, setTipo] = useState("CC");
  const [validade, setValidade] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const safeName = file.name
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .replace(/_+/g, "_");
      const storagePath = `${formadorId}/${Date.now()}_${safeName}`;
      await writeFileAt(`docs/formadores/${storagePath}`, file);
      exec(
        `INSERT INTO formador_documentos (id, formador_id, tipo, nome, storage_path, validade, created_at) VALUES (?,?,?,?,?,?,?)`,
        [uid(), formadorId, tipo, file.name, storagePath, validade || null, nowIso()],
      );
      setValidade("");
      bump();
    } catch (err) {
      alert("Erro ao carregar ficheiro: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function open(d: Doc) {
    const file = await readFileAt(`docs/formadores/${d.storage_path}`);
    if (!file) { alert("Ficheiro não encontrado na pen."); return; }
    const url = URL.createObjectURL(file);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function del(d: Doc) {
    if (!confirm("Eliminar este documento?")) return;
    await deleteFileAt(`docs/formadores/${d.storage_path}`);
    exec(`DELETE FROM formador_documentos WHERE id=?`, [d.id]);
    bump();
  }

  return (
    <div className="card space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_2fr] gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Tipo</label>
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {["CC","CCP","Habilitações","CV","Certificado","Outro"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Validade</label>
          <input type="date" className="input" value={validade} onChange={(e) => setValidade(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Ficheiro</label>
          <input type="file" className="input" onChange={onFile} disabled={busy} />
        </div>
      </div>
      {busy && <div className="text-xs text-slate-500">A copiar para a pen…</div>}

      {items.length === 0 ? (
        <div className="text-sm text-slate-500 text-center py-8">Sem documentos.</div>
      ) : (
        <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
          {items.map((d) => (
            <div key={d.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
              <div>
                <div className="font-medium">{d.tipo} · {d.nome}</div>
                <div className="text-xs text-slate-500">
                  {fmtDate(d.created_at)}{d.validade && ` · válido até ${fmtDate(d.validade)}`}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-outline" onClick={() => open(d)}>Abrir</button>
                <button className="text-xs text-red-600 hover:underline" onClick={() => del(d)}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
