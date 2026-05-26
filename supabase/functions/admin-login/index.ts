import { preflight, json, err } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { compare, signAdminToken } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const p = preflight(req); if (p) return p;
  if (req.method !== "POST") return err("Method not allowed", 405);
  try {
    const { league_id, password } = await req.json();
    if (!league_id || !password) return err("league_id and password required");
    const sb = serviceClient();
    const { data } = await sb
      .from("leagues")
      .select("admin_password_hash")
      .eq("id", league_id)
      .maybeSingle();
    if (!data) return err("League not found", 404);
    const ok = await compare(password, data.admin_password_hash);
    if (!ok) return err("Incorrect password", 401);
    const admin_token = await signAdminToken(league_id);
    return json({ admin_token });
  } catch (e: any) {
    return err(e?.message || "unknown", 500);
  }
});
