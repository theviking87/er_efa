import { useMemo, useState } from "react";
import { all, exec } from "../db/sqljs";
import { ensureColumns } from "../db/schema";
import { uid } from "../lib/format";

type Row = {
  id: string;
  codigo?: string | null;
  nome?: string | null;
  horas?: number | string | null;
};

export default function UfcdsList() {
  const [q, setQ] = useState("");
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);

  const rows = useMemo<Row[]>(() => {
    try {
      return all<Row>(`SELECT id, codigo, nome, horas FROM ufcds`);
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const sorted = [...rows].sort((a, b) => {
    const ac = (a.codigo ?? "").toString();
    const bc = (b.codigo ?? "").toString();
    const aIsLetter = /^[A-Za-z]/.test(ac);
    const bIsLetter = /^[A-Za-z]/.test(bc);
    if (aIsLetter !== bIsLetter) return aIsLetter ? -1 : 1;
    return ac.localeCompare(bc, "pt", { numeric: true });
  });

  const filtered = sorted.filter((u) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      (u.codigo ?? "").toString().toLowerCase().includes(s) ||
      (u.nome ?? "").toLowerCase().includes(s)
    );
  });

  function novo() {
    setEditing({ id: "", codigo: "", nome: "", horas: 25 });
    setOpen(true);
  }

  function editar(r: Row) {
    setEditing(r);
    setOpen(true);
  }

  function apagar(id: string) {
    if (!confirm("Eliminar esta UFCD?")) return;
    exec(`DELETE FROM ufcds WHERE id=?`, [id]);
    setTick((t) => t + 1);
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">UFCDs</h1>
          <p className="text-sm text-slate-500">Catálogo de UFCDs.</p>
        </div>
        <button className="btn btn-primary" onClick={novo}>+ Nova UFCD</button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          className="input max-w-xs"
          placeholder="Pesquisar por código ou nome…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="text-xs text-slate-500">
          {filtered.length} {filtered.length === 1 ? "UFCD" : "UFCDs"}
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left font-medium px-4 py-2.5 w-24">Código</th>
              <th className="text-left font-medium px-4 py-2.5">Nome</th>
              <th className="text-left font-medium px-4 py-2.5 w-20">Horas</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                  Sem UFCDs.
                </td>
              </tr>
            )}
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-mono text-xs">{u.codigo ?? "—"}</td>
                <td className="px-4 py-2.5">{u.nome ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-500">{u.horas ?? "—"}</td>
                <td className="px-4 py-2.5 text-right space-x-3">
                  <button className="text-xs text-slate-500 hover:text-slate-900" onClick={() => editar(u)}>
                    Editar
                  </button>
                  <button className="text-xs text-red-500 hover:text-red-700" onClick={() => apagar(u.id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && editing && (
        <UfcdDialog
          initial={editing}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            setTick((t) => t + 1);
          }}
        />
      )}
    </div>
  );
}

function UfcdDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [codigo, setCodigo] = useState(initial.codigo ?? "");
  const [nome, setNome] = useState(initial.nome ?? "");
  const [horas, setHoras] = useState<string>(initial.horas?.toString() ?? "25");

  function save() {
    if (!nome.trim()) {
      alert("Nome obrigatório");
      return;
    }
    ensureColumns("ufcds", ["codigo", "nome", "horas"]);
    if (initial.id) {
      exec(`UPDATE ufcds SET codigo=?, nome=?, horas=? WHERE id=?`, [
        codigo, nome, Number(horas) || 0, initial.id,
      ]);
    } else {
      exec(`INSERT INTO ufcds (id, codigo, nome, horas) VALUES (?, ?, ?, ?)`, [
        uid(), codigo, nome, Number(horas) || 0,
      ]);
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold">{initial.id ? "Editar UFCD" : "Nova UFCD"}</h2>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>
        <div className="p-6 space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Código</label>
            <input className="input" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Nome *</label>
            <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Horas</label>
            <input className="input" type="number" value={horas} onChange={(e) => setHoras(e.target.value)} />
          </div>
        </div>
        <div className="px-6 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Guardar</button>
        </div>
      </div>
    </div>
  );
}
