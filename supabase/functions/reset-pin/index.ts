import { preflight, json, err } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { hash, requireAdminTokenForLeague } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const p = preflight(req); if (p) return p;
  if (req.method !== "POST") return err("Method not allowed", 405);
  try {
    const body = await req.json();
    const mode = body.mode;
    const sb = serviceClient();

    if (mode === "generate") {
      const { player_id } = body;
      if (!player_id) return err("player_id required");
      const { data: player } = await sb
        .from("players")
        .select("league_id")
        .eq("id", player_id)
        .maybeSingle();
      if (!player) return err("Player not found", 404);
      await requireAdminTokenForLeague(req, player.league_id);
      const token = crypto.randomUUID();
      await sb
        .from("players")
        .update({ pin_reset_token: token, reset_token_used: false })
        .eq("id", player_id);
      return json({ token, url: `/reset-pin?token=${token}` });
    }

    if (mode === "consume") {
      const { token, new_pin } = body;
      if (!token || !new_pin) return err("token and new_pin required");
      if (!/^\d{4}$/.test(new_pin)) return err("PIN must be 4 digits");
      const { data: player } = await sb
        .from("players")
        .select("id, reset_token_used")
        .eq("pin_reset_token", token)
        .maybeSingle();
      if (!player) return err("Invalid reset token", 404);
      if (player.reset_token_used) return err("Reset link already used", 410);
      const pin_hash = await hash(new_pin);
      await sb
        .from("players")
        .update({ pin_hash, reset_token_used: true, pin_reset_token: null })
        .eq("id", player.id);
      return json({ ok: true });
    }

    return err("Unknown mode");
  } catch (e: any) {
    return err(e?.message || "unknown", 500);
  }
});
