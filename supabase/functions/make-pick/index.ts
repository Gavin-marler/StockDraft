import { preflight, json, err } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { compare } from "../_shared/auth.ts";
import { advanceDraft, draftedTickers, executePick } from "../_shared/draft.ts";
import { quote } from "../_shared/finnhub.ts";

Deno.serve(async (req) => {
  const p = preflight(req); if (p) return p;
  if (req.method !== "POST") return err("Method not allowed", 405);
  try {
    const { player_id, pin, ticker } = await req.json();
    if (!player_id || !pin || !ticker) return err("player_id, pin, ticker required");
    const t = String(ticker).toUpperCase();

    const sb = serviceClient();
    const { data: player } = await sb
      .from("players")
      .select("id, league_id, pin_hash, status")
      .eq("id", player_id)
      .maybeSingle();
    if (!player) return err("Player not found", 404);
    if (player.status !== "approved") return err("Player not approved", 403);
    if (!(await compare(pin, player.pin_hash))) return err("Incorrect PIN", 401);

    const { data: ds } = await sb
      .from("draft_state")
      .select("status, current_player_id, pick_deadline")
      .eq("league_id", player.league_id)
      .single();
    if (!ds || ds.status !== "picking") return err("Draft is not active");
    if (ds.current_player_id !== player_id) return err("Not your turn");
    if (ds.pick_deadline && new Date(ds.pick_deadline).getTime() < Date.now())
      return err("Pick timer has expired");

    const drafted = await draftedTickers(player.league_id);
    if (drafted.has(t)) return err(`${t} has already been drafted`);

    const q = await quote(t);
    if (!q) return err(`No price found for ${t}`);

    await executePick(player.league_id, player_id, t, q.price, false);
    await advanceDraft(player.league_id);
    return json({ ok: true });
  } catch (e: any) {
    return err(e?.message || "unknown", 500);
  }
});
