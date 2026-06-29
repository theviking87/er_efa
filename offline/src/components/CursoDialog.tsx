import { useEffect, useState } from "react";
import { exec } from "../db/sqljs";
import { ensureColumns } from "../db/schema";
import { uid } from "../lib/format";

export type CursoRow = {
  id?: string;
  nome?: string | null;
  codigo?: string | null;
  local?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  horario?: string | null;
  estado?: string | null;
  observacoes?: string | null;
};

const FIELDS: { key: keyof CursoRow; label: string; type?: string; full?: boolean }[] = [
  { key: "nome", label: "Nome *", full: true },
  { key: "codigo", label: "Código" },
  { key: "local", label: "Local" },
  { key: "data_inicio", label: "Data de início", type: "date" },
  { key: "data_fim", label: "Data de fim", type: "date" },
  { key: "horario", label: "Horário" },
];

export function CursoDialog({
  open,
  onClose,
  onSaved,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: CursoRow;
}) {
  const [form, setForm] = useState<CursoRow>({});

  useEffect(() => {
    if (!open) return;
    setForm(initial ?? { estado: "ativo" });
  }, [open, initial]);

  if (!open) return null;

  function set<K extends keyof CursoRow>(k: K, v: CursoRow[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function save() {
    if (!form.nome?.trim()) {
      alert("Nome é obrigatório");
      return;
    }
    const cols: (keyof CursoRow)[] = [
      "nome", "codigo", "local", "data_inicio", "data_fim", "horario", "estado", "observacoes",
    ];
    ensureColumns("cursos", cols as string[]);
    if (initial?.id) {
      const sets = cols.map((c) => `"${c}"=?`).join(", ");
      exec(`UPDATE cursos SET ${sets} WHERE id=?`, [
        ...cols.map((c) => form[c] ?? null),
        initial.id,
      ]);
    } else {
      const id = uid();
      const allCols = ["id", ...cols];
      const placeholders = allCols.map(() => "?").join(", ");
      exec(
        `INSERT INTO cursos (${allCols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`,
        [id, ...cols.map((c) => form[c] ?? null)],
      );
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold">{initial?.id ? "Editar curso" : "Novo curso"}</h2>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>
        <div className="p-6 grid sm:grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key as string} className={f.full ? "sm:col-span-2" : ""}>
              <label className="block text-xs text-slate-500 mb-1">{f.label}</label>
              <input
                className="input"
                type={f.type ?? "text"}
                value={(form[f.key] as string) ?? ""}
                onChange={(e) => set(f.key, e.target.value as never)}
              />
            </div>
          ))}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Estado</label>
            <select
              className="input"
              value={form.estado ?? "ativo"}
              onChange={(e) => set("estado", e.target.value)}
            >
              <option value="ativo">Ativo</option>
              <option value="concluido">Concluído</option>
              <option value="arquivado">Arquivado</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-500 mb-1">Observações</label>
            <textarea
              className="input min-h-20"
              value={form.observacoes ?? ""}
              onChange={(e) => set("observacoes", e.target.value)}
            />
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
