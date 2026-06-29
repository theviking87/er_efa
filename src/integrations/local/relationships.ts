// Runtime introspection of foreign-key relationships from PGlite's
// information_schema. Built once on first use and cached.
//
// PostgREST embeds are resolved as follows:
//   parent.select("alias:child(...)")
//     - if child has FK → parent.id   → ONE-TO-MANY (array result)
//     - if parent has FK → child.id   → MANY-TO-ONE (object result)
//
// We surface both via lookup by (parent, embedTarget).
import type { LocalDb } from "@/lib/local-db";

export type Relationship = {
  parent: string;
  child: string;
  /** FK column on the side that "points away". */
  fkColumn: string;
  /** "many" = child has FK to parent (array); "one" = parent has FK to child (object). */
  cardinality: "one" | "many";
};

let _cache: Relationship[] | null = null;

export async function loadRelationships(db: LocalDb): Promise<Relationship[]> {
  if (_cache) return _cache;
  const res = await db.query<{
    table_name: string;
    column_name: string;
    foreign_table: string;
    foreign_column: string;
  }>(`
    SELECT tc.table_name, kcu.column_name,
           ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
  `);

  const rels: Relationship[] = [];
  for (const r of res.rows) {
    // many: foreign_table is the parent, table_name is the child holding the FK
    rels.push({
      parent: r.foreign_table,
      child: r.table_name,
      fkColumn: r.column_name,
      cardinality: "many",
    });
    // one: viewed from the child's side
    rels.push({
      parent: r.table_name,
      child: r.foreign_table,
      fkColumn: r.column_name,
      cardinality: "one",
    });
  }
  _cache = rels;
  return rels;
}

/** Find the relationship for `parent.select("...embedTarget(...)")`. */
export function findRelationship(
  rels: Relationship[],
  parentTable: string,
  embedTarget: string
): Relationship | null {
  return (
    rels.find((r) => r.parent === parentTable && r.child === embedTarget) ?? null
  );
}

export function resetRelationshipCache() {
  _cache = null;
}
