import { preflight, json, err } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { requireLeagueAdmin } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const p = preflight(req); if (p) return p;
  if (req.method !== "POST") return err("Method not allowed", 405);
  try {
    const { league_id } = await req.json();
    if (!league_id) return err("league_id required");
    await requireLeagueAdmin(req, league_id);
    const sb = serviceClient();
    const { error } = await sb.from("leagues").delete().eq("id", league_id);
    if (error) return err(error.message, 500);
    return json({ ok: true });
  } catch (e: any) {
    return err(e?.message || "unknown", 401);
  }
});
