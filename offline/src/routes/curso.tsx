import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { all, exec, one } from "../db/sqljs";
import { ensureColumns } from "../db/schema";
import { fmtDate, uid } from "../lib/format";
import { CursoDialog, type CursoRow } from "../components/CursoDialog";

type Tab = "dados" | "ufcds" | "formandos";

export default function CursoDetail() {
  const { id = "" } = useParams();
  const [tab, setTab] = useState<Tab>("dados");
  const [tick, setTick] = useState(0);
  const [edit, setEdit] = useState(false);

  const curso = useMemo<CursoRow | null>(() => {
    try {
      return one<CursoRow>(`SELECT * FROM cursos WHERE id=?`, [id]);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tick]);

  if (!curso) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <Link to="/cursos" className="text-sm text-slate-500 hover:text-slate-900">← Cursos</Link>
        <p className="mt-6 text-slate-500">Curso não encontrado.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link to="/cursos" className="text-sm text-slate-500 hover:text-slate-900">← Cursos</Link>
      <div className="flex items-start justify-between mt-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{curso.nome}</h1>
          <p className="text-sm text-slate-500">
            {[curso.codigo, curso.local].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <button className="btn btn-outline" onClick={() => setEdit(true)}>Editar</button>
      </div>

      <div className="border-b border-slate-200 mb-6">
        <nav className="flex gap-4 text-sm">
          {(["dados", "ufcds", "formandos"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-1 py-3 border-b-2 capitalize ${
                tab === t ? "border-slate-900 font-medium" : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {t === "dados" ? "Dados" : t === "ufcds" ? "UFCDs" : "Formandos"}
            </button>
          ))}
        </nav>
      </div>

      {tab === "dados" && <DadosTab curso={curso} />}
      {tab === "ufcds" && <UfcdsTab cursoId={id} />}
      {tab === "formandos" && <FormandosTab cursoId={id} />}

      <CursoDialog
        open={edit}
        onClose={() => setEdit(false)}
        initial={curso}
        onSaved={() => {
          setEdit(false);
          setTick((t) => t + 1);
        }}
      />
    </div>
  );
}

function DadosTab({ curso }: { curso: CursoRow }) {
  const row = (label: string, value: React.ReactNode) => (
    <div className="py-2 grid grid-cols-3 gap-3 border-b border-slate-100 last:border-0">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="col-span-2 text-sm">{value ?? "—"}</div>
    </div>
  );
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-6">
      {row("Nome", curso.nome)}
      {row("Código", curso.codigo)}
      {row("Local", curso.local)}
      {row("Início", fmtDate(curso.data_inicio))}
      {row("Fim", fmtDate(curso.data_fim))}
      {row("Horário", curso.horario)}
      {row("Estado", curso.estado)}
      {row("Observações", curso.observacoes ? (
        <pre className="whitespace-pre-wrap font-sans">{curso.observacoes}</pre>
      ) : null)}
    </div>
  );
}

// ---- UFCDs tab ----------------------------------------------------------

type UfcdLink = {
  id: string;
  ufcd_id: string;
  codigo?: string | null;
  nome?: string | null;
  horas?: number | string | null;
  estado?: string | null;
};

function compareUfcd(a: { codigo?: string | null }, b: { codigo?: string | null }) {
  const ac = (a.codigo ?? "").toString();
  const bc = (b.codigo ?? "").toString();
  const aL = /^[A-Za-z]/.test(ac);
  const bL = /^[A-Za-z]/.test(bc);
  if (aL !== bL) return aL ? -1 : 1;
  return ac.localeCompare(bc, "pt", { numeric: true });
}

function UfcdsTab({ cursoId }: { cursoId: string }) {
  const [tick, setTick] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);

  const links = useMemo<UfcdLink[]>(() => {
    try {
      return all<UfcdLink>(
        `SELECT cu.id, cu.ufcd_id, u.codigo, u.nome, u.horas, cu.estado
         FROM curso_ufcds cu
         LEFT JOIN ufcds u ON u.id = cu.ufcd_id
         WHERE cu.curso_id = ?`,
        [cursoId],
      );
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursoId, tick]);

  const sorted = [...links].sort(compareUfcd);
  const totalHoras = sorted.reduce((s, l) => s + (Number(l.horas) || 0), 0);

  function remover(linkId: string) {
    if (!confirm("Remover esta UFCD do curso?")) return;
    exec(`DELETE FROM curso_ufcds WHERE id=?`, [linkId]);
    setTick((t) => t + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">
          <span className="font-medium">{sorted.length}</span> UFCDs ·{" "}
          <span className="font-medium">{totalHoras}h</span> totais
        </div>
        <button className="btn btn-primary" onClick={() => setPickerOpen(true)}>+ Atribuir UFCD</button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left font-medium px-4 py-2.5 w-24">Código</th>
              <th className="text-left font-medium px-4 py-2.5">Nome</th>
              <th className="text-left font-medium px-4 py-2.5 w-16">Horas</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Sem UFCDs atribuídas.</td></tr>
            )}
            {sorted.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2.5 font-mono text-xs">{l.codigo ?? "—"}</td>
                <td className="px-4 py-2.5">{l.nome ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-500">{l.horas ?? "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  <button className="text-xs text-red-500 hover:text-red-700" onClick={() => remover(l.id)}>
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pickerOpen && (
        <UfcdPicker
          cursoId={cursoId}
          alreadyIds={new Set(links.map((l) => l.ufcd_id))}
          onClose={() => setPickerOpen(false)}
          onSaved={() => {
            setPickerOpen(false);
            setTick((t) => t + 1);
          }}
        />
      )}
    </div>
  );
}

function UfcdPicker({
  cursoId,
  alreadyIds,
  onClose,
  onSaved,
}: {
  cursoId: string;
  alreadyIds: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const ufcds = useMemo(() => {
    try {
      return all<{ id: string; codigo?: string | null; nome?: string | null; horas?: number | null }>(
        `SELECT id, codigo, nome, horas FROM ufcds`,
      );
    } catch {
      return [];
    }
  }, []);

  const list = ufcds
    .filter((u) => !alreadyIds.has(u.id))
    .filter((u) => {
      if (!q) return true;
      const s = q.toLowerCase();
      return (
        (u.codigo ?? "").toString().toLowerCase().includes(s) ||
        (u.nome ?? "").toLowerCase().includes(s)
      );
    })
    .sort(compareUfcd);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function save() {
    if (selected.size === 0) return;
    ensureColumns("curso_ufcds", ["curso_id", "ufcd_id", "estado"]);
    for (const ufcdId of selected) {
      exec(
        `INSERT INTO curso_ufcds (id, curso_id, ufcd_id, estado) VALUES (?, ?, ?, ?)`,
        [uid(), cursoId, ufcdId, "por_iniciar"],
      );
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold">Atribuir UFCDs</h2>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>
        <div className="p-4 border-b border-slate-100">
          <input
            className="input"
            placeholder="Pesquisar UFCD…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-auto">
          {list.length === 0 && (
            <p className="p-6 text-sm text-slate-500 text-center">Sem UFCDs disponíveis.</p>
          )}
          <ul className="divide-y divide-slate-100">
            {list.map((u) => (
              <li key={u.id}>
                <label className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(u.id)}
                    onChange={() => toggle(u.id)}
                  />
                  <span className="font-mono text-xs w-20 text-slate-500">{u.codigo ?? "—"}</span>
                  <span className="flex-1 text-sm">{u.nome ?? "—"}</span>
                  <span className="text-xs text-slate-400">{u.horas ?? "—"}h</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="px-6 py-3 border-t border-slate-200 flex justify-between items-center">
          <span className="text-xs text-slate-500">{selected.size} selecionada(s)</span>
          <div className="flex gap-2">
            <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={save} disabled={selected.size === 0}>
              Atribuir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Formandos tab ------------------------------------------------------

type FormandoLink = {
  id: string;
  formando_id: string;
  nome?: string | null;
  nif?: string | null;
  email?: string | null;
};

function FormandosTab({ cursoId }: { cursoId: string }) {
  const [tick, setTick] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);

  const links = useMemo<FormandoLink[]>(() => {
    try {
      return all<FormandoLink>(
        `SELECT cf.id, cf.formando_id, f.nome, f.nif, f.email
         FROM curso_formandos cf
         LEFT JOIN formandos f ON f.id = cf.formando_id
         WHERE cf.curso_id = ?
         ORDER BY f.nome COLLATE NOCASE`,
        [cursoId],
      );
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursoId, tick]);

  function remover(linkId: string) {
    if (!confirm("Remover este formando do curso?")) return;
    exec(`DELETE FROM curso_formandos WHERE id=?`, [linkId]);
    setTick((t) => t + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">
          <span className="font-medium">{links.length}</span> formandos
        </div>
        <button className="btn btn-primary" onClick={() => setPickerOpen(true)}>+ Inscrever formando</button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Nome</th>
              <th className="text-left font-medium px-4 py-2.5">NIF</th>
              <th className="text-left font-medium px-4 py-2.5">Email</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {links.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Sem formandos inscritos.</td></tr>
            )}
            {links.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2.5">{l.nome ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-500">{l.nif ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-500">{l.email ?? "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  <button className="text-xs text-red-500 hover:text-red-700" onClick={() => remover(l.id)}>
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pickerOpen && (
        <FormandoPicker
          cursoId={cursoId}
          alreadyIds={new Set(links.map((l) => l.formando_id))}
          onClose={() => setPickerOpen(false)}
          onSaved={() => {
            setPickerOpen(false);
            setTick((t) => t + 1);
          }}
        />
      )}
    </div>
  );
}

function FormandoPicker({
  cursoId,
  alreadyIds,
  onClose,
  onSaved,
}: {
  cursoId: string;
  alreadyIds: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const formandos = useMemo(() => {
    try {
      return all<{ id: string; nome?: string | null; nif?: string | null; email?: string | null }>(
        `SELECT id, nome, nif, email FROM formandos ORDER BY nome COLLATE NOCASE`,
      );
    } catch {
      return [];
    }
  }, []);

  const list = formandos
    .filter((f) => !alreadyIds.has(f.id))
    .filter((f) => {
      if (!q) return true;
      const s = q.toLowerCase();
      return (
        (f.nome ?? "").toLowerCase().includes(s) ||
        (f.nif ?? "").includes(q) ||
        (f.email ?? "").toLowerCase().includes(s)
      );
    });

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function save() {
    if (selected.size === 0) return;
    ensureColumns("curso_formandos", ["curso_id", "formando_id"]);
    for (const formandoId of selected) {
      exec(
        `INSERT INTO curso_formandos (id, curso_id, formando_id) VALUES (?, ?, ?)`,
        [uid(), cursoId, formandoId],
      );
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold">Inscrever formandos</h2>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>
        <div className="p-4 border-b border-slate-100">
          <input
            className="input"
            placeholder="Pesquisar por nome, NIF ou email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-auto">
          {list.length === 0 && (
            <p className="p-6 text-sm text-slate-500 text-center">Sem formandos disponíveis.</p>
          )}
          <ul className="divide-y divide-slate-100">
            {list.map((f) => (
              <li key={f.id}>
                <label className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(f.id)}
                    onChange={() => toggle(f.id)}
                  />
                  <span className="flex-1 text-sm">{f.nome ?? "—"}</span>
                  <span className="text-xs text-slate-400">{f.nif ?? f.email ?? ""}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="px-6 py-3 border-t border-slate-200 flex justify-between items-center">
          <span className="text-xs text-slate-500">{selected.size} selecionado(s)</span>
          <div className="flex gap-2">
            <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={save} disabled={selected.size === 0}>
              Inscrever
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
