import { preflight, json, err } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { requireLeagueAdmin } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const p = preflight(req); if (p) return p;
  if (req.method !== "POST") return err("Method not allowed", 405);
  try {
    const { player_id, action, name } = await req.json();
    if (!player_id || !action) return err("player_id and action required");

    const sb = serviceClient();
    const { data: player } = await sb
      .from("players")
      .select("id, name, league_id, status")
      .eq("id", player_id)
      .maybeSingle();
    if (!player) return err("Player not found", 404);
    await requireLeagueAdmin(req, player.league_id);

    if (action === "approve") {
      const { count } = await sb
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("league_id", player.league_id)
        .eq("status", "approved");
      const { data: league } = await sb
        .from("leagues")
        .select("max_players, status")
        .eq("id", player.league_id)
        .single();
      if (!league) return err("League not found", 404);
      if (league.status !== "open") return err("League no longer accepting players", 410);
      if ((count || 0) >= league.max_players) return err("League is full", 410);
      await sb.from("players").update({ status: "approved" }).eq("id", player_id);
      await sb.from("activity").insert({
        league_id: player.league_id,
        player_id,
        type: "player_approved",
        description: `${player.name} joined the league`,
      });
    } else if (action === "reject") {
      await sb.from("players").delete().eq("id", player_id);
    } else if (action === "edit") {
      if (!name) return err("name required for edit");
      await sb.from("players").update({ name }).eq("id", player_id);
    } else {
      return err("Unknown action");
    }
    return json({ ok: true });
  } catch (e: any) {
    return err(e?.message || "unknown", 401);
  }
});
