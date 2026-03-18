import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const USGS_BASE_URL = "https://api.waterdata.usgs.gov/ogcapi/v0/collections/monitoring-locations/items";
const BATCH_SIZE = 50; // AI normalization batch size

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

    // Step 1: Fetch locations from USGS API (Stream + Lake in parallel)
    console.log("Fetching USGS monitoring locations...");
    const siteTypes = ["Stream", "Lake, Reservoir, Impoundment"];
    const fetchPromises = siteTypes.map(async (siteType) => {
      const url = `${USGS_BASE_URL}?state_code=48&site_type=${encodeURIComponent(siteType)}&properties=monitoring_location_name,state_code,site_type,id&limit=10000&f=json&api_key=${USGS_API_KEY}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        const text = await resp.text();
        console.error(`USGS API error for ${siteType}:`, resp.status, text);
        return [];
      }
      const data = await resp.json();
      return data.features || [];
    });

    const results = await Promise.all(fetchPromises);
    const features = results.flat();
    console.log(`Fetched ${features.length} locations from USGS`);

    if (features.length === 0) {
      return new Response(JSON.stringify({ message: "No locations returned from USGS", inserted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Get existing site_ids from our DB
    const { data: existing, error: fetchErr } = await supabase
      .from("usgs_monitoring_locations")
      .select("site_id");

    if (fetchErr) throw new Error(`DB fetch error: ${fetchErr.message}`);

    const existingIds = new Set((existing || []).map((r: { site_id: string }) => r.site_id));

    // Filter to only new locations
    const newFeatures = features.filter((f: any) => {
      const siteId = f.properties?.id || f.id;
      return siteId && !existingIds.has(String(siteId));
    });

    console.log(`Found ${newFeatures.length} new locations to add`);

    if (newFeatures.length === 0) {
      return new Response(JSON.stringify({ message: "No new locations", inserted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Normalize names with AI in batches
    let totalInserted = 0;

    for (let i = 0; i < newFeatures.length; i += BATCH_SIZE) {
      const batch = newFeatures.slice(i, i + BATCH_SIZE);
      const names = batch.map((f: any) => f.properties?.monitoring_location_name || "Unknown");

      // Call AI to normalize water body names
      const normalizedNames = await normalizeWaterBodies(names, LOVABLE_API_KEY);

      // Build rows for insert
      const rows = batch.map((f: any, idx: number) => {
        const coords = f.geometry?.coordinates;
        return {
          site_id: String(f.properties?.id || f.id),
          monitoring_location_name: f.properties?.monitoring_location_name || "Unknown",
          normalized_water_body: normalizedNames[idx] || null,
          site_type: f.properties?.site_type || null,
          state_code: f.properties?.state_code || "48",
          latitude: coords?.[1] ?? null,
          longitude: coords?.[0] ?? null,
        };
      });

      const { error: insertErr, data: inserted } = await supabase
        .from("usgs_monitoring_locations")
        .insert(rows)
        .select("id");

      if (insertErr) {
        console.error(`Insert error on batch ${i}:`, insertErr.message);
      } else {
        totalInserted += (inserted || []).length;
      }

      // Small delay between batches to avoid rate limits
      if (i + BATCH_SIZE < newFeatures.length) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    console.log(`Sync complete. Inserted ${totalInserted} new locations.`);

    return new Response(
      JSON.stringify({ message: "Sync complete", total_fetched: features.length, new_found: newFeatures.length, inserted: totalInserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-usgs-locations error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

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
- Remove directional qualifiers (near, at, above, below, upstream, downstream)
- Remove town/city references (near Wimberley, at Austin, etc.)
- Remove road crossings (at US 290, at SH 12, etc.)
- Keep the core water body name (river, creek, lake, reservoir, spring, bayou, etc.)
- Capitalize properly
Examples:
"Blanco River near Wimberley" → "Blanco River"
"Colorado River at Austin" → "Colorado River"
"Onion Creek at US 183, Austin, TX" → "Onion Creek"
"Lake Travis near Austin" → "Lake Travis"
"Guadalupe Rv above Comal Rv at New Braunfels" → "Guadalupe River"`,
          },
          {
            role: "user",
            content: `Normalize these ${names.length} USGS location names. Return a JSON array of strings, one normalized name per input, in the same order:\n\n${JSON.stringify(names)}`,
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
      return names; // Fall back to original names
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call in AI response");
      return names;
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    if (Array.isArray(parsed.names) && parsed.names.length === names.length) {
      return parsed.names;
    }

    console.warn("AI returned mismatched array length, falling back");
    return names;
  } catch (e) {
    console.error("AI normalization failed:", e);
    return names; // Fallback to original names
  }
}
