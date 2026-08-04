// Cliente local — API compatível com a usada pela aplicação, 100% offline.
import { LocalQueryBuilder } from "./postgrest";
import { localAuth } from "./auth";
import { localStorageApi } from "./storage";

function makeChannel(_name: string) {
  const channel = {
    on() {
      return channel;
    },
    subscribe() {
      return channel;
    },
    unsubscribe() {
      return Promise.resolve("ok");
    },
  };
  return channel;
}

export const supabase = {
  from(table: string) {
    return new LocalQueryBuilder(table);
  },
  rpc(_fn: string, _args?: unknown) {
    return new LocalQueryBuilder("");
  },
  auth: localAuth,
  storage: localStorageApi,
  channel: makeChannel,
  removeChannel: (_c: unknown) => Promise.resolve("ok"),
  getChannels: () => [],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

export default supabase;
