import { createServerFn } from "@tanstack/react-start";

const FIXED_EMAIL = "formacao@app.local";
const FIXED_PASSWORD = "ER2026";

export const ensureFixedUser = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Check if user already exists
  const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) throw listErr;
  const existing = list.users.find(u => u.email === FIXED_EMAIL);

  if (!existing) {
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: FIXED_EMAIL,
      password: FIXED_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    return { created: true };
  }

  // Ensure password matches the fixed one (in case it was changed)
  const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
    password: FIXED_PASSWORD,
    email_confirm: true,
  });
  if (updErr) throw updErr;
  return { created: false };
});
