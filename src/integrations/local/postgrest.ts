// Tradutor PostgREST -> SQL sobre a base local (PGlite).
// Implementa a mesma API de consulta usada pela aplicação (supabase-js).
import { getDb, getFks, getPk } from "./db";

type Filter = { kind: "sql"; sql: string; params: unknown[] };

export type LocalResult<T = unknown> = {
  data: T | null;
  error: { message: string; details: string; hint: string; code: string } | null;
  count: number | null;
  status: number;
  statusText: string;
};

/* ------------------------------- parser ---------------------------------- */

type Field =
  | { type: "column"; name: string; alias?: string }
  | { type: "embed"; table: string; alias?: string; hint?: string; inner?: boolean; fields: Field[] };

function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === sep && depth === 0) {
      out.push(buf);
      buf = "";
    } else buf += ch;
  }
  if (buf.trim() !== "") out.push(buf);
  return out.map((x) => x.trim()).filter(Boolean);
}

export function parseSelect(select: string): Field[] {
  return splitTopLevel(select.replace(/\s+/g, " "), ",").map((tokenRaw) => {
    let token = tokenRaw.trim();
    let alias: string | undefined;
    const colon = token.indexOf(":");
    const paren = token.indexOf("(");
    if (colon > -1 && (paren === -1 || colon < paren)) {
      alias = token.slice(0, colon).trim();
      token = token.slice(colon + 1).trim();
    }
    if (paren === -1 || token.indexOf("(") === -1) {
      return { type: "column", name: token, alias };
    }
    const open = token.indexOf("(");
    const head = token.slice(0, open).trim();
    const body = token.slice(open + 1, token.lastIndexOf(")"));
    const [namePart, ...mods] = head.split("!").map((x) => x.trim());
    const inner = mods.includes("inner");
    const hint = mods.find((m) => m !== "inner" && m !== "left");
    return { type: "embed", table: namePart, alias, hint, inner, fields: parseSelect(body) };
  });
}

/* ------------------------------ SQL builder ------------------------------- */

let aliasSeq = 0;
function nextAlias() {
  aliasSeq = (aliasSeq + 1) % 100000;
  return `t${aliasSeq}`;
}

function q(id: string) {
  return `"${id.replace(/"/g, '""')}"`;
}

function findRelation(parentTable: string, embedTable: string, hint?: string) {
  const fks = getFks();
  const asChild = fks.filter(
    (f) => f.child === parentTable && f.parent === embedTable && (!hint || f.constraint === hint || f.childCols.includes(hint)),
  );
  if (asChild.length) return { kind: "one" as const, fk: asChild[0] };
  const asParent = fks.filter(
    (f) => f.parent === parentTable && f.child === embedTable && (!hint || f.constraint === hint || f.childCols.includes(hint)),
  );
  if (asParent.length) return { kind: "many" as const, fk: asParent[0] };
  // fallback sem hint
  const anyChild = fks.find((f) => f.child === parentTable && f.parent === embedTable);
  if (anyChild) return { kind: "one" as const, fk: anyChild };
  const anyParent = fks.find((f) => f.parent === parentTable && f.child === embedTable);
  if (anyParent) return { kind: "many" as const, fk: anyParent };
  return null;
}

function buildColumns(table: string, alias: string, fields: Field[], params: unknown[]): string[] {
  const cols: string[] = [];
  for (const f of fields) {
    if (f.type === "column") {
      if (f.name === "*") cols.push(`${q(alias)}.*`);
      else cols.push(`${q(alias)}.${q(f.name)} as ${q(f.alias ?? f.name)}`);
      continue;
    }
    const rel = findRelation(table, f.table, f.hint);
    const out = f.alias ?? f.table;
    if (!rel) {
      cols.push(`null::json as ${q(out)}`);
      continue;
    }
    const sub = nextAlias();
    const subCols = buildColumns(f.table, sub, f.fields.length ? f.fields : [{ type: "column", name: "*" }], params);
    if (rel.kind === "many") {
      const on = rel.fk.childCols
        .map((c, i) => `${q(sub)}.${q(c)} = ${q(alias)}.${q(rel.fk.parentCols[i])}`)
        .join(" and ");
      cols.push(
        `(select coalesce(json_agg(to_jsonb(_s)), '[]'::json) from (select ${subCols.join(", ")} from public.${q(f.table)} ${q(sub)} where ${on}) _s) as ${q(out)}`,
      );
    } else {
      const on = rel.fk.childCols
        .map((c, i) => `${q(sub)}.${q(rel.fk.parentCols[i])} = ${q(alias)}.${q(c)}`)
        .join(" and ");
      cols.push(
        `(select to_jsonb(_s) from (select ${subCols.join(", ")} from public.${q(f.table)} ${q(sub)} where ${on}) _s) as ${q(out)}`,
      );
    }
  }
  return cols;
}

function innerJoinConditions(table: string, alias: string, fields: Field[]): string[] {
  const conds: string[] = [];
  for (const f of fields) {
    if (f.type !== "embed" || !f.inner) continue;
    const rel = findRelation(table, f.table, f.hint);
    if (!rel) continue;
    const sub = nextAlias();
    const on =
      rel.kind === "many"
        ? rel.fk.childCols.map((c, i) => `${q(sub)}.${q(c)} = ${q(alias)}.${q(rel.fk.parentCols[i])}`).join(" and ")
        : rel.fk.childCols.map((c, i) => `${q(sub)}.${q(rel.fk.parentCols[i])} = ${q(alias)}.${q(c)}`).join(" and ");
    conds.push(`exists (select 1 from public.${q(f.table)} ${q(sub)} where ${on})`);
  }
  return conds;
}

/* -------------------------------- builder --------------------------------- */

const OPS: Record<string, string> = {
  eq: "=",
  neq: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  like: "like",
  ilike: "ilike",
};

export class LocalQueryBuilder<T = unknown> implements PromiseLike<LocalResult<T>> {
  private table: string;
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private selectStr: string | null = null;
  private filters: Filter[] = [];
  private orders: string[] = [];
  private limitN: number | null = null;
  private offsetN = 0;
  private mode: "many" | "single" | "maybe" = "many";
  private values: Record<string, unknown>[] = [];
  private conflictCols: string[] | null = null;
  private ignoreDuplicates = false;
  private wantCount: string | null = null;
  private headOnly = false;
  private throwErr = false;

  constructor(table: string) {
    this.table = table;
  }

  /* ------------------------------ operações ------------------------------ */
  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    this.selectStr = cols || "*";
    if (opts?.count) this.wantCount = opts.count;
    if (opts?.head) this.headOnly = true;
    return this;
  }
  insert(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.op = "insert";
    this.values = Array.isArray(values) ? values : [values];
    this.selectStr = null;
    return this;
  }
  upsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    opts?: { onConflict?: string; ignoreDuplicates?: boolean },
  ) {
    this.op = "upsert";
    this.values = Array.isArray(values) ? values : [values];
    this.conflictCols = opts?.onConflict ? opts.onConflict.split(",").map((c) => c.trim()) : null;
    this.ignoreDuplicates = !!opts?.ignoreDuplicates;
    this.selectStr = null;
    return this;
  }
  update(values: Record<string, unknown>) {
    this.op = "update";
    this.values = [values];
    this.selectStr = null;
    return this;
  }
  delete() {
    this.op = "delete";
    this.selectStr = null;
    return this;
  }

  /* -------------------------------- filtros ------------------------------- */
  private push(sql: string, params: unknown[] = []) {
    this.filters.push({ kind: "sql", sql, params });
    return this;
  }
  private col(name: string) {
    return `${q(this.table)}.${q(name)}`;
  }
  eq(c: string, v: unknown) {
    return v === null ? this.push(`${this.col(c)} is null`) : this.push(`${this.col(c)} = ?`, [v]);
  }
  neq(c: string, v: unknown) {
    return this.push(`${this.col(c)} is distinct from ?`, [v]);
  }
  gt(c: string, v: unknown) {
    return this.push(`${this.col(c)} > ?`, [v]);
  }
  gte(c: string, v: unknown) {
    return this.push(`${this.col(c)} >= ?`, [v]);
  }
  lt(c: string, v: unknown) {
    return this.push(`${this.col(c)} < ?`, [v]);
  }
  lte(c: string, v: unknown) {
    return this.push(`${this.col(c)} <= ?`, [v]);
  }
  like(c: string, v: string) {
    return this.push(`${this.col(c)}::text like ?`, [v]);
  }
  ilike(c: string, v: string) {
    return this.push(`${this.col(c)}::text ilike ?`, [v]);
  }
  is(c: string, v: unknown) {
    if (v === null) return this.push(`${this.col(c)} is null`);
    return this.push(`${this.col(c)} is ${v ? "true" : "false"}`);
  }
  in(c: string, vals: unknown[]) {
    if (!vals || vals.length === 0) return this.push("false");
    return this.push(`${this.col(c)}::text = any(?::text[])`, [vals.map((v) => String(v))]);
  }
  contains(c: string, v: unknown) {
    return this.push(`${this.col(c)} @> ?::jsonb`, [JSON.stringify(v)]);
  }
  match(obj: Record<string, unknown>) {
    for (const [k, v] of Object.entries(obj)) this.eq(k, v);
    return this;
  }
  filter(c: string, op: string, v: unknown) {
    if (op === "is") return this.is(c, v === "null" ? null : v);
    if (op === "in") return this.in(c, Array.isArray(v) ? v : String(v).replace(/^\(|\)$/g, "").split(","));
    const sqlOp = OPS[op];
    if (!sqlOp) throw new Error(`Operador não suportado: ${op}`);
    return this.push(`${this.col(c)} ${sqlOp} ?`, [v]);
  }
  not(c: string, op: string, v: unknown) {
    if (op === "is") return this.push(`${this.col(c)} is not ${v === null || v === "null" ? "null" : v ? "true" : "false"}`);
    const sqlOp = OPS[op] ?? "=";
    return this.push(`not (${this.col(c)} ${sqlOp} ?)`, [v]);
  }
  or(expr: string) {
    const parts = splitTopLevel(expr, ",");
    const sqls: string[] = [];
    const params: unknown[] = [];
    for (const p of parts) {
      const [c, op, ...rest] = p.split(".");
      const raw = rest.join(".");
      if (op === "is") {
        sqls.push(`${this.col(c)} is ${raw === "null" ? "null" : raw === "true" ? "true" : "false"}`);
      } else {
        const sqlOp = OPS[op] ?? "=";
        sqls.push(`${this.col(c)} ${sqlOp} ?`);
        params.push(raw);
      }
    }
    return this.push(`(${sqls.join(" or ")})`, params);
  }

  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean; referencedTable?: string }) {
    if (opts?.referencedTable) return this;
    const dir = opts?.ascending === false ? "desc" : "asc";
    const nulls = opts?.nullsFirst === true ? " nulls first" : opts?.nullsFirst === false ? " nulls last" : "";
    this.orders.push(`${this.col(col)} ${dir}${nulls}`);
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.offsetN = from;
    this.limitN = to - from + 1;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }
  throwOnError() {
    this.throwErr = true;
    return this;
  }
  abortSignal() {
    return this;
  }
  returns<R>() {
    return this as unknown as LocalQueryBuilder<R>;
  }
  csv() {
    return this;
  }

  /* ------------------------------- execução ------------------------------- */
  private whereSql(params: unknown[], extra: string[] = []) {
    const parts = [...extra];
    for (const f of this.filters) {
      let sql = f.sql;
      for (const p of f.params) {
        params.push(p);
        sql = sql.replace("?", `$${params.length}`);
      }
      parts.push(sql);
    }
    return parts.length ? ` where ${parts.join(" and ")}` : "";
  }

  private literal(params: unknown[], v: unknown): string {
    if (v !== null && typeof v === "object" && !(v instanceof Date)) {
      params.push(JSON.stringify(v));
      return `$${params.length}::jsonb`;
    }
    params.push(v instanceof Date ? v.toISOString() : v);
    return `$${params.length}`;
  }

  private async run(): Promise<LocalResult<T>> {
    const db = await getDb();
    const params: unknown[] = [];
    const selectStr = this.selectStr ?? "*";
    const fields = parseSelect(selectStr);

    if (this.op === "select") {
      let count: number | null = null;
      if (this.wantCount) {
        const cp: unknown[] = [];
        const cw = this.whereSql(cp);
        const r = await db.query<{ n: number }>(
          `select count(*)::int as n from public.${q(this.table)}${cw}`,
          cp as never[],
        );
        count = r.rows[0]?.n ?? 0;
      }
      if (this.headOnly) {
        return { data: null as T, error: null, count, status: 200, statusText: "OK" };
      }
      const cols = buildColumns(this.table, this.table, fields, params);
      const extra = innerJoinConditions(this.table, this.table, fields);
      const where = this.whereSql(params, extra);
      const order = this.orders.length ? ` order by ${this.orders.join(", ")}` : "";
      const limit = this.limitN !== null ? ` limit ${this.limitN}` : "";
      const offset = this.offsetN ? ` offset ${this.offsetN}` : "";
      const inner = `select ${cols.join(", ")}, row_number() over (${order ? `order by ${this.orders.join(", ")}` : ""}) as _ord from public.${q(this.table)}${where}${order}${limit}${offset}`;
      const sql = `select coalesce(json_agg((to_jsonb(_q) - '_ord') order by _q._ord), '[]'::json)::text as _d from (${inner}) _q`;
      const res = await db.query<{ _d: string }>(sql, params as never[]);
      const rows = JSON.parse(res.rows[0]?._d ?? "[]");
      return this.finish(rows, count);
    }

    // mutações
    let sql = "";
    const pk = getPk(this.table);
    if (this.op === "insert" || this.op === "upsert") {
      const keys = Array.from(new Set(this.values.flatMap((v) => Object.keys(v))));
      if (keys.length === 0) throw new Error("Sem valores para inserir");
      const rowsSql = this.values
        .map((row) => `(${keys.map((k) => (k in row ? this.literal(params, row[k]) : "default")).join(", ")})`)
        .join(", ");
      sql = `insert into public.${q(this.table)} (${keys.map(q).join(", ")}) values ${rowsSql}`;
      if (this.op === "upsert") {
        const conflict = this.conflictCols ?? pk;
        if (this.ignoreDuplicates) {
          sql += ` on conflict (${conflict.map(q).join(", ")}) do nothing`;
        } else {
          const updates = keys.filter((k) => !conflict.includes(k));
          sql += updates.length
            ? ` on conflict (${conflict.map(q).join(", ")}) do update set ${updates.map((k) => `${q(k)} = excluded.${q(k)}`).join(", ")}`
            : ` on conflict (${conflict.map(q).join(", ")}) do nothing`;
        }
      }
      sql += " returning *";
    } else if (this.op === "update") {
      const row = this.values[0] ?? {};
      const sets = Object.keys(row).map((k) => `${q(k)} = ${this.literal(params, row[k])}`);
      sql = `update public.${q(this.table)} set ${sets.join(", ")}${this.whereSql(params)} returning *`;
    } else {
      sql = `delete from public.${q(this.table)}${this.whereSql(params)} returning *`;
    }

    const wrapped = `with _r as (${sql}) select coalesce(json_agg(to_jsonb(_r)), '[]'::json)::text as _d from _r`;
    const res = await db.query<{ _d: string }>(wrapped, params as never[]);
    let rows = JSON.parse(res.rows[0]?._d ?? "[]") as Record<string, unknown>[];

    if (this.selectStr === null) {
      return { data: null as T, error: null, count: null, status: 200, statusText: "OK" };
    }
    // Se o select pedido tem relações embebidas, reconsulta pelas chaves primárias.
    if (this.selectStr.includes("(") && rows.length) {
      const key = pk[0];
      const ids = rows.map((r) => r[key]);
      const rq = new LocalQueryBuilder(this.table).select(this.selectStr).in(key, ids as unknown[]);
      const sub = await rq.run();
      rows = (sub.data as unknown as Record<string, unknown>[]) ?? [];
    } else if (this.selectStr !== "*") {
      const wanted = parseSelect(this.selectStr)
        .filter((f) => f.type === "column" && f.name !== "*")
        .map((f) => (f as { name: string; alias?: string }));
      if (wanted.length) {
        rows = rows.map((r) => {
          const o: Record<string, unknown> = {};
          for (const w of wanted) o[w.alias ?? w.name] = r[w.name];
          return o;
        });
      }
    }
    return this.finish(rows, null);
  }

  private finish(rows: unknown[], count: number | null): LocalResult<T> {
    if (this.mode === "single") {
      if (rows.length !== 1) {
        return {
          data: null,
          error: {
            message: rows.length === 0 ? "JSON object requested, multiple (or no) rows returned" : "Multiple rows returned",
            details: "",
            hint: "",
            code: "PGRST116",
          },
          count,
          status: 406,
          statusText: "Not Acceptable",
        };
      }
      return { data: rows[0] as T, error: null, count, status: 200, statusText: "OK" };
    }
    if (this.mode === "maybe") {
      return { data: (rows[0] ?? null) as T, error: null, count, status: 200, statusText: "OK" };
    }
    return { data: rows as T, error: null, count, status: 200, statusText: "OK" };
  }

  then<R1 = LocalResult<T>, R2 = never>(
    onfulfilled?: ((value: LocalResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run()
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        if (this.throwErr) throw e;
        return {
          data: null,
          error: { message, details: "", hint: "", code: "LOCAL" },
          count: null,
          status: 400,
          statusText: "Bad Request",
        } as LocalResult<T>;
      })
      .then((r) => {
        if (this.throwErr && r.error) throw new Error(r.error.message);
        return r;
      })
      .then(onfulfilled as never, onrejected as never);
  }
}
