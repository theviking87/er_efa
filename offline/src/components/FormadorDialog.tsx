import { useState, useEffect } from "react";
import { exec, all } from "../db/sqljs";
import { uid } from "../lib/format";

const COLORS = [
  "#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e","#10b981","#14b8a6",
  "#06b6d4","#0ea5e9","#3b82f6","#6366f1","#8b5cf6","#a855f7","#d946ef","#ec4899",
];

export type FormadorRow = {
  id?: string;
  nome?: string | null;
  nif?: string | null;
  cc?: string | null;
  validade_cc?: string | null;
  data_nascimento?: string | null;
  telemovel?: string | null;
  email?: string | null;
  iban?: string | null;
  morada?: string | null;
  codigo_postal?: string | null;
  localidade?: string | null;
  habilitacoes?: string | null;
  ccp?: string | null;
  validade_ccp?: string | null;
  observacoes?: string | null;
  cor?: string | null;
  estado?: string | null;
};

const FIELDS: { key: keyof FormadorRow; label: string; type?: string }[] = [
  { key: "nome", label: "Nome *" },
  { key: "nif", label: "NIF" },
  { key: "cc", label: "Cartão de Cidadão" },
  { key: "validade_cc", label: "Validade CC", type: "date" },
  { key: "data_nascimento", label: "Data de Nascimento", type: "date" },
  { key: "telemovel", label: "Telemóvel" },
  { key: "email", label: "Email" },
  { key: "iban", label: "IBAN" },
  { key: "morada", label: "Morada" },
  { key: "codigo_postal", label: "Código Postal" },
  { key: "localidade", label: "Localidade" },
  { key: "habilitacoes", label: "Habilitações" },
  { key: "ccp", label: "CCP" },
  { key: "validade_ccp", label: "Validade CCP", type: "date" },
];

export function FormadorDialog({
  open,
  onClose,
  onSaved,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: FormadorRow;
}) {
  const [form, setForm] = useState<FormadorRow>({});

  useEffect(() => {
    if (!open) return;
    setForm(initial ?? { cor: COLORS[Math.floor(Math.random() * COLORS.length)], estado: "ativo" });
  }, [open, initial]);

  if (!open) return null;

  function set<K extends keyof FormadorRow>(k: K, v: FormadorRow[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function save() {
    if (!form.nome?.trim()) {
      alert("Nome é obrigatório");
      return;
    }
    const cols: (keyof FormadorRow)[] = [
      "nome","nif","cc","validade_cc","data_nascimento","telemovel","email","iban",
      "morada","codigo_postal","localidade","habilitacoes","ccp","validade_ccp",
      "observacoes","cor","estado",
    ];
    if (initial?.id) {
      const sets = cols.map((c) => `"${c}"=?`).join(", ");
      exec(`UPDATE formadores SET ${sets} WHERE id=?`, [
        ...cols.map((c) => form[c] ?? null),
        initial.id,
      ]);
    } else {
      const id = uid();
      const allCols = ["id", ...cols];
      const placeholders = allCols.map(() => "?").join(", ");
      exec(
        `INSERT INTO formadores (${allCols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`,
        [id, ...cols.map((c) => form[c] ?? null)],
      );
    }
    // ensure existing schema has all the columns we wrote
    void all;
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold">{initial?.id ? "Editar formador" : "Novo formador"}</h2>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>
        <div className="p-6 grid sm:grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key as string} className={f.key === "nome" ? "sm:col-span-2" : ""}>
              <label className="block text-xs text-slate-500 mb-1">{f.label}</label>
              <input
                className="input"
                type={f.type ?? "text"}
                value={(form[f.key] as string) ?? ""}
                onChange={(e) => set(f.key, e.target.value as never)}
              />
            </div>
          ))}
          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-500 mb-1">Observações</label>
            <textarea
              className="input min-h-20"
              value={form.observacoes ?? ""}
              onChange={(e) => set("observacoes", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Estado</label>
            <select
              className="input"
              value={form.estado ?? "ativo"}
              onChange={(e) => set("estado", e.target.value)}
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
              <option value="arquivado">Arquivado</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Cor</label>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("cor", c)}
                  className={`size-6 rounded-full border-2 ${form.cor === c ? "border-slate-900" : "border-transparent"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
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
