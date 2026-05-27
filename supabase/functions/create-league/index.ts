import { preflight, json, err } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { requireUser } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const p = preflight(req); if (p) return p;
  if (req.method !== "POST") return err("Method not allowed", 405);
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const { name, budget, stocks_per_player, max_players, start_date, admin_name } = body;
    if (!name) return err("name required");
    if (max_players < 2 || max_players > 8) return err("max_players must be 2-8");
    if (stocks_per_player < 1 || stocks_per_player > 10) return err("stocks_per_player must be 1-10");
    if (!start_date) return err("start_date required");

    const start = new Date(start_date);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 3);

    const sb = serviceClient();
    const { data, error } = await sb
      .from("leagues")
      .insert({
        name,
        budget,
        stocks_per_player,
        max_players,
        admin_user_id: user.id,
        start_date: start.toISOString().slice(0, 10),
        end_date: end.toISOString().slice(0, 10),
      })
      .select("id, invite_token")
      .single();
    if (error) return err(error.message, 500);

    // Auto-enroll the admin as an approved player.
    const displayName =
      (typeof admin_name === "string" && admin_name.trim()) ||
      (user.email ? user.email.split("@")[0] : "Admin");
    const { data: player } = await sb
      .from("players")
      .insert({
        league_id: data.id,
        name: displayName,
        email: user.email,
        auth_user_id: user.id,
        status: "approved",
      })
      .select("id")
      .single();
    await sb.from("activity").insert({
      league_id: data.id,
      player_id: player?.id ?? null,
      type: "player_approved",
      description: `${displayName} created the league`,
    });

    return json({ league_id: data.id, invite_token: data.invite_token });
  } catch (e: any) {
    return err(e?.message || "unknown", 401);
  }
});
