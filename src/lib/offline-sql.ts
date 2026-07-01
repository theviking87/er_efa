export function isOfflineBuild() {
  return import.meta.env.VITE_OFFLINE === "1";
}

export async function localRows<T = any>(sql: string, params: unknown[] = []): Promise<T[] | null> {
  if (!isOfflineBuild()) return null;
  const { localQuery } = await import("@/lib/local-db");
  return localQuery<T>(sql, params);
}

export async function localExecSql(sql: string): Promise<boolean> {
  if (!isOfflineBuild()) return false;
  const { localExec } = await import("@/lib/local-db");
  await localExec(sql);
  return true;
}

export async function yieldToBrowser(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export async function paintBeforeHeavyWork(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
