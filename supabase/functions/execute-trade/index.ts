import { preflight, json, err } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { requirePlayerOwner } from "../_shared/auth.ts";
import { quote } from "../_shared/finnhub.ts";

Deno.serve(async (req) => {
  const p = preflight(req); if (p) return p;
  if (req.method !== "POST") return err("Method not allowed", 405);
  try {
    const { player_id, sell_holding_id, buy_ticker } = await req.json();
    if (!player_id || !sell_holding_id || !buy_ticker) return err("missing fields");
    const buyT = String(buy_ticker).toUpperCase();

    const { player } = await requirePlayerOwner(req, player_id);
    if (player.status !== "approved") return err("Player not approved", 403);

    const sb = serviceClient();
    const { data: playerExtra } = await sb
      .from("players")
      .select("name, last_trade_month")
      .eq("id", player_id)
      .single();

    const { data: league } = await sb
      .from("leagues")
      .select("status, end_date")
      .eq("id", player.league_id)
      .single();
    if (!league || league.status !== "active") return err("League is not active");

    const month = new Date().toISOString().slice(0, 7);
    if (playerExtra?.last_trade_month === month) return err("Already traded this month");

    const { data: holding } = await sb
      .from("holdings")
      .select("id, player_id, ticker, shares, slot_value_usd, is_cash")
      .eq("id", sell_holding_id)
      .maybeSingle();
    if (!holding || holding.player_id !== player_id) return err("Holding not found", 404);

    const { data: heldRows } = await sb
      .from("holdings")
      .select("id, ticker, players!inner(league_id)")
      .eq("players.league_id", player.league_id)
      .eq("ticker", buyT);
    if ((heldRows || []).length > 0) return err(`${buyT} is currently held by someone in this league`);

    let currentValue = Number(holding.slot_value_usd);
    if (!holding.is_cash && holding.ticker) {
      const q = await quote(holding.ticker);
      if (q) currentValue = q.price * Number(holding.shares);
    }

    const buyQ = await quote(buyT);
    if (!buyQ) return err(`No price found for ${buyT}`);
    const newShares = currentValue / buyQ.price;

    await sb.from("holdings").delete().eq("id", holding.id);
    await sb.from("holdings").insert({
      player_id,
      ticker: buyT,
      shares: newShares,
      buy_price: buyQ.price,
      slot_value_usd: currentValue,
      is_cash: false,
    });
    await sb.from("players").update({ last_trade_month: month }).eq("id", player_id);
    await sb.from("prices").upsert({
      ticker: buyT,
      price: buyQ.price,
      change_pct: buyQ.change_pct,
      fetched_at: new Date().toISOString(),
    });

    const oldLabel = holding.is_cash || !holding.ticker ? "CASH" : holding.ticker;
    await sb.from("activity").insert({
      league_id: player.league_id,
      player_id,
      type: "trade",
      ticker: buyT,
      description: `${playerExtra?.name ?? "Player"} traded ${oldLabel} for ${buyT}`,
    });

    return json({ ok: true });
  } catch (e: any) {
    return err(e?.message || "unknown", 401);
  }
});
