import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { mode, intake, spot, date, forecast, waterData, tideData, pastInsights, tackle, refinement } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // ── Build context for the AI ──
    let systemPrompt = "";
    let userPrompt = "";

    if (mode === "explore") {
      // Explore mode: propose candidate waters near a location
      systemPrompt =
        "You are an expert fishing guide. The user wants to fish in a new area. Given their preferences and nearby verified water bodies with monitoring stations, propose 3-5 candidate fishing spots. For each, give the water body name, what type of water it is, what species are commonly found there, why it fits the user's preferences, and what access (boat/kayak/foot) works. Ground your suggestions in the verified data provided — do not invent station IDs or water body names not in the list. Use a neutral, informative tone.";
      
      const parts: string[] = [];
      parts.push(`Location the user wants to fish near: ${intake?.location_query || "not specified"}`);
      parts.push(`User preferences: vessel=${intake?.vessel || "any"}, species=${(intake?.species || []).join(", ") || "any"}, method=${intake?.method || "any"}, time=${intake?.time_available || "flexible"}`);
      if (intake?.notes) parts.push(`Additional context: ${intake.notes}`);
      if (intake?.date) parts.push(`Planned date: ${intake.date}`);
      if (waterData?.stations?.length) {
        parts.push(`\nVerified nearby water bodies with monitoring stations:`);
        waterData.stations.forEach((s: any) => {
          parts.push(`- ${s.name} (${s.type || "unknown type"}), ${s.distance || ""} away, station: ${s.site_id || s.station_id || "none"}`);
        });
      }
      userPrompt = parts.join("\n");
    } else {
      // Plan mode: generate hour-by-hour guide for a specific spot + date
      systemPrompt =
        "You are an expert fishing guide creating a day plan for a specific spot and date. Given the forecast, water/tide conditions, past trip insights, and the user's tackle box, produce a consolidated hour-by-hour guide. Group adjacent hours into time blocks when conditions are similar. For each block, state the time window, what's happening (light, tide stage, wind, water flow/level), a target species, and a tackle suggestion from the user's tackle box if one fits. Use a neutral, informative tone — state conditions and a reasonable approach, don't promise results. If conditions data is missing, note what's unavailable and still provide guidance based on what you have.";

      const parts: string[] = [];
      parts.push(`Spot: ${spot?.name || "unknown"}, water type: ${spot?.water_type || "stream"}`);
      if (spot?.body_of_water) parts.push(`Water body: ${spot.body_of_water}`);
      parts.push(`Date: ${date || "not specified"}`);
      parts.push(`User preferences: vessel=${intake?.vessel || "any"}, species=${(intake?.species || []).join(", ") || "any"}, method=${intake?.method || "any"}, time=${intake?.time_available || "flexible"}`);
      if (intake?.notes) parts.push(`Additional context: ${intake.notes}`);
      
      if (forecast?.hourly?.length) {
        parts.push(`\nHourly forecast (local time):`);
        forecast.hourly.slice(0, 24).forEach((h: any) => {
          parts.push(`  ${h.time}: ${h.temp_f || "?"}°F, ${h.wind_mph || "?"}mph wind, ${h.precip_pct || 0}% precip, ${h.conditions || ""}`);
        });
      } else if (forecast?.daily?.length) {
        parts.push(`\nDaily forecast:`);
        forecast.daily.forEach((d: any) => {
          parts.push(`  ${d.date}: ${d.temp_high_f || "?"}/${d.temp_low_f || "?"}°F, ${d.conditions || ""}, ${d.precip_probability_pct || 0}% precip`);
        });
      }

      // USGS payload shape: { historical: { discharge: { series }, gage_height: { series } } } (unsorted)
      const toSeries = (arr: any[] = []) =>
        arr
          .map((p: any) => ({ date: String(p.date || p.timestamp || ""), value: parseFloat(p.value) }))
          .filter((p) => p.date && !isNaN(p.value))
          .sort((a, b) => a.date.localeCompare(b.date));
      const discharge = toSeries(waterData?.historical?.discharge?.series || waterData?.series);
      const gage = toSeries(waterData?.historical?.gage_height?.series);
      if (discharge.length || gage.length) {
        parts.push(`\nMeasured USGS water data (real observations — use these, do NOT say flow is unavailable):`);
        if (discharge.length) {
          const vals = discharge.slice(-30).map((d) => d.value).sort((a, b) => a - b);
          const median = vals[Math.floor(vals.length / 2)];
          const last = discharge[discharge.length - 1];
          parts.push(`  Latest discharge: ${last.value} cfs on ${last.date}; 30-day median ${median} cfs`);
          parts.push(`  Recent daily discharge (cfs): ${discharge.slice(-14).map((d) => `${d.date.slice(5)}=${d.value}`).join(", ")}`);
        }
        if (gage.length) {
          const last = gage[gage.length - 1];
          parts.push(`  Latest gage height: ${last.value} ft on ${last.date}`);
        }
      }

      if (tideData?.predictions?.length) {
        parts.push(`\nTide predictions for the date:`);
        tideData.predictions.forEach((t: any) => {
          parts.push(`  ${t.time}: ${t.type} ${t.height_ft || ""}ft`);
        });
      }

      if (pastInsights) {
        parts.push(`\nPast trip insights:`);
        parts.push(`  Total trips at this spot: ${pastInsights.totalTrips || 0}`);
        if (pastInsights.bestHours?.length) parts.push(`  Best hours by catch rate: ${pastInsights.bestHours.join(", ")}`);
        if (pastInsights.topSpecies?.length) parts.push(`  Top species caught: ${pastInsights.topSpecies.join(", ")}`);
        if (pastInsights.topTackle?.length) parts.push(`  Top producing tackle: ${pastInsights.topTackle.join(", ")}`);
        if (pastInsights.bestConditions) parts.push(`  Best day conditions: ${pastInsights.bestConditions}`);
      }

      if (tackle?.length) {
        parts.push(`\nUser's tackle box (name | category | species):`);
        tackle.slice(0, 30).forEach((t: any) => {
          parts.push(`  ${t.name} | ${t.category || ""} | ${(t.species || []).join(", ")}`);
        });
      }

      if (refinement) {
        parts.push(`\nUser refinement: ${refinement}`);
      }

      userPrompt = parts.join("\n");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: mode === "explore"
              ? {
                  name: "propose_spots",
                  description: "Propose candidate fishing spots near the user's desired area.",
                  parameters: {
                    type: "object",
                    properties: {
                      spots: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: { type: "string", description: "Water body or spot name" },
                            water_type: { type: "string", enum: ["stream", "lake", "tidal"] },
                            species: { type: "array", items: { type: "string" } },
                            why: { type: "string", description: "Short reason this fits the user's preferences and current conditions" },
                            access: { type: "string", enum: ["boat", "kayak", "foot"] },
                          },
                          required: ["name", "why"],
                          additionalProperties: false,
                        },
                      },
                      summary: { type: "string", description: "Brief overall assessment of the area" },
                    },
                    required: ["spots"],
                    additionalProperties: false,
                  },
                }
              : {
                  name: "create_day_plan",
                  description: "Create a consolidated hour-by-hour fishing plan for the spot and date.",
                  parameters: {
                    type: "object",
                    properties: {
                      summary: { type: "string", description: "Brief overview of the day's conditions and strategy" },
                      blocks: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            window: { type: "string", description: "Time range, e.g. '5:00 AM – 8:00 AM'" },
                            conditions: { type: "string", description: "What's happening: light, tide, wind, flow" },
                            favorability: { type: "string", enum: ["prime", "good", "fair", "poor"] },
                            target_species: { type: "string" },
                            tackle: { type: "string", description: "Tackle suggestion from the user's box, or general guidance" },
                            approach: { type: "string", description: "How to fish this window" },
                          },
                          required: ["window", "conditions", "approach"],
                          additionalProperties: false,
                        },
                      },
                      best_window: { type: "string", description: "The single best time window of the day" },
                      notes: { type: "string", description: "Any caveats or data gaps to note" },
                    },
                    required: ["blocks"],
                    additionalProperties: false,
                  },
                },
          },
        ],
        tool_choice: mode === "explore"
          ? { type: "function", function: { name: "propose_spots" } }
          : { type: "function", function: { name: "create_day_plan" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error("AI gateway error");
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No tool call in AI response");
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("plan-trip error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
