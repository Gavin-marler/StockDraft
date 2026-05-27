import { preflight, json, err } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { requirePlayerOwner } from "../_shared/auth.ts";
import { advanceDraft, draftedTickers, executePick } from "../_shared/draft.ts";
import { quote } from "../_shared/finnhub.ts";

Deno.serve(async (req) => {
  const p = preflight(req); if (p) return p;
  if (req.method !== "POST") return err("Method not allowed", 405);
  try {
    const { player_id, ticker } = await req.json();
    if (!player_id || !ticker) return err("player_id and ticker required");
    const t = String(ticker).toUpperCase();

    const { player } = await requirePlayerOwner(req, player_id);
    if (player.status !== "approved") return err("Player not approved", 403);

    const sb = serviceClient();
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

    // Live quote, falling back to cache (≤ 10 min old) if Finnhub is rate-limited.
    let price: number | null = null;
    const q = await quote(t);
    if (q) {
      price = q.price;
    } else {
      const { data: cached } = await sb.from("prices").select("price, fetched_at").eq("ticker", t).maybeSingle();
      if (cached && Date.now() - new Date(cached.fetched_at).getTime() < 10 * 60 * 1000) {
        price = Number(cached.price);
      }
    }
    if (price === null) return err(`No price found for ${t}`);

    await executePick(player.league_id, player_id, t, price, false);
    await advanceDraft(player.league_id);
    return json({ ok: true });
  } catch (e: any) {
    return err(e?.message || "unknown", 401);
  }
});
