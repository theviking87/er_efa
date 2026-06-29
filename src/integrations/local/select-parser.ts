// PostgREST select-string parser.
//
// Input examples:
//   "id, nome, cor"
//   "*, curso:cursos(id, codigo, nome)"
//   "id, formadores:curso_ufcd_formadores(formador:formadores(nome))"
//   "curso_formando:curso_formandos!inner(curso_id)"
//
// Output: a tree of nodes (columns + nested embeds).

export type Column = { kind: "column"; name: string };
export type Embed = {
  kind: "embed";
  /** alias used in the result object key */
  alias: string;
  /** actual table to query */
  table: string;
  /** !inner / !left hint (default = left) */
  inner: boolean;
  children: SelectNode[];
};
export type SelectNode = Column | Embed;

/** Returns `{ nodes }` or throws on malformed input. */
export function parseSelect(input: string): { nodes: SelectNode[] } {
  const trimmed = (input ?? "*").trim();
  return { nodes: parseList(trimmed) };
}

function parseList(src: string): SelectNode[] {
  const parts = splitTopLevel(src, ",");
  const out: SelectNode[] = [];
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    const parenIdx = p.indexOf("(");
    if (parenIdx === -1) {
      out.push({ kind: "column", name: p });
      continue;
    }
    // embed: [alias:]table[!inner](children)
    const head = p.slice(0, parenIdx).trim();
    const body = extractBalanced(p, parenIdx);
    let alias: string;
    let table: string;
    let inner = false;
    let head2 = head;
    if (head2.endsWith("!inner")) {
      inner = true;
      head2 = head2.slice(0, -"!inner".length);
    } else if (head2.endsWith("!left")) {
      head2 = head2.slice(0, -"!left".length);
    }
    const colonIdx = head2.indexOf(":");
    if (colonIdx === -1) {
      alias = head2;
      table = head2;
    } else {
      alias = head2.slice(0, colonIdx).trim();
      table = head2.slice(colonIdx + 1).trim();
    }
    out.push({ kind: "embed", alias, table, inner, children: parseList(body) });
  }
  return out;
}

/** Split on `sep` ignoring occurrences inside (). */
function splitTopLevel(src: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (depth === 0 && ch === sep) {
      out.push(src.slice(start, i));
      start = i + 1;
    }
  }
  out.push(src.slice(start));
  return out;
}

/** Given an opening paren index, return content between that paren and its
 *  matching close. Throws on unbalanced input. */
function extractBalanced(src: string, openIdx: number): string {
  if (src[openIdx] !== "(") throw new Error("expected (");
  let depth = 1;
  for (let i = openIdx + 1; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") {
      depth--;
      if (depth === 0) return src.slice(openIdx + 1, i);
    }
  }
  throw new Error(`unbalanced parentheses in select: ${src}`);
}
