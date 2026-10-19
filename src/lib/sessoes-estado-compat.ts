// Bases antigas ainda sem sessoes.estado: todas as sessões são tratadas como realizadas.
type Resultado<T> = { data: T; error: { message: string } | null };

export function semColunaEstado(error: { message?: string } | null | undefined) {
  return !!error?.message && /sessoes\.estado|column .*estado.* does not exist/i.test(error.message);
}

export async function consultaSessoes<T>(consulta: (comEstado: boolean) => PromiseLike<Resultado<T>>): Promise<Resultado<T>> {
  const r = await consulta(true);
  return semColunaEstado(r.error) ? consulta(false) : r;
}