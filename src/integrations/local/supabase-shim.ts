// Top-level shim that replaces `@/integrations/supabase/client` when the
// build is configured for the offline desktop target (VITE_OFFLINE=1).
//
// Exports a `supabase` object whose surface matches `@supabase/supabase-js`
// closely enough for the patterns used in this app:
//   .from(table) → LocalQueryBuilder
//   .auth        → see auth-shim.ts
//   .storage     → see storage-shim.ts
//   .channel(name) / .removeChannel(ch) → see realtime-shim.ts
//   .rpc(name, args) → throws (we don't use RPC offline yet)
import { getLocalDb } from "@/lib/local-db";
import { loadRelationships, type Relationship } from "./relationships";
import { LocalQueryBuilder } from "./query-builder";
import { localAuth } from "./auth-shim";
import { localStorageApi } from "./storage-shim";
import { localChannel, localRemoveChannel } from "./realtime-shim";

// Keep auth instant. The login screen imports this file, so starting PGlite and
// applying migrations at module load can make the fields look frozen on slower
// Windows/USB drives. Initialise the local database only when data is queried.
let relsPromise: Promise<Relationship[]> | null = null;

function getRelationships() {
  if (!relsPromise) relsPromise = getLocalDb().then(loadRelationships);
  return relsPromise;
}

export const supabase = {
  from<T = any>(table: string) {
    // Lazy: each builder gets the rels promise (resolves once).
    const dbPromise = getLocalDb();
    return new LocalQueryBuilder<T>(
      undefined as unknown as any, // db is read inside execute() — we close over the promise
      table,
      getRelationships()
    ).__attachDb(dbPromise);
  },
  auth: localAuth,
  storage: localStorageApi,
  channel: localChannel,
  removeChannel: localRemoveChannel,
  rpc(name: string) {
    throw new Error(`[offline] supabase.rpc("${name}") not supported in offline build`);
  },
};

// We need to teach LocalQueryBuilder to accept a deferred db. Add a tiny
// helper here (kept out of query-builder.ts to keep that file pure).
declare module "./query-builder" {
  interface LocalQueryBuilder<T> {
    __attachDb(p: Promise<any>): this;
  }
}
(LocalQueryBuilder as any).prototype.__attachDb = function (p: Promise<any>) {
  const original = this.execute.bind(this);
  this.execute = async () => {
    (this as any).db = await p;
    return original();
  };
  return this;
};
