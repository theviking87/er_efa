// Utilizador financeiro ativo (independente do auth do Supabase).
// Guardado em localStorage para funcionar offline; snapshot é
// escrito em cada registo de auditoria.
import type { FinUtilizador } from "./types";

const KEY = "financeiro-utilizador-ativo";

export type UtilizadorAtivoSnapshot = {
  id: string | null;
  nome_utilizador: string;
};

export function getUtilizadorAtivo(): UtilizadorAtivoSnapshot {
  if (typeof window === "undefined") return { id: null, nome_utilizador: "sistema" };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { id: null, nome_utilizador: "sistema" };
    const parsed = JSON.parse(raw);
    return {
      id: parsed?.id ?? null,
      nome_utilizador: parsed?.nome_utilizador ?? "sistema",
    };
  } catch {
    return { id: null, nome_utilizador: "sistema" };
  }
}

export function setUtilizadorAtivo(u: Pick<FinUtilizador, "id" | "nome_utilizador"> | null) {
  if (typeof window === "undefined") return;
  if (!u) window.localStorage.removeItem(KEY);
  else window.localStorage.setItem(KEY, JSON.stringify({ id: u.id, nome_utilizador: u.nome_utilizador }));
}
