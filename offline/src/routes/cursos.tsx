import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { all } from "../db/sqljs";
import { fmtDate } from "../lib/format";
import { CursoDialog } from "../components/CursoDialog";

type Row = {
  id: string;
  nome: string;
  codigo?: string | null;
  local?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  estado?: string | null;
};

const ESTADO_LABEL: Record<string, string> = {
  ativo: "Ativo",
  concluido: "Concluído",
  arquivado: "Arquivado",
};

export default function CursosList() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  const rows = useMemo<Row[]>(() => {
    try {
      return all<Row>(
        `SELECT id, nome, codigo, local, data_inicio, data_fim, estado
         FROM cursos
         ORDER BY COALESCE(data_inicio, '') DESC, nome COLLATE NOCASE`,
      );
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const filtered = rows.filter((c) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      (c.nome ?? "").toLowerCase().includes(s) ||
      (c.codigo ?? "").toLowerCase().includes(s) ||
      (c.local ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cursos</h1>
          <p className="text-sm text-slate-500">Gestão de cursos, UFCDs e formandos.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>+ Novo curso</button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          className="input max-w-xs"
          placeholder="Pesquisar por nome, código ou local…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="text-xs text-slate-500">
          {filtered.length} {filtered.length === 1 ? "curso" : "cursos"}
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Nome</th>
              <th className="text-left font-medium px-4 py-2.5">Código</th>
              <th className="text-left font-medium px-4 py-2.5">Local</th>
              <th className="text-left font-medium px-4 py-2.5">Início</th>
              <th className="text-left font-medium px-4 py-2.5">Fim</th>
              <th className="text-left font-medium px-4 py-2.5">Estado</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  Sem cursos.
                </td>
              </tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <Link to={`/cursos/${c.id}`} className="font-medium hover:underline">
                    {c.nome}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-slate-500">{c.codigo ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-500">{c.local ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-500">{fmtDate(c.data_inicio)}</td>
                <td className="px-4 py-2.5 text-slate-500">{fmtDate(c.data_fim)}</td>
                <td className="px-4 py-2.5 text-slate-500">
                  {ESTADO_LABEL[c.estado ?? ""] ?? c.estado ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link to={`/cursos/${c.id}`} className="text-xs text-slate-500 hover:text-slate-900">
                    Abrir →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CursoDialog
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
