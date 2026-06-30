// PostgREST-flavoured query builder backed by PGlite.
//
// Goals:
//   - Cover the patterns used in this codebase (see `select-parser.ts`):
//     nested embeds, !inner, eq/neq/in/gt/gte/lt/lte/is/like/ilike/or,
//     order, range, limit, single, maybeSingle.
//   - Be a drop-in for `supabase.from("...").select("...")...` chains.
//
// Out of scope (we throw if used):
//   - rpc, full-text search, abort signals, count: 'exact' on joined queries.
//
// All public methods return `this` (or a Promise on terminal ops). Awaiting
// the builder triggers `execute()` and yields `{ data, error, count }`.
import type { LocalDb } from "@/lib/local-db";
import { parseSelect, type SelectNode, type Embed } from "./select-parser";
import { loadRelationships, type Relationship, findRelationship } from "./relationships";
import { localChannelEmit } from "./realtime-shim";

type Filter =
  | { op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "is"; col: string; val: unknown }
  | { op: "in"; col: string; vals: unknown[] }
  | { op: "or"; expr: string };

export type Result<T> = { data: T | null; error: { message: string; details?: string } | null; count: number | null };

function withQueryTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} demorou demasiado. A operação foi interrompida para evitar bloquear a aplicação.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

export class LocalQueryBuilder<T = any> implements PromiseLike<Result<T>> {
  private _select = "*";
  private _filters: Filter[] = [];
  private _order: { col: string; asc: boolean }[] = [];
  private _limit: number | null = null;
  private _rangeFrom: number | null = null;
  private _rangeTo: number | null = null;
  private _mode: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private _payload: any = null;
  private _onConflict: string | null = null;
  private _ignoreDuplicates = false;
  private _single = false;
  private _maybeSingle = false;
  private _returnRow = true;
  private _countMode: "exact" | "planned" | "estimated" | null = null;

  constructor(private db: LocalDb, private table: string, private relsPromise: Promise<Relationship[]>) {}

  // ─── builder methods ────────────────────────────────────────────────
  select(cols = "*", opts?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) {
    this._select = cols || "*";
    if (opts?.count) this._countMode = opts.count;
    if (opts?.head) this._returnRow = false;
    return this;
  }
  insert(payload: any, opts?: { onConflict?: string }) {
    this._mode = "insert";
    this._payload = payload;
    if (opts?.onConflict) this._onConflict = opts.onConflict;
    return this;
  }
  upsert(payload: any, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this._mode = "upsert";
    this._payload = payload;
    if (opts?.onConflict) this._onConflict = opts.onConflict;
    if (opts?.ignoreDuplicates) this._ignoreDuplicates = true;
    return this;
  }
  update(payload: any) { this._mode = "update"; this._payload = payload; return this; }
  delete() { this._mode = "delete"; return this; }

  eq(col: string, val: unknown) { this._filters.push({ op: "eq", col, val }); return this; }
  neq(col: string, val: unknown) { this._filters.push({ op: "neq", col, val }); return this; }
  gt(col: string, val: unknown) { this._filters.push({ op: "gt", col, val }); return this; }
  gte(col: string, val: unknown) { this._filters.push({ op: "gte", col, val }); return this; }
  lt(col: string, val: unknown) { this._filters.push({ op: "lt", col, val }); return this; }
  lte(col: string, val: unknown) { this._filters.push({ op: "lte", col, val }); return this; }
  like(col: string, val: string) { this._filters.push({ op: "like", col, val }); return this; }
  ilike(col: string, val: string) { this._filters.push({ op: "ilike", col, val }); return this; }
  is(col: string, val: null | boolean) { this._filters.push({ op: "is", col, val }); return this; }
  in(col: string, vals: unknown[]) { this._filters.push({ op: "in", col, vals }); return this; }
  not(col: string, op: string, val: unknown) {
    // Limited support: only "is null"/"is true"/etc commonly used.
    this._filters.push({ op: "or", expr: `NOT (${quoteCol(col)} ${op.toUpperCase()} ${literal(val)})` });
    return this;
  }
  or(expr: string) {
    // Supabase syntax: "col.op.val,col2.op.val2" → "(col op val OR col2 op val2)"
    const parts = expr.split(",").map((s) => orPart(s.trim())).join(" OR ");
    this._filters.push({ op: "or", expr: `(${parts})` });
    return this;
  }
  filter(col: string, op: string, val: unknown) {
    return (this as any)[op](col, val);
  }

  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this._order.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  limit(n: number) { this._limit = n; return this; }
  range(from: number, to: number) { this._rangeFrom = from; this._rangeTo = to; return this; }
  single() { this._single = true; return this; }
  maybeSingle() { this._maybeSingle = true; return this; }

  // ─── thenable ───────────────────────────────────────────────────────
  then<T1 = Result<T>, T2 = never>(
    onfulfilled?: ((value: Result<T>) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: any) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return this.execute().then(onfulfilled as any, onrejected as any);
  }

  // ─── execute ────────────────────────────────────────────────────────
  async execute(): Promise<Result<T>> {
    return withQueryTimeout(this.executeCore(), 30000, `Consulta em ${this.table}`).catch((err: any) => {
      console.error(`[local-db] query timed out/failed on ${this.table}:`, err);
      return { data: null, error: { message: String(err?.message ?? err) }, count: null };
    });
  }

  private async executeCore(): Promise<Result<T>> {
    try {
      const rels = await this.relsPromise;
      let rows: any[] = [];

      if (this._mode === "select") {
        rows = await this.runSelect(rels);
      } else if (this._mode === "insert") {
        rows = await this.runInsert();
      } else if (this._mode === "upsert") {
        rows = await this.runUpsert();
      } else if (this._mode === "update") {
        rows = await this.runUpdate();
      } else if (this._mode === "delete") {
        rows = await this.runDelete();
      }

      // For non-select writes, hydrate embeds in select() chain by re-querying.
      if (this._mode !== "select" && this._select !== "*" && rows.length > 0) {
        const ids = rows.map((r) => r.id).filter((x) => x !== undefined);
        if (ids.length) {
          const reread = new LocalQueryBuilder<any>(this.db, this.table, this.relsPromise)
            .select(this._select)
            .in("id", ids);
          const r = await reread.execute();
          if (r.data) rows = Array.isArray(r.data) ? (r.data as any[]) : [r.data];
        }
      }

      // Emit a synthetic realtime event for write ops.
      if (this._mode !== "select") {
        localChannelEmit(this.table, this._mode.toUpperCase() as any, rows[0] ?? null);
      }

      rows = rows.map(normalizeRowForClient);

      if (this._single || this._maybeSingle) {
        if (rows.length === 0) {
          if (this._maybeSingle) return { data: null, error: null, count: 0 };
          return { data: null, error: { message: "Row not found" }, count: 0 };
        }
        if (rows.length > 1 && this._single) {
          return { data: null, error: { message: "Multiple rows returned" }, count: rows.length };
        }
        return { data: rows[0] as T, error: null, count: rows.length };
      }
      return { data: rows as unknown as T, error: null, count: rows.length };
    } catch (err: any) {
      console.error(`[local-db] query failed on ${this.table}:`, err);
      return { data: null, error: { message: String(err?.message ?? err) }, count: null };
    }
  }

  // ─── SELECT ─────────────────────────────────────────────────────────
  private async runSelect(rels: Relationship[]): Promise<any[]> {
    const parsed = parseSelect(this._select);
    const { sql, params } = buildSelectSQL({
      table: this.table,
      nodes: parsed.nodes,
      filters: this._filters,
      order: this._order,
      limit: this._limit,
      rangeFrom: this._rangeFrom,
      rangeTo: this._rangeTo,
      rels,
    });
    const res = await this.db.query<any>(sql, params);
    return res.rows;
  }

  // ─── INSERT ─────────────────────────────────────────────────────────
  private async runInsert(): Promise<any[]> {
    const rowsIn = Array.isArray(this._payload) ? this._payload : [this._payload];
    if (rowsIn.length === 0) return [];
    const cols = collectCols(rowsIn);
    const { sql, params } = buildInsertSQL(this.table, cols, rowsIn);
    const res = await this.db.query<any>(sql + " RETURNING *", params);
    return res.rows;
  }
  private async runUpsert(): Promise<any[]> {
    const rowsIn = Array.isArray(this._payload) ? this._payload : [this._payload];
    if (rowsIn.length === 0) return [];
    const cols = collectCols(rowsIn);
    const conflictCols = this._onConflict ? this._onConflict.split(",").map((s) => s.trim()) : ["id"];
    const { sql, params } = buildInsertSQL(this.table, cols, rowsIn);
    const updateAssign = cols
      .filter((c) => !conflictCols.includes(c))
      .map((c) => `${quoteCol(c)} = EXCLUDED.${quoteCol(c)}`)
      .join(", ");
    const conflictClause = this._ignoreDuplicates || !updateAssign
      ? `ON CONFLICT (${conflictCols.map(quoteCol).join(",")}) DO NOTHING`
      : `ON CONFLICT (${conflictCols.map(quoteCol).join(",")}) DO UPDATE SET ${updateAssign}`;
    const res = await this.db.query<any>(`${sql} ${conflictClause} RETURNING *`, params);
    return res.rows;
  }

  // ─── UPDATE ─────────────────────────────────────────────────────────
  private async runUpdate(): Promise<any[]> {
    const cols = Object.keys(this._payload);
    if (cols.length === 0) return [];
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const c of cols) {
      params.push(this._payload[c]);
      sets.push(`${quoteCol(c)} = $${params.length}`);
    }
    const where = buildWhere(this._filters, params);
    const sql = `UPDATE ${quoteCol(this.table)} SET ${sets.join(", ")} ${where} RETURNING *`;
    const res = await this.db.query<any>(sql, params);
    return res.rows;
  }

  // ─── DELETE ─────────────────────────────────────────────────────────
  private async runDelete(): Promise<any[]> {
    const params: unknown[] = [];
    const where = buildWhere(this._filters, params);
    const sql = `DELETE FROM ${quoteCol(this.table)} ${where} RETURNING *`;
    const res = await this.db.query<any>(sql, params);
    return res.rows;
  }
}

// ─── SQL builders ─────────────────────────────────────────────────────
function buildSelectSQL(opts: {
  table: string;
  nodes: SelectNode[];
  filters: Filter[];
  order: { col: string; asc: boolean }[];
  limit: number | null;
  rangeFrom: number | null;
  rangeTo: number | null;
  rels: Relationship[];
}): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const alias = "t0";

  // Separate filters that target an embed alias (e.g. "curso_ufcd.curso_id").
  const aliasToEmbed = new Map<string, Embed>();
  for (const n of opts.nodes) if (n.kind === "embed") aliasToEmbed.set(n.alias, n);
  const outerFilters: Filter[] = [];
  const embedFilters: Record<string, Filter[]> = {};
  for (const f of opts.filters) {
    if (f.op !== "or" && typeof (f as any).col === "string" && (f as any).col.includes(".")) {
      const dotIdx = (f as any).col.indexOf(".");
      const head = (f as any).col.slice(0, dotIdx);
      const tail = (f as any).col.slice(dotIdx + 1);
      if (aliasToEmbed.has(head)) {
        (embedFilters[head] ??= []).push({ ...(f as any), col: tail });
        continue;
      }
    }
    outerFilters.push(f);
  }

  const { selectExpr, innerWhere } = buildProjection(opts.table, alias, opts.nodes, opts.rels, params, embedFilters);

  const where = buildWhere(outerFilters, params, alias);
  const extraInner = innerWhere.length ? (where ? ` AND ${innerWhere.join(" AND ")}` : ` WHERE ${innerWhere.join(" AND ")}`) : "";
  const orderBy = opts.order.length
    ? ` ORDER BY ${opts.order.map((o) => `${alias}.${quoteCol(o.col)} ${o.asc ? "ASC" : "DESC"}`).join(", ")}`
    : "";

  let pagination = "";
  if (opts.rangeFrom !== null && opts.rangeTo !== null) {
    pagination = ` LIMIT ${opts.rangeTo - opts.rangeFrom + 1} OFFSET ${opts.rangeFrom}`;
  } else if (opts.limit !== null) {
    pagination = ` LIMIT ${opts.limit}`;
  }

  const sql = `SELECT ${selectExpr} FROM ${quoteCol(opts.table)} ${alias} ${where}${extraInner}${orderBy}${pagination}`;
  return { sql, params };
}

/** Build the projection list. Embeds turn into correlated subqueries.
 *  Returns extra WHERE EXISTS clauses for `!inner` embeds (and embeds with filters). */
function buildProjection(
  table: string,
  alias: string,
  nodes: SelectNode[],
  rels: Relationship[],
  params: unknown[],
  embedFilters: Record<string, Filter[]> = {}
): { selectExpr: string; innerWhere: string[] } {
  const out: string[] = [];
  const innerWhere: string[] = [];
  for (const n of nodes) {
    if (n.kind === "column") {
      if (n.name === "*") out.push(`${alias}.*`);
      else out.push(`${alias}.${quoteCol(n.name)} AS ${quoteCol(n.name)}`);
    } else {
      const extra = embedFilters[n.alias] ?? [];
      const sub = buildEmbedSubquery(table, alias, n, rels, params, extra);
      out.push(`${sub.expr} AS ${quoteCol(n.alias)}`);
      if (n.inner || extra.length) innerWhere.push(sub.existsExpr);
    }
  }
  return { selectExpr: out.join(", "), innerWhere };
}

function buildEmbedSubquery(
  parentTable: string,
  parentAlias: string,
  embed: Embed,
  rels: Relationship[],
  params: unknown[],
  extraFilters: Filter[] = []
): { expr: string; existsExpr: string } {
  const rel = findRelationship(rels, parentTable, embed.table);
  if (!rel) {
    throw new Error(`No relationship from ${parentTable} → ${embed.table} (alias ${embed.alias})`);
  }
  const childAlias = nextAlias();
  // Build the join condition.
  let joinCond: string;
  if (rel.cardinality === "many") {
    joinCond = `${childAlias}.${quoteCol(rel.fkColumn)} = ${parentAlias}.id`;
  } else {
    joinCond = `${childAlias}.id = ${parentAlias}.${quoteCol(rel.fkColumn)}`;
  }
  const { selectExpr, innerWhere } = buildProjection(embed.table, childAlias, embed.children, rels, params);
  const extraClauses = extraFilters.length ? buildFilterClauses(extraFilters, params, childAlias) : [];
  const extraSql = extraClauses.length ? " AND " + extraClauses.join(" AND ") : "";
  const innerWhereSql = innerWhere.length ? ` AND ${innerWhere.join(" AND ")}` : "";
  const subBody = `SELECT ${selectExpr} FROM ${quoteCol(embed.table)} ${childAlias} WHERE ${joinCond}${innerWhereSql}${extraSql}`;

  let expr: string;
  if (rel.cardinality === "many") {
    expr = `(SELECT COALESCE(json_agg(row_to_json(__e)), '[]'::json) FROM (${subBody}) __e)`;
  } else {
    expr = `(SELECT row_to_json(__e) FROM (${subBody} LIMIT 1) __e)`;
  }
  const existsExpr = `EXISTS (SELECT 1 FROM ${quoteCol(embed.table)} ${childAlias} WHERE ${joinCond}${innerWhereSql}${extraSql})`;
  return { expr, existsExpr };
}

function buildFilterClauses(filters: Filter[], params: unknown[], tableAlias?: string): string[] {
  const parts: string[] = [];
  for (const f of filters) {
    if (f.op === "or") { parts.push(f.expr); continue; }
    if (f.op === "in") {
      if (f.vals.length === 0) { parts.push("FALSE"); continue; }
      const placeholders = f.vals.map((v) => { params.push(v); return `$${params.length}`; }).join(",");
      parts.push(`${refCol(f.col, tableAlias)} IN (${placeholders})`);
      continue;
    }
    if (f.op === "is") {
      const v = f.val;
      const lit = v === null ? "NULL" : v === true ? "TRUE" : v === false ? "FALSE" : literal(v);
      parts.push(`${refCol(f.col, tableAlias)} IS ${lit}`);
      continue;
    }
    params.push(f.val);
    const opMap: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "LIKE", ilike: "ILIKE" };
    parts.push(`${refCol(f.col, tableAlias)} ${opMap[f.op]} $${params.length}`);
  }
  return parts;
}

function buildWhere(filters: Filter[], params: unknown[], tableAlias?: string): string {
  if (filters.length === 0) return "";
  const parts = buildFilterClauses(filters, params, tableAlias);
  return "WHERE " + parts.join(" AND ");
}

function buildInsertSQL(table: string, cols: string[], rows: any[]): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const valuesSql: string[] = [];
  for (const row of rows) {
    const placeholders = cols.map((c) => {
      const v = row[c] === undefined ? null : row[c];
      params.push(v);
      return `$${params.length}`;
    });
    valuesSql.push(`(${placeholders.join(",")})`);
  }
  const sql = `INSERT INTO ${quoteCol(table)} (${cols.map(quoteCol).join(",")}) VALUES ${valuesSql.join(",")}`;
  return { sql, params };
}

function collectCols(rows: any[]): string[] {
  const set = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) set.add(k);
  return [...set];
}

// ─── helpers ──────────────────────────────────────────────────────────
let _aliasCounter = 0;
function nextAlias(): string { _aliasCounter++; return `e${_aliasCounter}`; }

/** Quote a Postgres identifier. Allows dot-paths (a.b) by quoting each part. */
function quoteCol(col: string): string {
  if (col === "*") return "*";
  if (col.includes(".")) return col.split(".").map(quoteCol).join(".");
  return `"${col.replace(/"/g, '""')}"`;
}
function refCol(col: string, alias?: string): string {
  if (col.includes(".")) return quoteCol(col); // user provided own qualifier
  return alias ? `${alias}.${quoteCol(col)}` : quoteCol(col);
}

function literal(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function normalizeRowForClient<T>(value: T): T {
  if (value instanceof Date) {
    const isDateOnly =
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0;
    return (isDateOnly
      ? `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`
      : value.toISOString()) as T;
  }
  if (Array.isArray(value)) return value.map(normalizeRowForClient) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = normalizeRowForClient(child);
    }
    return out as T;
  }
  return value;
}

function orPart(s: string): string {
  // "col.op.val" → 'col OP val'
  const [col, op, ...rest] = s.split(".");
  const val = rest.join(".");
  const opMap: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "LIKE", ilike: "ILIKE" };
  if (op === "is") return `${quoteCol(col)} IS ${val.toUpperCase()}`;
  return `${quoteCol(col)} ${opMap[op] ?? "="} ${literal(val)}`;
}
