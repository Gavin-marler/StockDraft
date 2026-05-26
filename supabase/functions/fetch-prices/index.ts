import { preflight, json, err } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { batchQuotes } from "../_shared/finnhub.ts";

const TTL_MS = 60 * 60 * 1000; // 1 hour

Deno.serve(async (req) => {
  const p = preflight(req); if (p) return p;
  if (req.method !== "POST") return err("Method not allowed", 405);
  try {
    const body = await req.json().catch(() => ({}));
    const { league_id, refresh, tickers: rawTickers, raw } = body;
    const sb = serviceClient();

    let tickers: string[] = [];
    if (Array.isArray(rawTickers) && rawTickers.length) {
      tickers = rawTickers.map((t) => String(t).toUpperCase());
    } else if (league_id) {
      const { data } = await sb
        .from("holdings")
        .select("ticker, players!inner(league_id)")
        .eq("players.league_id", league_id)
        .not("ticker", "is", null);
      tickers = Array.from(new Set(((data as any[]) || []).map((h) => h.ticker as string)));
    } else {
      return err("league_id or tickers required");
    }

    if (tickers.length === 0) {
      return json({ prices: {}, last_updated: new Date().toISOString() });
    }

    // Pull cached rows
    const { data: cached } = await sb.from("prices").select("*").in("ticker", tickers);
    const now = Date.now();
    const cachedMap = new Map((cached || []).map((r: any) => [r.ticker, r]));
    const stale: string[] = [];
    for (const t of tickers) {
      const c = cachedMap.get(t);
      if (refresh || !c || now - new Date(c.fetched_at).getTime() > TTL_MS) stale.push(t);
    }

    if (stale.length) {
      const fresh = await batchQuotes(stale);
      const rows: any[] = [];
      for (const [t, q] of Object.entries(fresh)) {
        if (!q) continue;
        rows.push({
          ticker: t,
          price: q.price,
          change_pct: q.change_pct,
          fetched_at: new Date().toISOString(),
        });
        cachedMap.set(t, rows[rows.length - 1]);
      }
      if (rows.length) await sb.from("prices").upsert(rows);
    }

    const prices: Record<string, { price: number; change_pct: number }> = {};
    let oldest = now;
    for (const t of tickers) {
      const r = cachedMap.get(t);
      if (!r) continue;
      prices[t] = { price: Number(r.price), change_pct: Number(r.change_pct) };
      const ts = new Date(r.fetched_at).getTime();
      if (ts < oldest) oldest = ts;
    }

    return json({
      prices,
      last_updated: new Date(oldest).toISOString(),
      ...(raw ? { tickers } : {}),
    });
  } catch (e: any) {
    return err(e?.message || "unknown", 500);
  }
});
