// Replaces `@tanstack/react-start` in the Electron SPA build.
// useServerFn becomes identity — the "server function" is just a plain
// async function in the shim, no RPC needed.

export function useServerFn<T extends (...args: any[]) => any>(fn: T): T {
  return fn;
}

// Stubs for APIs that might be imported but won't be called in the SPA.
export function createServerFn(_opts?: any): any {
  const builder: any = {
    middleware: () => builder,
    inputValidator: () => builder,
    handler: (fn: any) => fn,
  };
  return builder;
}

export function createMiddleware(): any {
  const builder: any = {
    server: () => builder,
    client: () => builder,
  };
  return builder;
}

export function createStart(): any {
  return {};
}
