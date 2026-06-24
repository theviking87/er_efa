import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Ordena códigos UFCD: começa pelas letras e depois números, ambos por ordem alfabética/natural. */
export function compareUfcdCodigo(a: string, b: string) {
  const aLetter = /^[A-Za-zÀ-ÿ]/.test((a ?? "").trim());
  const bLetter = /^[A-Za-zÀ-ÿ]/.test((b ?? "").trim());
  if (aLetter !== bLetter) return aLetter ? -1 : 1;
  return (a ?? "").localeCompare(b ?? "", "pt-PT", { numeric: true, sensitivity: "base" });
}
