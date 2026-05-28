import { preflight, json, err } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { requirePlayerOwner } from "../_shared/auth.ts";
import { draftedTickers } from "../_shared/draft.ts";

Deno.serve(async (req) => {
  const p = preflight(req); if (p) return p;
  if (req.method !== "POST") return err("Method not allowed", 405);
  try {
    const body = await req.json();
    const { player_id, ticker, action, direction } = body;
    if (!player_id || !ticker || !action) return err("player_id, ticker, action required");
    const t = String(ticker).toUpperCase();

    const { user, player } = await requirePlayerOwner(req, player_id);
    if (player.status !== "approved") return err("Player not approved", 403);

    const sb = serviceClient();

    if (action === "add") {
      const drafted = await draftedTickers(player.league_id);
      if (drafted.has(t)) return err(`${t} has already been drafted`);

      const { data: existing } = await sb
        .from("draft_queue")
        .select("id")
        .eq("player_id", player_id)
        .eq("ticker", t)
        .maybeSingle();
      if (existing) return err(`${t} is already in your queue`);

      const { data: top } = await sb
        .from("draft_queue")
        .select("position")
        .eq("player_id", player_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextPos = top ? Number(top.position) + 1 : 1;

      const { error } = await sb.from("draft_queue").insert({
        league_id: player.league_id,
        player_id,
        auth_user_id: user.id,
        ticker: t,
        position: nextPos,
      });
      if (error) return err(error.message, 500);
      return json({ ok: true });
    }

    if (action === "remove") {
      await sb.from("draft_queue").delete().eq("player_id", player_id).eq("ticker", t);
      // Compact positions so they stay 1..N.
      const { data: rows } = await sb
        .from("draft_queue")
        .select("id, position")
        .eq("player_id", player_id)
        .order("position", { ascending: true });
      for (let i = 0; i < (rows?.length || 0); i++) {
        const r = rows![i] as any;
        if (r.position !== i + 1) {
          await sb.from("draft_queue").update({ position: i + 1 }).eq("id", r.id);
        }
      }
      return json({ ok: true });
    }

    if (action === "reorder") {
      if (direction !== "up" && direction !== "down") return err("direction must be up or down");
      const { data: rows } = await sb
        .from("draft_queue")
        .select("id, position")
        .eq("player_id", player_id)
        .order("position", { ascending: true });
      const list = (rows as { id: string; position: number }[]) || [];
      const { data: target } = await sb
        .from("draft_queue")
        .select("id, position")
        .eq("player_id", player_id)
        .eq("ticker", t)
        .maybeSingle();
      if (!target) return err(`${t} not in your queue`);
      const idx = list.findIndex((r) => r.id === target.id);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= list.length) return json({ ok: true });
      const other = list[swapIdx];
      // Swap via a temporary slot to avoid unique constraint clashes on (player_id, ticker)
      // — actually only (player_id, ticker) is unique, position isn't, so a direct swap is fine.
      await sb.from("draft_queue").update({ position: other.position }).eq("id", target.id);
      await sb.from("draft_queue").update({ position: target.position }).eq("id", other.id);
      return json({ ok: true });
    }

    return err("Unknown action");
  } catch (e: any) {
    return err(e?.message || "unknown", 401);
  }
});
