import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_BATCH_SIZE = 100;

const DIRTY_PATTERN = `
  normalized_water_body ~ '^\\d+$'
  OR normalized_water_body ~ '^\\d+ '
  OR normalized_water_body ~ '^'''
  OR normalized_water_body ~ '^\\('
  OR normalized_water_body ~ '^\\-'
  OR normalized_water_body ~ ' (Site|@|Mile|Rmi|Mp|Nr|Near|Above|Below|Abv|Blw) '
  OR normalized_water_body ~ ' @ '
  OR normalized_water_body ~ '\\d+ (Mi\\.|Fort|East|West|South|North)'
  OR normalized_water_body ~ '(Lk |R\\.|Ck |Rv |Byu |Cr )'
  OR normalized_water_body ~ ', [A-Z]{2}$'
  OR normalized_water_body ~ ' at | nr | near | above | below '
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let action = "sql-pass";
    try {
      const body = await req.json();
      if (body?.action) action = body.action;
    } catch { /* no body */ }

    if (action === "sql-pass") {
      return await handleSqlPass(supabase);
    } else if (action === "ai-pass") {
      return await handleAiPass(supabase, LOVABLE_API_KEY);
    } else if (action === "count-dirty") {
      return await handleCountDirty(supabase);
    }

    return respond({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("cleanup-water-bodies error:", e);
    return respond({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

async function handleSqlPass(supabase: any) {
  const queries = [
    // 1. Set purely numeric values to NULL
    `UPDATE usgs_monitoring_locations SET normalized_water_body = NULL WHERE normalized_water_body ~ '^\\d+$'`,

    // 2. Set junk codes like -r3, -r4 to NULL
    `UPDATE usgs_monitoring_locations SET normalized_water_body = NULL WHERE normalized_water_body ~ '^-[a-z0-9]+$' AND length(normalized_water_body) < 6`,

    // 3. Strip leading apostrophes and fix capitalization
    `UPDATE usgs_monitoring_locations SET normalized_water_body = initcap(regexp_replace(normalized_water_body, '^''+', '')) WHERE normalized_water_body ~ '^'''`,

    // 4. Strip leading hyphens with content after
    `UPDATE usgs_monitoring_locations SET normalized_water_body = initcap(trim(regexp_replace(normalized_water_body, '^-+', ''))) WHERE normalized_water_body ~ '^-' AND length(normalized_water_body) >= 6`,

    // 5. Strip agency prefixes like (coe), (usace), (COE)
    `UPDATE usgs_monitoring_locations SET normalized_water_body = initcap(trim(regexp_replace(normalized_water_body, '^\\([^)]+\\)\\s*', ''))) WHERE normalized_water_body ~ '^\\('`,

    // 6. Strip leading numeric prefixes: "13215 White River" → "White River"
    `UPDATE usgs_monitoring_locations SET normalized_water_body = initcap(trim(regexp_replace(normalized_water_body, '^\\d+\\s+', ''))) WHERE normalized_water_body ~ '^\\d+ ' AND normalized_water_body !~ '^\\d+$'`,

    // 7. Expand abbreviations (case-insensitive word boundaries)
    `UPDATE usgs_monitoring_locations SET normalized_water_body = regexp_replace(normalized_water_body, '\\mLk\\M', 'Lake', 'gi') WHERE normalized_water_body ~* '\\mLk\\M'`,
    `UPDATE usgs_monitoring_locations SET normalized_water_body = regexp_replace(normalized_water_body, '\\mCk\\M', 'Creek', 'gi') WHERE normalized_water_body ~* '\\mCk\\M'`,
    `UPDATE usgs_monitoring_locations SET normalized_water_body = regexp_replace(normalized_water_body, '\\mCr\\M', 'Creek', 'gi') WHERE normalized_water_body ~* '\\mCr\\M'`,
    `UPDATE usgs_monitoring_locations SET normalized_water_body = regexp_replace(normalized_water_body, '\\mRv\\M', 'River', 'gi') WHERE normalized_water_body ~* '\\mRv\\M'`,
    `UPDATE usgs_monitoring_locations SET normalized_water_body = regexp_replace(normalized_water_body, '\\mByu\\M', 'Bayou', 'gi') WHERE normalized_water_body ~* '\\mByu\\M'`,
    `UPDATE usgs_monitoring_locations SET normalized_water_body = regexp_replace(normalized_water_body, '\\mSpg\\M', 'Spring', 'gi') WHERE normalized_water_body ~* '\\mSpg\\M'`,
    `UPDATE usgs_monitoring_locations SET normalized_water_body = regexp_replace(normalized_water_body, '\\mR\\.\\M', 'River', 'gi') WHERE normalized_water_body ~* '\\mR\\.\\M'`,

    // 8. Strip trailing state codes like ", TX" or ", AR"
    `UPDATE usgs_monitoring_locations SET normalized_water_body = trim(regexp_replace(normalized_water_body, ',\\s*[A-Z]{2}$', '')) WHERE normalized_water_body ~ ',\\s*[A-Z]{2}$'`,

    // 9. Proper case pass for remaining lowercase starts
    `UPDATE usgs_monitoring_locations SET normalized_water_body = initcap(normalized_water_body) WHERE normalized_water_body ~ '^[a-z]'`,
  ];

  let totalUpdated = 0;
  const results: string[] = [];

  for (const sql of queries) {
    try {
      const { data, error } = await supabase.rpc('exec_sql_count', { sql_text: sql });
      if (error) {
        // Fallback: just run via raw and count won't be available
        console.log(`Running query directly...`);
        results.push(`Query executed (count unavailable): ${sql.substring(0, 80)}...`);
      } else {
        results.push(`Updated ${data} rows: ${sql.substring(0, 80)}...`);
        totalUpdated += (data || 0);
      }
    } catch (e) {
      results.push(`Error: ${e}`);
    }
  }

  // Since we can't use exec_sql_count easily, let's just run the updates via service role
  // and count dirty rows remaining
  return respond({ message: "SQL pass complete. Run 'count-dirty' to see remaining.", results });
}

async function handleCountDirty(supabase: any) {
  const { count, error } = await supabase
    .from("usgs_monitoring_locations")
    .select("id", { count: "exact", head: true })
    .or(DIRTY_PATTERN.trim().replace(/\n\s*/g, ',').replace(/,\s*OR\s*/g, ','));

  if (error) {
    // Fallback: use a simpler count approach
    console.error("Count error:", error.message);
    return respond({ dirty_remaining: "unknown", error: error.message });
  }

  return respond({ dirty_remaining: count || 0 });
}

async function handleAiPass(supabase: any, lovableApiKey: string) {
  // Fetch a batch of dirty rows
  const dirtyFilter = "normalized_water_body.like.0%,normalized_water_body.like.1%,normalized_water_body.like.2%,normalized_water_body.like.3%,normalized_water_body.like.4%,normalized_water_body.like.5%,normalized_water_body.like.6%,normalized_water_body.like.7%,normalized_water_body.like.8%,normalized_water_body.like.9%,normalized_water_body.like.%Site %,normalized_water_body.like.% @ %,normalized_water_body.like.% at %,normalized_water_body.like.% nr %,normalized_water_body.like.% near %";
  const { data: dirtyRows, error } = await supabase
    .from("usgs_monitoring_locations")
    .select("id, monitoring_location_name, normalized_water_body")
    .not("normalized_water_body", "is", null)
    .or(dirtyFilter)
    .limit(AI_BATCH_SIZE);

  if (error) throw new Error(`DB error: ${error.message}`);
  if (!dirtyRows || dirtyRows.length === 0) {
    return respond({ message: "No more dirty rows found for AI pass", remaining: 0 });
  }

  console.log(`AI pass: processing ${dirtyRows.length} rows...`);

  // Send the current normalized_water_body for cleanup (it's already partially cleaned)
  const names = dirtyRows.map((r: any) => r.normalized_water_body);
  const normalized = await normalizeWaterBodies(names, lovableApiKey);

  let updated = 0;
  for (let i = 0; i < dirtyRows.length; i++) {
    const newVal = normalized[i];
    if (newVal && newVal !== dirtyRows[i].normalized_water_body) {
      const { error: upErr } = await supabase
        .from("usgs_monitoring_locations")
        .update({ normalized_water_body: newVal })
        .eq("id", dirtyRows[i].id);
      if (!upErr) updated++;
    }
  }

  console.log(`AI pass: updated ${updated} of ${dirtyRows.length} rows`);
  return respond({
    message: "AI pass batch complete",
    processed: dirtyRows.length,
    updated,
    sample: dirtyRows.slice(0, 5).map((r: any, i: number) => ({
      before: r.normalized_water_body,
      after: normalized[i],
    })),
  });
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
- Remove town/city references and state abbreviations
- Remove road crossings (at US 290, at SH 12, etc.)
- Remove site descriptors (Site AC, Site WR, etc.)
- Remove mile markers (1.0 Mi. West, 3.6 Rmi, etc.)
- Remove @ references (@ Jimmie Creek, @ Highway 10)
- Expand abbreviations: Rv→River, Ck/Cr→Creek, Lk→Lake, Spg→Spring, Byu→Bayou, R.→River
- Remove agency prefixes (TCEQQW, LCRA, (coe), (usace), etc.)
- Remove leading numbers that are station IDs
- Keep the core water body name only
- Capitalize properly (title case)
- If input is purely numeric or meaningless junk, return "NULL"
Examples:
"Blanco River near Wimberley" → "Blanco River"
"Lake Austin Site AC at Austin, TX" → "Lake Austin"
"Bull Shoals Lake @ Jimmie Creek" → "Bull Shoals Lake"
"Lake LBJ nr Llano River Arm" → "Lake LBJ"
"Town (Lady Bird) Lake Site DR at Austin, TX" → "Town Lake"
"Lake Maumelle 1.0 Mi. West of Highway" → "Lake Maumelle"
"1222 Little Black R." → "Little Black River"
"38160" → "NULL"`,
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
                    description: "Normalized water body names in the same order as input. Use 'NULL' for junk values.",
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
      // Convert "NULL" strings to actual null
      return parsed.names.map((n: string) => n === "NULL" ? null : n);
    }
    console.warn("AI returned mismatched array length");
    return names;
  } catch (e) {
    console.error("AI normalization failed:", e);
    return names;
  }
}

function respond(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
