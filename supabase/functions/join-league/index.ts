import { preflight, json, err } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { hash, compare } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const p = preflight(req); if (p) return p;
  if (req.method !== "POST") return err("Method not allowed", 405);
  try {
    const { invite_token, name, pin } = await req.json();
    if (!invite_token || !name || !pin) return err("invite_token, name, pin required");
    if (!/^\d{4}$/.test(pin)) return err("PIN must be exactly 4 digits");

    const sb = serviceClient();
    const { data: league } = await sb
      .from("leagues")
      .select("id, status, max_players")
      .eq("invite_token", invite_token)
      .maybeSingle();
    if (!league) return err("Invalid invite link", 404);
    if (league.status !== "open") return err("This invite link has expired", 410);

    const { data: existingPlayers } = await sb
      .from("players")
      .select("id, pin_hash, status")
      .eq("league_id", league.id);
    const approvedCount = (existingPlayers || []).filter((p) => p.status === "approved").length;
    if (approvedCount >= league.max_players) return err("League is full", 410);

    // Enforce unique PIN within league
    for (const p of existingPlayers || []) {
      if (await compare(pin, p.pin_hash)) {
        return err("That PIN is already taken in this league. Choose a different one.");
      }
    }

    const pin_hash = await hash(pin);
    const { data: player, error } = await sb
      .from("players")
      .insert({ league_id: league.id, name, pin_hash, status: "pending" })
      .select("id")
      .single();
    if (error) return err(error.message, 500);

    return json({ player_id: player.id, league_id: league.id });
  } catch (e: any) {
    return err(e?.message || "unknown", 500);
  }
});
