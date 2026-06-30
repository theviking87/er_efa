export function isOfflineBuild() {
  return import.meta.env.VITE_OFFLINE === "1";
}

export async function localRows<T = any>(sql: string, params: unknown[] = []): Promise<T[] | null> {
  if (!isOfflineBuild()) return null;
  const { localQuery } = await import("@/lib/local-db");
  return localQuery<T>(sql, params);
}

export async function yieldToBrowser(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
