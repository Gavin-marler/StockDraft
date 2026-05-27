import { preflight, json, err } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { requireLeagueAdmin } from "../_shared/auth.ts";
import { batchQuotes } from "../_shared/finnhub.ts";

// Called either by pg_cron (CRON_SECRET header) for a sweep, or by an admin for one league.
Deno.serve(async (req) => {
  const p = preflight(req); if (p) return p;
  if (req.method !== "POST") return err("Method not allowed", 405);
  try {
    const cronHeader = req.headers.get("x-cron-secret");
    const expected = Deno.env.get("CRON_SECRET");
    const body = await req.json().catch(() => ({}));
    const specificLeague = body.league_id as string | undefined;

    let leagueFilter: string[] | null = null;
    if (cronHeader && expected && cronHeader === expected) {
      leagueFilter = null;
    } else if (specificLeague) {
      await requireLeagueAdmin(req, specificLeague);
      leagueFilter = [specificLeague];
    } else {
      return err("unauthorized", 401);
    }

    const sb = serviceClient();
    const today = new Date().toISOString().slice(0, 10);

    let q = sb
      .from("leagues")
      .select("id, name, end_date, status")
      .neq("status", "complete")
      .lte("end_date", today);
    if (leagueFilter) q = q.in("id", leagueFilter);

    const { data: leagues, error } = await q;
    if (error) return err(error.message, 500);

    const finalized: string[] = [];
    for (const lg of leagues || []) {
      const { data: holdings } = await sb
        .from("holdings")
        .select("id, player_id, ticker, shares, slot_value_usd, is_cash, players!inner(id, name, league_id)")
        .eq("players.league_id", lg.id);
      const tickers = Array.from(
        new Set(((holdings as any[]) || []).filter((h) => h.ticker).map((h) => h.ticker as string)),
      );
      const prices = await batchQuotes(tickers);
      const rows = Object.entries(prices)
        .filter(([_, v]) => v)
        .map(([t, v]) => ({
          ticker: t,
          price: v!.price,
          change_pct: v!.change_pct,
          fetched_at: new Date().toISOString(),
        }));
      if (rows.length) await sb.from("prices").upsert(rows);

      const valueByPlayer = new Map<string, { name: string; value: number }>();
      for (const h of (holdings as any[]) || []) {
        const cur = valueByPlayer.get(h.player_id) || { name: h.players.name, value: 0 };
        if (h.is_cash || !h.ticker) cur.value += Number(h.slot_value_usd);
        else {
          const p = prices[h.ticker];
          cur.value += p ? p.price * Number(h.shares) : Number(h.slot_value_usd);
        }
        valueByPlayer.set(h.player_id, cur);
      }
      const winner = [...valueByPlayer.values()].sort((a, b) => b.value - a.value)[0];

      await sb.from("leagues").update({ status: "complete" }).eq("id", lg.id);
      await sb.from("activity").insert({
        league_id: lg.id,
        type: "league_complete",
        description: winner ? `${winner.name} wins StockDraft!` : "League complete",
      });
      finalized.push(lg.id);
    }
    return json({ ok: true, finalized });
  } catch (e: any) {
    return err(e?.message || "unknown", 401);
  }
});
