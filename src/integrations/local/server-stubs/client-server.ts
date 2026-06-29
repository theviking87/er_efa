// Offline stub — admin client is server-only; never reached in SPA build.
export const supabaseAdmin: any = new Proxy(
  {},
  {
    get() {
      throw new Error("supabaseAdmin não está disponível em modo offline");
    },
  },
);
