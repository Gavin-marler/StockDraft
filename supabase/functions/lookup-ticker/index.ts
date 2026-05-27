import { preflight, json, err } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { quote, profile, searchSymbols } from "../_shared/finnhub.ts";

// Combined ticker info endpoint. Two modes:
//   { ticker: "MU" }   -> { ticker, price, change_pct, name, sector, exchange }
//   { search: "MU" }   -> { results: [{ ticker, name }, ...] }
Deno.serve(async (req) => {
  const p = preflight(req); if (p) return p;
  if (req.method !== "POST") return err("Method not allowed", 405);
  try {
    const body = await req.json();

    if (typeof body.search === "string" && body.search.trim()) {
      const hits = await searchSymbols(body.search.trim());
      return json({ results: hits });
    }

    if (typeof body.ticker === "string" && body.ticker.trim()) {
      const t = body.ticker.trim().toUpperCase();
      const [q, prof] = await Promise.all([quote(t), profile(t)]);
      if (!q) return err(`No price found for ${t}`, 404);
      // Cache the price.
      const sb = serviceClient();
      await sb.from("prices").upsert({
        ticker: t,
        price: q.price,
        change_pct: q.change_pct,
        fetched_at: new Date().toISOString(),
      });
      return json({
        ticker: t,
        price: q.price,
        change_pct: q.change_pct,
        name: prof?.name ?? null,
        sector: prof?.sector ?? null,
        exchange: prof?.exchange ?? null,
      });
    }

    return err("ticker or search required");
  } catch (e: any) {
    return err(e?.message || "unknown", 500);
  }
});
