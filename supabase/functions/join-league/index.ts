import { preflight, json, err } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { requireUser } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const p = preflight(req); if (p) return p;
  if (req.method !== "POST") return err("Method not allowed", 405);
  try {
    const user = await requireUser(req);
    const { invite_token, name } = await req.json();
    if (!invite_token || !name) return err("invite_token and name required");

    const sb = serviceClient();
    const { data: league } = await sb
      .from("leagues")
      .select("id, status, max_players, admin_user_id")
      .eq("invite_token", invite_token)
      .maybeSingle();
    if (!league) return err("Invalid invite link", 404);
    if (league.status !== "open") return err("This invite link has expired", 410);

    // Existing entry for this user?
    const { data: existing } = await sb
      .from("players")
      .select("id, status")
      .eq("league_id", league.id)
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (existing) {
      return json({ player_id: existing.id, league_id: league.id, status: existing.status });
    }

    // Enforce max players (counts approved only — pending are awaiting admin)
    const { count } = await sb
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("league_id", league.id)
      .eq("status", "approved");
    if ((count || 0) >= league.max_players) return err("League is full", 410);

    // If the user is the league admin, auto-approve them.
    const initialStatus = league.admin_user_id === user.id ? "approved" : "pending";

    const { data: player, error } = await sb
      .from("players")
      .insert({
        league_id: league.id,
        name,
        email: user.email,
        auth_user_id: user.id,
        status: initialStatus,
      })
      .select("id, status")
      .single();
    if (error) return err(error.message, 500);

    if (initialStatus === "approved") {
      await sb.from("activity").insert({
        league_id: league.id,
        player_id: player.id,
        type: "player_approved",
        description: `${name} joined the league`,
      });
    }

    return json({ player_id: player.id, league_id: league.id, status: initialStatus });
  } catch (e: any) {
    return err(e?.message || "unknown", 401);
  }
});
