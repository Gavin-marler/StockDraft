import { preflight, json, err } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { requireAdminTokenForLeague } from "../_shared/auth.ts";
import { loadApprovedPlayers, PICK_TIMER_SECONDS } from "../_shared/draft.ts";

Deno.serve(async (req) => {
  const p = preflight(req); if (p) return p;
  if (req.method !== "POST") return err("Method not allowed", 405);
  try {
    const { league_id } = await req.json();
    if (!league_id) return err("league_id required");
    await requireAdminTokenForLeague(req, league_id);
    const sb = serviceClient();

    const { data: league } = await sb
      .from("leagues")
      .select("status")
      .eq("id", league_id)
      .single();
    if (!league) return err("League not found", 404);
    if (league.status !== "open") return err("Draft already started or league not open");

    const players = await loadApprovedPlayers(league_id);
    if (players.length < 2) return err("Need at least 2 approved players");

    // Rotate invite token to expire current links
    await sb
      .from("leagues")
      .update({ status: "drafting", invite_token: crypto.randomUUID() })
      .eq("id", league_id);

    const deadline = new Date(Date.now() + PICK_TIMER_SECONDS * 1000).toISOString();
    await sb.from("draft_state").upsert(
      {
        league_id,
        current_round: 1,
        current_player_id: players[0].id,
        pick_deadline: deadline,
        status: "picking",
      },
      { onConflict: "league_id" },
    );
    await sb.from("activity").insert({
      league_id,
      type: "league_started",
      description: "Draft has begun",
    });
    return json({ ok: true });
  } catch (e: any) {
    return err(e?.message || "unknown", 500);
  }
});
