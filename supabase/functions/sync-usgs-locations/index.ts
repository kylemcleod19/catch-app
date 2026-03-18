import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const USGS_BASE_URL = "https://api.waterdata.usgs.gov/ogcapi/v0/collections/monitoring-locations/items";
const AI_BATCH_SIZE = 100;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const USGS_API_KEY = Deno.env.get("USGS_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!USGS_API_KEY) throw new Error("USGS_API_KEY is not configured");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse action from body — "sync" (default) does fetch+normalize for new only,
    // "backfill" normalizes existing unnormalized rows in batches
    let action = "sync";
    try {
      const body = await req.json();
      if (body?.action) action = body.action;
    } catch { /* no body is fine */ }

    if (action === "backfill") {
      return await handleBackfillNormalize(supabase, LOVABLE_API_KEY);
    }

    // Default: fetch new locations from USGS, then normalize only the new ones
    return await handleSync(supabase, USGS_API_KEY, LOVABLE_API_KEY);
  } catch (e) {
    console.error("sync-usgs-locations error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function handleSync(supabase: any, apiKey: string, lovableApiKey: string) {
  // Step 1: Fetch from USGS
  console.log("Fetching USGS monitoring locations...");
  const siteTypes = ["Stream", "Lake, Reservoir, Impoundment"];
  const fetchPromises = siteTypes.map(async (siteType) => {
    const url = `${USGS_BASE_URL}?state_code=48&site_type=${encodeURIComponent(siteType)}&properties=monitoring_location_name,state_code,site_type,id&limit=10000&f=json&api_key=${apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`USGS API error for ${siteType}:`, resp.status);
      return [];
    }
    const data = await resp.json();
    return data.features || [];
  });

  const results = await Promise.all(fetchPromises);
  const features = results.flat();
  console.log(`Fetched ${features.length} locations from USGS`);

  if (features.length === 0) {
    return respond({ message: "No locations returned from USGS", inserted: 0, normalized: 0 });
  }

  // Step 2: Filter to new locations only
  const { data: existing } = await supabase
    .from("usgs_monitoring_locations")
    .select("site_id");
  const existingIds = new Set((existing || []).map((r: any) => r.site_id));

  const newFeatures = features.filter((f: any) => {
    const siteId = f.properties?.id || f.id;
    return siteId && !existingIds.has(String(siteId));
  });

  console.log(`Found ${newFeatures.length} new locations`);

  if (newFeatures.length === 0) {
    return respond({ message: "No new locations", inserted: 0, normalized: 0 });
  }

  // Step 3: Normalize new location names with AI (in batches)
  const allRows: any[] = [];
  for (let i = 0; i < newFeatures.length; i += AI_BATCH_SIZE) {
    const batch = newFeatures.slice(i, i + AI_BATCH_SIZE);
    const names = batch.map((f: any) => f.properties?.monitoring_location_name || "Unknown");
    const normalizedNames = await normalizeWaterBodies(names, lovableApiKey);

    for (let j = 0; j < batch.length; j++) {
      const f = batch[j];
      const coords = f.geometry?.coordinates;
      allRows.push({
        site_id: String(f.properties?.id || f.id),
        monitoring_location_name: f.properties?.monitoring_location_name || "Unknown",
        normalized_water_body: normalizedNames[j] || null,
        site_type: f.properties?.site_type || null,
        state_code: f.properties?.state_code || "48",
        latitude: coords?.[1] ?? null,
        longitude: coords?.[0] ?? null,
      });
    }

    // Small delay between AI batches
    if (i + AI_BATCH_SIZE < newFeatures.length) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  // Step 4: Insert into DB in batches of 500
  let totalInserted = 0;
  for (let i = 0; i < allRows.length; i += 500) {
    const batch = allRows.slice(i, i + 500);
    const { error, data: inserted } = await supabase
      .from("usgs_monitoring_locations")
      .upsert(batch, { onConflict: "site_id", ignoreDuplicates: true })
      .select("id");

    if (error) {
      console.error(`Insert error batch ${i}:`, error.message);
    } else {
      totalInserted += (inserted || []).length;
    }
  }

  console.log(`Inserted ${totalInserted} locations with normalized names`);
  return respond({ message: "Sync complete", total_fetched: features.length, inserted: totalInserted, normalized: totalInserted });
}

// Backfill: normalize existing rows that don't have a normalized name yet (for initial data load)
async function handleBackfillNormalize(supabase: any, lovableApiKey: string) {
  const { data: unnormalized, error } = await supabase
    .from("usgs_monitoring_locations")
    .select("id, monitoring_location_name")
    .is("normalized_water_body", null)
    .limit(AI_BATCH_SIZE);

  if (error) throw new Error(`DB error: ${error.message}`);
  if (!unnormalized || unnormalized.length === 0) {
    return respond({ message: "All locations normalized", remaining: 0 });
  }

  console.log(`Backfill: normalizing ${unnormalized.length} locations...`);
  const names = unnormalized.map((r: any) => r.monitoring_location_name);
  const normalized = await normalizeWaterBodies(names, lovableApiKey);

  let updated = 0;
  for (let i = 0; i < unnormalized.length; i++) {
    const { error: upErr } = await supabase
      .from("usgs_monitoring_locations")
      .update({ normalized_water_body: normalized[i] })
      .eq("id", unnormalized[i].id);
    if (!upErr) updated++;
  }

  const { count } = await supabase
    .from("usgs_monitoring_locations")
    .select("id", { count: "exact", head: true })
    .is("normalized_water_body", null);

  console.log(`Backfill: normalized ${updated}, ${count || 0} remaining`);
  return respond({ message: "Backfill batch complete", normalized: updated, remaining: count || 0 });
}

async function normalizeWaterBodies(names: string[], apiKey: string): Promise<string[]> {
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are a geographic data normalizer. Given USGS monitoring location names, extract ONLY the canonical water body name. Rules:
- Remove directional qualifiers (near, at, above, below, upstream, downstream, nr, bl, abv)
- Remove town/city references
- Remove road crossings (at US 290, at SH 12, etc.)
- Expand abbreviations: Rv→River, Ck/Cr→Creek, Lk→Lake, Spg→Spring, Byu→Bayou
- Remove agency prefixes (TCEQQW, LCRA, etc.)
- Keep the core water body name
- Capitalize properly
Examples:
"Blanco River near Wimberley" → "Blanco River"
"TCEQQW Clear Ck at Mykawa St nr Pearland, TX" → "Clear Creek"
"LCRA Lk Buchanan nr Burnet, TX" → "Lake Buchanan"
"Guadalupe Rv above Comal Rv at New Braunfels" → "Guadalupe River"`,
          },
          {
            role: "user",
            content: `Normalize these ${names.length} USGS location names. Return a JSON array of normalized names in the same order:\n\n${JSON.stringify(names)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_normalized_names",
              description: "Return the normalized water body names",
              parameters: {
                type: "object",
                properties: {
                  names: {
                    type: "array",
                    items: { type: "string" },
                    description: "Normalized water body names in the same order as input",
                  },
                },
                required: ["names"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_normalized_names" } },
      }),
    });

    if (!response.ok) {
      console.error("AI normalization error:", response.status);
      return names;
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return names;

    const parsed = JSON.parse(toolCall.function.arguments);
    if (Array.isArray(parsed.names) && parsed.names.length === names.length) {
      return parsed.names;
    }
    console.warn("AI returned mismatched array length");
    return names;
  } catch (e) {
    console.error("AI normalization failed:", e);
    return names;
  }
}

function respond(body: any) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
