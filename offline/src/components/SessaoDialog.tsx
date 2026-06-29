import { useEffect, useMemo, useState } from "react";
import { all, exec, one } from "../db/sqljs";
import { ensureColumns } from "../db/schema";
import { diffHoras } from "../lib/calendar";
import { uid } from "../lib/format";

export type SessaoRow = {
  id: string;
  curso_id: string;
  curso_ufcd_id?: string | null;
  formador_id?: string | null;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  horas?: number | null;
  observacoes?: string | null;
};

type Props = {
  open: boolean;
  cursoId: string;
  data: string; // YYYY-MM-DD
  initial?: SessaoRow | null;
  onClose: () => void;
  onSaved: () => void;
};

const PRESETS = [
  { label: "Manhã (09:00–13:00)", i: "09:00", f: "13:00" },
  { label: "Tarde (14:00–17:00)", i: "14:00", f: "17:00" },
  { label: "Dia todo (09:00–17:00)", i: "09:00", f: "17:00" },
];

export function SessaoDialog({ open, cursoId, data, initial, onClose, onSaved }: Props) {
  const isEdit = !!initial;
  const [cursoUfcdId, setCursoUfcdId] = useState<string>("");
  const [formadorId, setFormadorId] = useState<string>("");
  const [horaInicio, setHoraInicio] = useState("09:00");
  const [horaFim, setHoraFim] = useState("13:00");
  const [obs, setObs] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setCursoUfcdId(initial.curso_ufcd_id ?? "");
      setFormadorId(initial.formador_id ?? "");
      setHoraInicio((initial.hora_inicio ?? "09:00").slice(0, 5));
      setHoraFim((initial.hora_fim ?? "13:00").slice(0, 5));
      setObs(initial.observacoes ?? "");
    } else {
      setCursoUfcdId("");
      setFormadorId("");
      setHoraInicio("09:00");
      setHoraFim("13:00");
      setObs("");
    }
  }, [open, initial]);

  // UFCDs deste curso
  const ufcds = useMemo(() => {
    if (!open) return [];
    try {
      return all<{ id: string; codigo?: string | null; nome?: string | null }>(
        `SELECT cu.id, u.codigo, u.nome
         FROM curso_ufcds cu
         LEFT JOIN ufcds u ON u.id = cu.ufcd_id
         WHERE cu.curso_id = ?
         ORDER BY u.codigo`,
        [cursoId],
      );
    } catch { return []; }
  }, [open, cursoId]);

  // Formadores com competência para a UFCD escolhida (curso_ufcd_formadores) — se vazio, mostra todos
  const formadores = useMemo(() => {
    if (!open) return [];
    try {
      if (cursoUfcdId) {
        const rows = all<{ id: string; nome: string }>(
          `SELECT f.id, f.nome
           FROM curso_ufcd_formadores cuf
           JOIN formadores f ON f.id = cuf.formador_id
           WHERE cuf.curso_ufcd_id = ?
           ORDER BY f.nome`,
          [cursoUfcdId],
        );
        if (rows.length) return rows;
      }
      return all<{ id: string; nome: string }>(`SELECT id, nome FROM formadores ORDER BY nome`);
    } catch { return []; }
  }, [open, cursoUfcdId]);

  if (!open) return null;

  const horas = diffHoras(horaInicio, horaFim);

  function applyPreset(i: string, f: string) {
    setHoraInicio(i);
    setHoraFim(f);
  }

  function save() {
    if (!horaInicio || !horaFim || diffHoras(horaInicio, horaFim) <= 0) {
      alert("Horário inválido.");
      return;
    }
    // Conflito: mesmo formador, mesmo dia, mesmo horário noutra sessão (qualquer curso)
    if (formadorId) {
      const conflito = one<{ n: number }>(
        `SELECT COUNT(*) AS n FROM sessoes
         WHERE formador_id=? AND data=? AND id<>?
         AND NOT (hora_fim <= ? OR hora_inicio >= ?)`,
        [formadorId, data, initial?.id ?? "", horaInicio, horaFim],
      );
      if ((conflito?.n ?? 0) > 0) {
        if (!confirm("Este formador já tem outra sessão neste dia e horário. Continuar mesmo assim?")) return;
      }
    }
    ensureColumns("sessoes", [
      "curso_id", "curso_ufcd_id", "formador_id", "data",
      "hora_inicio", "hora_fim", "horas", "observacoes",
    ]);
    if (isEdit && initial) {
      exec(
        `UPDATE sessoes SET curso_ufcd_id=?, formador_id=?, data=?,
         hora_inicio=?, hora_fim=?, horas=?, observacoes=? WHERE id=?`,
        [
          cursoUfcdId || null, formadorId || null, data,
          horaInicio, horaFim, horas, obs || null, initial.id,
        ],
      );
    } else {
      exec(
        `INSERT INTO sessoes (id, curso_id, curso_ufcd_id, formador_id, data,
         hora_inicio, hora_fim, horas, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uid(), cursoId, cursoUfcdId || null, formadorId || null,
          data, horaInicio, horaFim, horas, obs || null,
        ],
      );
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold">{isEdit ? "Editar sessão" : "Nova sessão"} — {data}</h2>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500">UFCD</label>
            <select className="input mt-1" value={cursoUfcdId} onChange={(e) => setCursoUfcdId(e.target.value)}>
              <option value="">— Sem UFCD —</option>
              {ufcds.map((u) => (
                <option key={u.id} value={u.id}>
                  {[u.codigo, u.nome].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500">Formador</label>
            <select className="input mt-1" value={formadorId} onChange={(e) => setFormadorId(e.target.value)}>
              <option value="">— Em falta —</option>
              {formadores.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
            {cursoUfcdId && formadores.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">Sem formadores com competência para esta UFCD.</p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {PRESETS.map((p) => (
              <button key={p.label} type="button" className="btn btn-outline text-xs"
                onClick={() => applyPreset(p.i, p.f)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500">Início</label>
              <input type="time" className="input mt-1" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500">Fim</label>
              <input type="time" className="input mt-1" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
            </div>
          </div>
          <div className="text-xs text-slate-500">Horas contabilizadas: <strong>{horas}h</strong> {horas !== diffHoras(horaInicio, horaFim) ? "" : (horaInicio <= "13:00" && horaFim >= "14:00" ? "(menos 1h almoço)" : "")}</div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500">Observações</label>
            <textarea className="input mt-1" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
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
