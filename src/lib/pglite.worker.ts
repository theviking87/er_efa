import { PGlite } from "@electric-sql/pglite";
import { OpfsAhpFS } from "@electric-sql/pglite/opfs-ahp";
import { worker } from "@electric-sql/pglite/worker";

// Runs PGlite outside the React renderer thread. This is important for the
// portable USB version: migrations/imports/large tab queries no longer freeze
// clicks and tab changes while the local database is working.
void worker({
  init: async (options) => {
    const opts = options as any;
    if (opts.meta?.filesystem === "opfs-ahp") return new PGlite({ ...opts, meta: undefined, fs: new OpfsAhpFS("/formacao-er-db") });
    return new PGlite(opts);
  },
});