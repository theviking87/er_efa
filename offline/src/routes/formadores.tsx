import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { all } from "../db/sqljs";
import { ESTADO_FORMADOR_LABEL } from "../lib/format";
import { FormadorDialog } from "../components/FormadorDialog";

type Row = {
  id: string;
  nome: string;
  nif?: string | null;
  email?: string | null;
  telemovel?: string | null;
  cor?: string | null;
  estado?: string | null;
  ccp?: string | null;
};

export default function FormadoresList() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  const rows = useMemo<Row[]>(() => {
    try {
      return all<Row>(`SELECT id, nome, nif, email, telemovel, cor, estado, ccp FROM formadores ORDER BY nome COLLATE NOCASE`);
    } catch {
      return [];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const filtered = rows.filter((f) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      (f.nome ?? "").toLowerCase().includes(s) ||
      (f.nif ?? "").includes(q) ||
      (f.email ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Formadores</h1>
          <p className="text-sm text-slate-500">Gestão de formadores, contactos e documentos.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>+ Novo formador</button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          className="input max-w-xs"
          placeholder="Pesquisar por nome, NIF ou email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="text-xs text-slate-500">
          {filtered.length} {filtered.length === 1 ? "formador" : "formadores"}
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Nome</th>
              <th className="text-left font-medium px-4 py-2.5">NIF</th>
              <th className="text-left font-medium px-4 py-2.5">Contacto</th>
              <th className="text-left font-medium px-4 py-2.5">CCP</th>
              <th className="text-left font-medium px-4 py-2.5">Estado</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  Sem formadores.
                </td>
              </tr>
            )}
            {filtered.map((f) => (
              <tr key={f.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block size-2.5 rounded-full"
                      style={{ background: f.cor ?? "#94a3b8" }}
                    />
                    <Link to={`/formadores/${f.id}`} className="font-medium hover:underline">
                      {f.nome}
                    </Link>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-slate-500">{f.nif ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-500">{f.email ?? f.telemovel ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-500">{f.ccp ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-500">
                  {ESTADO_FORMADOR_LABEL[f.estado ?? ""] ?? f.estado ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link to={`/formadores/${f.id}`} className="text-xs text-slate-500 hover:text-slate-900">
                    Abrir →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FormadorDialog
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false);
          setTick((t) => t + 1);
        }}
      />
    </div>
  );
}

// keep effect import used (no-op to silence TS unused if needed)
void useEffect;
