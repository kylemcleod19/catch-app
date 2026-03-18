import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find demo users created more than 24 hours ago
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Get demo profiles older than 24h
    const { data: staleProfiles, error: profileErr } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("is_demo", true)
      .lt("created_at", cutoff);

    if (profileErr) {
      console.error("Error fetching stale demo profiles:", profileErr);
      return new Response(JSON.stringify({ error: profileErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!staleProfiles || staleProfiles.length === 0) {
      return new Response(JSON.stringify({ cleaned: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userIds = staleProfiles.map((p) => p.user_id);
    console.log(`Cleaning up ${userIds.length} stale demo users`);

    // Delete catches, trips, gear, and profiles for these users
    // Order matters due to foreign keys: catches → trips → gear → profiles
    for (const table of ["catches", "fishing_trips", "gear", "profiles"] as const) {
      const { error } = await supabase
        .from(table)
        .delete()
        .in("user_id", userIds);

      if (error) {
        console.error(`Error deleting from ${table}:`, error);
      }
    }

    // Delete the auth users themselves
    for (const uid of userIds) {
      const { error } = await supabase.auth.admin.deleteUser(uid);
      if (error) {
        console.error(`Error deleting auth user ${uid}:`, error);
      }
    }

    return new Response(JSON.stringify({ cleaned: userIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("cleanup-demo-data error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
