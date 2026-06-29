// Realtime shim. No external server, just in-process pub/sub.
// `localChannelEmit(table, event, row)` is called by the query builder
// after each write, so subscribed channels fire the same way Supabase
// realtime would.

type Event = "INSERT" | "UPDATE" | "DELETE" | "*";
type Handler = (payload: { eventType: string; new: any; old: any; table: string }) => void;

type Subscription = { table: string; event: Event; handler: Handler };
const subs = new Map<string, Subscription[]>();

export function localChannelEmit(table: string, event: Exclude<Event, "*">, row: any) {
  const all: Subscription[] = [];
  for (const list of subs.values()) for (const s of list) if (s.table === table && (s.event === event || s.event === "*")) all.push(s);
  for (const s of all) {
    try { s.handler({ eventType: event, new: row, old: null, table }); }
    catch (err) { console.error("[local-realtime] handler error", err); }
  }
}

class LocalChannel {
  private list: Subscription[] = [];
  constructor(private name: string) {}
  on(_kind: "postgres_changes", filter: { event: Event; schema?: string; table: string }, handler: Handler) {
    this.list.push({ table: filter.table, event: filter.event, handler });
    return this;
  }
  subscribe(cb?: (status: string) => void) {
    subs.set(this.name, this.list);
    cb?.("SUBSCRIBED");
    return this;
  }
  unsubscribe() { subs.delete(this.name); }
}

export function localChannel(name: string) { return new LocalChannel(name); }
export function localRemoveChannel(ch: any) { try { ch.unsubscribe?.(); } catch {} }
