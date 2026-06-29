// Stub for @tanstack/react-start/server (server-only utilities).
// Never used at runtime in SPA build, but referenced through aliased modules
// before tree-shaking can drop them.
export function getRequest(): any {
  throw new Error("getRequest not available in offline build");
}
export function getRequestHeader(_: string): string | null { return null; }
export function getRequestHeaders(): Record<string, string> { return {}; }
export function setResponseHeader(_: string, __: string): void {}
export function setResponseHeaders(_: Record<string, string>): void {}
export function setResponseStatus(_: number): void {}
