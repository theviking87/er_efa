import { PGlite } from "@electric-sql/pglite";
import { worker } from "@electric-sql/pglite/worker";

// Runs PGlite outside the React renderer thread. This is important for the
// portable USB version: migrations/imports/large tab queries no longer freeze
// clicks and tab changes while the local database is working.
void worker({
  init: async (options) => new PGlite(options as any),
});