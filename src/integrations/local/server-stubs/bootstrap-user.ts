// Offline replacement: no remote user to bootstrap; the local auth-shim
// accepts `formacao` / `ER2026` directly.
export async function ensureFixedUser() {
  return { created: false };
}
