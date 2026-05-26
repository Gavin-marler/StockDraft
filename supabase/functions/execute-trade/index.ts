import { preflight, json, err } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { compare } from "../_shared/auth.ts";
import { quote } from "../_shared/finnhub.ts";

Deno.serve(async (req) => {
  const p = preflight(req); if (p) return p;
  if (req.method !== "POST") return err("Method not allowed", 405);
  try {
    const { player_id, pin, sell_holding_id, buy_ticker } = await req.json();
    if (!player_id || !pin || !sell_holding_id || !buy_ticker) return err("missing fields");
    const buyT = String(buy_ticker).toUpperCase();

    const sb = serviceClient();
    const { data: player } = await sb
      .from("players")
      .select("id, name, league_id, pin_hash, status, last_trade_month")
      .eq("id", player_id)
      .maybeSingle();
    if (!player) return err("Player not found", 404);
    if (player.status !== "approved") return err("Player not approved", 403);
    if (!(await compare(pin, player.pin_hash))) return err("Incorrect PIN", 401);

    const { data: league } = await sb
      .from("leagues")
      .select("status, end_date")
      .eq("id", player.league_id)
      .single();
    if (!league || league.status !== "active") return err("League is not active");

    const month = new Date().toISOString().slice(0, 7);
    if (player.last_trade_month === month) return err("Already traded this month");

    const { data: holding } = await sb
      .from("holdings")
      .select("id, player_id, ticker, shares, slot_value_usd, is_cash")
      .eq("id", sell_holding_id)
      .maybeSingle();
    if (!holding || holding.player_id !== player_id) return err("Holding not found", 404);

    // Check buy ticker is a free agent
    const { data: heldRows } = await sb
      .from("holdings")
      .select("id, ticker, players!inner(league_id)")
      .eq("players.league_id", player.league_id)
      .eq("ticker", buyT);
    if ((heldRows || []).length > 0) return err(`${buyT} is currently held by someone in this league`);

    // Current slot value
    let currentValue = Number(holding.slot_value_usd);
    if (!holding.is_cash && holding.ticker) {
      const q = await quote(holding.ticker);
      if (q) currentValue = q.price * Number(holding.shares);
      // else: stock delisted — fall back to slot_value_usd as cash equivalent
    }

    // Live price of buy ticker
    const buyQ = await quote(buyT);
    if (!buyQ) return err(`No price found for ${buyT}`);
    const newShares = currentValue / buyQ.price;

    // Replace holding atomically (delete + insert)
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
      description: `${player.name} traded ${oldLabel} for ${buyT}`,
    });

    return json({ ok: true });
  } catch (e: any) {
    return err(e?.message || "unknown", 500);
  }
});
