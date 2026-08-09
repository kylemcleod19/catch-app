import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roles) {
      return new Response(JSON.stringify({ error: "Admins only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { source_id, target_id } = await req.json();
    if (!source_id || !target_id || source_id === target_id) {
      return new Response(JSON.stringify({ error: "source_id and target_id are required and must differ" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: rows, error: fetchErr } = await admin
      .from("species")
      .select("id, primary_name, nicknames")
      .in("id", [source_id, target_id]);
    if (fetchErr || !rows || rows.length !== 2) throw new Error("Species not found");

    const source = rows.find((r) => r.id === source_id)!;
    const target = rows.find((r) => r.id === target_id)!;

    // Repoint references
    await admin.from("catches").update({ species_id: target_id }).eq("species_id", source_id);

    const { data: links } = await admin.from("tackle_species").select("tackle_id").eq("species_id", source_id);
    for (const link of links || []) {
      await admin
        .from("tackle_species")
        .upsert({ tackle_id: link.tackle_id, species_id: target_id }, { onConflict: "tackle_id,species_id" });
    }
    await admin.from("tackle_species").delete().eq("species_id", source_id);

    // Fold the old name (and its nicknames) into the target's nicknames
    const merged = Array.from(
      new Set([...(target.nicknames || []), ...(source.nicknames || []), source.primary_name])
    ).filter((n) => n.toLowerCase() !== target.primary_name.toLowerCase());

    await admin.from("species").update({ nicknames: merged }).eq("id", target_id);
    await admin.from("species").delete().eq("id", source_id);

    return new Response(JSON.stringify({ ok: true, target_id, nicknames: merged }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("merge-species error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
