import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { all, exec, one } from "../db/sqljs";
import { ensureColumns } from "../db/schema";
import { uid } from "../lib/format";
import { saveBlobToDocs, blobUrlFromDocs, deleteFromDocs } from "../db/persistence";

type Formando = {
  id: string;
  nome: string;
  nif?: string | null;
  email?: string | null;
  telemovel?: string | null;
};

type PraRow = {
  curso_id: string;
  curso_nome: string;
  curso_codigo?: string | null;
  ufcd_id: string;
  ufcd_codigo?: string | null;
  ufcd_nome?: string | null;
  pra_id?: string | null;
  ficheiro?: string | null;
  nota?: string | null;
};

function compareUfcd(a: { ufcd_codigo?: string | null }, b: { ufcd_codigo?: string | null }) {
  const ac = (a.ufcd_codigo ?? "").toString();
  const bc = (b.ufcd_codigo ?? "").toString();
  const aL = /^[A-Za-z]/.test(ac);
  const bL = /^[A-Za-z]/.test(bc);
  if (aL !== bL) return aL ? -1 : 1;
  return ac.localeCompare(bc, "pt", { numeric: true });
}

export default function FormandoDetail() {
  const { id = "" } = useParams();
  const [tick, setTick] = useState(0);

  const formando = useMemo<Formando | null>(() => {
    try { return one<Formando>(`SELECT * FROM formandos WHERE id=?`, [id]); }
    catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tick]);

  const rows = useMemo<PraRow[]>(() => {
    try {
      ensureColumns("formando_pra", ["formando_id", "curso_id", "ufcd_id", "ficheiro", "nota"]);
      return all<PraRow>(
        `SELECT c.id AS curso_id, c.nome AS curso_nome, c.codigo AS curso_codigo,
                u.id AS ufcd_id, u.codigo AS ufcd_codigo, u.nome AS ufcd_nome,
                p.id AS pra_id, p.ficheiro, p.nota
         FROM curso_formandos cf
         JOIN cursos c ON c.id = cf.curso_id
         JOIN curso_ufcds cu ON cu.curso_id = cf.curso_id
         JOIN ufcds u ON u.id = cu.ufcd_id
         LEFT JOIN formando_pra p ON p.formando_id = cf.formando_id AND p.curso_id = c.id AND p.ufcd_id = u.id
         WHERE cf.formando_id = ?`,
        [id],
      );
    } catch { return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tick]);

  if (!formando) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <Link to="/formandos" className="text-sm text-slate-500 hover:text-slate-900">← Formandos</Link>
        <p className="mt-6 text-slate-500">Formando não encontrado.</p>
      </div>
    );
  }

  // Group by course
  const byCurso = new Map<string, { curso_nome: string; curso_codigo?: string | null; items: PraRow[] }>();
  for (const r of rows) {
    if (!byCurso.has(r.curso_id)) byCurso.set(r.curso_id, { curso_nome: r.curso_nome, curso_codigo: r.curso_codigo, items: [] });
    byCurso.get(r.curso_id)!.items.push(r);
  }

  async function uploadFile(row: PraRow, file: File) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `formandos/${id}/${row.curso_id}/${row.ufcd_id}_${safe}`;
    await saveBlobToDocs(path, file);
    if (row.pra_id) {
      if (row.ficheiro && row.ficheiro !== path) await deleteFromDocs(row.ficheiro).catch(() => {});
      exec(`UPDATE formando_pra SET ficheiro=? WHERE id=?`, [path, row.pra_id]);
    } else {
      exec(
        `INSERT INTO formando_pra (id, formando_id, curso_id, ufcd_id, ficheiro) VALUES (?, ?, ?, ?, ?)`,
        [uid(), id, row.curso_id, row.ufcd_id, path],
      );
    }
    setTick((t) => t + 1);
  }

  async function removeFile(row: PraRow) {
    if (!row.pra_id) return;
    if (!confirm("Remover ficheiro PRA?")) return;
    if (row.ficheiro) await deleteFromDocs(row.ficheiro).catch(() => {});
    exec(`UPDATE formando_pra SET ficheiro=NULL WHERE id=?`, [row.pra_id]);
    setTick((t) => t + 1);
  }

  function saveNota(row: PraRow, nota: string) {
    if (row.pra_id) {
      exec(`UPDATE formando_pra SET nota=? WHERE id=?`, [nota, row.pra_id]);
    } else {
      exec(
        `INSERT INTO formando_pra (id, formando_id, curso_id, ufcd_id, nota) VALUES (?, ?, ?, ?, ?)`,
        [uid(), id, row.curso_id, row.ufcd_id, nota],
      );
    }
    setTick((t) => t + 1);
  }

  async function openFile(path: string) {
    const url = await blobUrlFromDocs(path);
    if (url) window.open(url, "_blank");
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link to="/formandos" className="text-sm text-slate-500 hover:text-slate-900">← Formandos</Link>
      <div className="mt-3 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{formando.nome}</h1>
        <p className="text-sm text-slate-500">
          {[formando.nif, formando.email, formando.telemovel].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">PRA por UFCD</h2>

      {byCurso.size === 0 && (
        <p className="text-sm text-slate-500">Este formando não está inscrito em nenhum curso.</p>
      )}

      {[...byCurso.entries()].map(([cursoId, group]) => (
        <div key={cursoId} className="mb-6 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <div className="font-medium">{group.curso_nome}</div>
            <div className="text-xs text-slate-500">{group.curso_codigo ?? ""}</div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-white text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left font-medium px-4 py-2 w-24">Código</th>
                <th className="text-left font-medium px-4 py-2">UFCD</th>
                <th className="text-left font-medium px-4 py-2 w-72">PRA</th>
                <th className="text-left font-medium px-4 py-2">Observações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...group.items].sort(compareUfcd).map((r) => {
                const ok = !!r.ficheiro;
                return (
                  <tr key={r.ufcd_id} className={ok ? "bg-emerald-50/50" : "bg-rose-50/30"}>
                    <td className="px-4 py-2 font-mono text-xs">{r.ufcd_codigo ?? "—"}</td>
                    <td className="px-4 py-2">{r.ufcd_nome ?? "—"}</td>
                    <td className="px-4 py-2">
                      {ok ? (
                        <div className="flex items-center gap-2">
                          <button className="text-xs text-emerald-700 underline" onClick={() => openFile(r.ficheiro!)}>
                            abrir
                          </button>
                          <button className="text-xs text-rose-600 hover:underline" onClick={() => removeFile(r)}>
                            remover
                          </button>
                        </div>
                      ) : (
                        <label className="text-xs text-slate-600 underline cursor-pointer">
                          carregar…
                          <input type="file" className="hidden" onChange={(e) => {
                            const f = e.target.files?.[0]; if (f) uploadFile(r, f);
                          }} />
                        </label>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="input text-xs"
                        defaultValue={r.nota ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v !== (r.nota ?? "")) saveNota(r, v);
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
