import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Contexto global do "Projeto ativo".
 * — Persistido em localStorage.
 * — Valor `"all"` significa "sem filtro" (mostrar tudo).
 * — Componentes usam useProjetoAtivo() para ler; useProjetoFiltro() aplica-o a queries.
 */

const LS_KEY = "app-projeto-ativo";

type Ctx = {
  projetoId: string; // "all" ou uuid
  setProjetoId: (v: string) => void;
};

const ProjetoCtx = createContext<Ctx>({ projetoId: "all", setProjetoId: () => {} });

export function ProjetoProvider({ children }: { children: ReactNode }) {
  const [projetoId, setState] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    return window.localStorage.getItem(LS_KEY) || "all";
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, projetoId);
  }, [projetoId]);

  const value = useMemo(() => ({ projetoId, setProjetoId: setState }), [projetoId]);
  return <ProjetoCtx.Provider value={value}>{children}</ProjetoCtx.Provider>;
}

export function useProjetoAtivo() {
  return useContext(ProjetoCtx);
}

/** Lista de projetos para selectors. */
export function useProjetosList() {
  return useQuery({
    queryKey: ["projetos-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos")
        .select("id, codigo, nome, estado, ativo")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
}
