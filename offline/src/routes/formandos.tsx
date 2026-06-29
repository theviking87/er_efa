import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { all, exec } from "../db/sqljs";
import { ensureColumns } from "../db/schema";
import { uid } from "../lib/format";

type Row = {
  id: string;
  nome: string;
  nif?: string | null;
  email?: string | null;
  telemovel?: string | null;
};

export default function FormandosList() {
  const [q, setQ] = useState("");
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);

  const rows = useMemo<Row[]>(() => {
    try {
      return all<Row>(`SELECT id, nome, nif, email, telemovel FROM formandos ORDER BY nome COLLATE NOCASE`);
    } catch { return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const list = rows.filter((f) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (f.nome ?? "").toLowerCase().includes(s)
      || (f.nif ?? "").includes(q)
      || (f.email ?? "").toLowerCase().includes(s);
  });

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Formandos</h1>
          <p className="text-sm text-slate-500">Gestão de formandos e PRA por UFCD.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>+ Novo formando</button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input className="input max-w-xs" placeholder="Pesquisar…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-xs text-slate-500">{list.length} formandos</span>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Nome</th>
              <th className="text-left font-medium px-4 py-2.5">NIF</th>
              <th className="text-left font-medium px-4 py-2.5">Email</th>
              <th className="text-left font-medium px-4 py-2.5">Telemóvel</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Sem formandos.</td></tr>}
            {list.map((f) => (
              <tr key={f.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5"><Link to={`/formandos/${f.id}`} className="text-slate-900 hover:underline">{f.nome}</Link></td>
                <td className="px-4 py-2.5 text-slate-500">{f.nif ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-500">{f.email ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-500">{f.telemovel ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && <NewFormandoDialog onClose={() => setOpen(false)} onSaved={() => { setOpen(false); setTick((t) => t + 1); }} />}
    </div>
  );
}

function NewFormandoDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState("");
  const [nif, setNif] = useState("");
  const [email, setEmail] = useState("");
  const [telemovel, setTelemovel] = useState("");

  function save() {
    if (!nome.trim()) return;
    ensureColumns("formandos", ["nome", "nif", "email", "telemovel"]);
    exec(`INSERT INTO formandos (id, nome, nif, email, telemovel) VALUES (?, ?, ?, ?, ?)`,
      [uid(), nome.trim(), nif || null, email || null, telemovel || null]);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold">Novo formando</h2>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>
        <div className="p-6 space-y-3">
          <div><label className="text-xs text-slate-600">Nome</label><input className="input" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-slate-600">NIF</label><input className="input" value={nif} onChange={(e) => setNif(e.target.value)} /></div>
            <div><label className="text-xs text-slate-600">Telemóvel</label><input className="input" value={telemovel} onChange={(e) => setTelemovel(e.target.value)} /></div>
          </div>
          <div><label className="text-xs text-slate-600">Email</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        </div>
        <div className="px-6 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={!nome.trim()}>Guardar</button>
        </div>
      </div>
    </div>
  );
}
