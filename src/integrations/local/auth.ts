// Autenticação local (offline). Mesma API usada pela aplicação.
import { getDb } from "./db";

const SESSION_KEY = "local-auth-session";

type User = { id: string; email: string; user_metadata: Record<string, unknown>; app_metadata: Record<string, unknown>; aud: string; created_at: string };
type Session = { access_token: string; refresh_token: string; expires_at: number; token_type: string; user: User };

type Listener = (event: string, session: Session | null) => void;
const listeners = new Set<Listener>();

function readSession(): Session | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeSession(s: Session | null) {
  if (typeof localStorage === "undefined") return;
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
  listeners.forEach((l) => l(s ? "SIGNED_IN" : "SIGNED_OUT", s));
}

function makeSession(user: User): Session {
  return {
    access_token: `local-${user.id}`,
    refresh_token: `local-${user.id}`,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    token_type: "bearer",
    user,
  };
}

export const localAuth = {
  async getSession() {
    return { data: { session: readSession() }, error: null };
  },
  async getUser() {
    const s = readSession();
    if (!s) return { data: { user: null }, error: { message: "Auth session missing!", name: "AuthError", status: 401 } };
    return { data: { user: s.user }, error: null };
  },
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const db = await getDb();
    const r = await db.query<{ id: string; email: string; created_at: string }>(
      "select id, email, created_at from public._local_auth where lower(email) = lower($1) and password = $2",
      [email, password],
    );
    const row = r.rows[0];
    if (!row) {
      return {
        data: { user: null, session: null },
        error: { message: "Invalid login credentials", name: "AuthApiError", status: 400 },
      };
    }
    const user: User = {
      id: row.id,
      email: row.email,
      user_metadata: {},
      app_metadata: {},
      aud: "authenticated",
      created_at: row.created_at,
    };
    const session = makeSession(user);
    writeSession(session);
    return { data: { user, session }, error: null };
  },
  async signOut() {
    writeSession(null);
    return { error: null };
  },
  async updateUser(attrs: { password?: string; email?: string }) {
    const s = readSession();
    if (!s) return { data: { user: null }, error: { message: "Auth session missing!", name: "AuthError", status: 401 } };
    const db = await getDb();
    if (attrs.password) {
      await db.query("update public._local_auth set password = $1 where id = $2", [attrs.password, s.user.id]);
    }
    if (attrs.email) {
      await db.query("update public._local_auth set email = $1 where id = $2", [attrs.email, s.user.id]);
      s.user.email = attrs.email;
      writeSession(s);
    }
    return { data: { user: s.user }, error: null };
  },
  onAuthStateChange(cb: Listener) {
    listeners.add(cb);
    return {
      data: {
        subscription: {
          id: String(listeners.size),
          callback: cb,
          unsubscribe: () => listeners.delete(cb),
        },
      },
    };
  },
};
