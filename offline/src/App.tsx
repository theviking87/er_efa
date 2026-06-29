import { Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { Gate } from "./gate";
import Dashboard from "./routes/dashboard";
import FormadoresList from "./routes/formadores";
import FormadorDetail from "./routes/formador";
import FormandosList from "./routes/formandos";
import FormandoDetail from "./routes/formando";
import CursosList from "./routes/cursos";
import CursoDetail from "./routes/curso";
import UfcdsList from "./routes/ufcds";
import CronogramaGeral from "./routes/cronograma";
import { flushNow } from "./db/sqljs";
import { forgetRoot } from "./db/persistence";

function Shell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  async function changeFolder() {
    await flushNow();
    await forgetRoot();
    location.reload();
  }
  const navItem = (to: string, label: string) => {
    const active = to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to);
    return (
      <Link
        to={to}
        className={`block px-3 py-2 rounded-md ${active ? "bg-slate-800 text-white" : "hover:bg-slate-800"}`}
      >
        {label}
      </Link>
    );
  };
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-4 h-14 flex items-center font-semibold tracking-tight border-b border-slate-800">
          Formação ER
        </div>
        <nav className="flex-1 p-2 space-y-1 text-sm">
          {navItem("/", "Painel")}
          {navItem("/cursos", "Cursos")}
          {navItem("/cronograma", "Cronograma")}
          {navItem("/formadores", "Formadores")}
          {navItem("/formandos", "Formandos")}
          {navItem("/ufcds", "UFCDs")}
        </nav>
        <div className="p-2 border-t border-slate-800 text-xs text-slate-400 space-y-1">
          <button className="w-full text-left px-3 py-1.5 rounded hover:bg-slate-800" onClick={() => flushNow()}>
            Gravar agora
          </button>
          <button className="w-full text-left px-3 py-1.5 rounded hover:bg-slate-800" onClick={changeFolder}>
            Mudar de pasta…
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-auto bg-slate-50">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Gate>
      <Shell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cursos" element={<CursosList />} />
          <Route path="/cursos/:id" element={<CursoDetail />} />
          <Route path="/cronograma" element={<CronogramaGeral />} />
          <Route path="/formadores" element={<FormadoresList />} />
          <Route path="/formadores/:id" element={<FormadorDetail />} />
          <Route path="/formandos" element={<FormandosList />} />
          <Route path="/formandos/:id" element={<FormandoDetail />} />
          <Route path="/ufcds" element={<UfcdsList />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </Gate>
  );
}


