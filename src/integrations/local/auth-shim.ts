// Local auth: hardcoded user `formacao` / `ER2026`.
// Persists the "session" in localStorage so it survives reloads.
const KEY = "formacao-er-local-session";
const VALID_USER = "formacao";
const VALID_PASS = "ER2026";

type LocalSession = {
  user: { id: string; email: string; user_metadata: { username: string } };
  access_token: string;
  expires_at: number;
};

type Listener = (event: string, session: LocalSession | null) => void;
const listeners = new Set<Listener>();

function read(): LocalSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LocalSession) : null;
  } catch { return null; }
}
function write(s: LocalSession | null) {
  if (typeof window === "undefined") return;
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
}

export const localAuth = {
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    // Accept either `formacao` or `formacao@local` as username.
    const u = email.replace(/@(app\.)?local$/, "").trim().toLowerCase();
    if (u !== VALID_USER.toLowerCase() || password !== VALID_PASS) {
      return { data: { user: null, session: null }, error: { message: "Credenciais inválidas", name: "AuthError" } };
    }
    const session: LocalSession = {
      user: { id: "00000000-0000-0000-0000-000000000001", email: `${VALID_USER}@local`, user_metadata: { username: VALID_USER } },
      access_token: "local-offline-token",
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    };
    write(session);
    listeners.forEach((l) => l("SIGNED_IN", session));
    return { data: { user: session.user, session }, error: null };
  },
  async signOut() {
    write(null);
    listeners.forEach((l) => l("SIGNED_OUT", null));
    return { error: null };
  },
  async getSession() {
    return { data: { session: read() }, error: null };
  },
  async getUser() {
    const s = read();
    if (!s) return { data: { user: null }, error: { message: "Not signed in" } };
    return { data: { user: s.user }, error: null };
  },
  async updateUser(_: any) {
    // Password changes are not supported in offline mode (single hardcoded user).
    return { data: { user: read()?.user ?? null }, error: null };
  },
  onAuthStateChange(cb: Listener) {
    listeners.add(cb);
    // Mirror Supabase: fire INITIAL_SESSION async.
    queueMicrotask(() => cb("INITIAL_SESSION", read()));
    return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
  },
};
