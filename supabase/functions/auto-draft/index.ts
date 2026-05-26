import { preflight, json, err } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { verifyAdminToken } from "../_shared/auth.ts";
import { advanceDraft, executePick, pickAutoDraftTicker } from "../_shared/draft.ts";

Deno.serve(async (req) => {
  const p = preflight(req); if (p) return p;
  if (req.method !== "POST") return err("Method not allowed", 405);
  try {
    const { league_id, admin } = await req.json();
    if (!league_id) return err("league_id required");
    if (admin) {
      const tok = req.headers.get("x-admin-token");
      if (!tok) return err("admin token required", 401);
      const p = await verifyAdminToken(tok);
      if (p.league_id !== league_id) return err("admin token mismatch", 403);
    }
    const sb = serviceClient();
    const { data: ds } = await sb
      .from("draft_state")
      .select("status, current_player_id, pick_deadline")
      .eq("league_id", league_id)
      .single();
    if (!ds || ds.status !== "picking") return err("Draft is not active");
    if (!ds.current_player_id) return err("No current player");
    // If admin-triggered skip OR genuine timer expiry
    const expired = ds.pick_deadline && new Date(ds.pick_deadline).getTime() < Date.now();
    if (!admin && !expired) return err("Pick timer has not expired");

    const pick = await pickAutoDraftTicker(league_id);
    if (!pick) return err("No tickers available for auto-draft", 500);
    await executePick(league_id, ds.current_player_id, pick.ticker, pick.price, true);
    await advanceDraft(league_id);
    return json({ ok: true, ticker: pick.ticker });
  } catch (e: any) {
    return err(e?.message || "unknown", 500);
  }
});
