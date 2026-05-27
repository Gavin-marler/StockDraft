import { preflight, json, err } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { requireUser } from "../_shared/auth.ts";
import { advanceDraft, executePick, pickAutoDraftTicker } from "../_shared/draft.ts";

// Called either:
//  - by any signed-in league member when the pick timer has expired (race-safe),
//  - or by the league admin to skip the current pick (admin=true).
Deno.serve(async (req) => {
  const p = preflight(req); if (p) return p;
  if (req.method !== "POST") return err("Method not allowed", 405);
  try {
    const user = await requireUser(req);
    const { league_id, admin } = await req.json();
    if (!league_id) return err("league_id required");

    const sb = serviceClient();

    // Caller must be a member of the league (admin or approved player).
    const { data: league } = await sb
      .from("leagues")
      .select("admin_user_id")
      .eq("id", league_id)
      .single();
    if (!league) return err("League not found", 404);
    const isAdmin = league.admin_user_id === user.id;
    if (!isAdmin) {
      const { data: membership } = await sb
        .from("players")
        .select("id")
        .eq("league_id", league_id)
        .eq("auth_user_id", user.id)
        .eq("status", "approved")
        .maybeSingle();
      if (!membership) return err("Not a member of this league", 403);
    }
    if (admin && !isAdmin) return err("Only the admin can skip a pick", 403);

    const { data: ds } = await sb
      .from("draft_state")
      .select("status, current_player_id, pick_deadline")
      .eq("league_id", league_id)
      .single();
    if (!ds || ds.status !== "picking") return err("Draft is not active");
    if (!ds.current_player_id) return err("No current player");
    const expired = ds.pick_deadline && new Date(ds.pick_deadline).getTime() < Date.now();
    if (!admin && !expired) return err("Pick timer has not expired");

    const pick = await pickAutoDraftTicker(league_id);
    if (!pick) return err("No tickers available for auto-draft", 500);
    await executePick(league_id, ds.current_player_id, pick.ticker, pick.price, true);
    await advanceDraft(league_id);
    return json({ ok: true, ticker: pick.ticker });
  } catch (e: any) {
    return err(e?.message || "unknown", 401);
  }
});
