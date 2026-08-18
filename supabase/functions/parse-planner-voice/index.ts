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
    const { transcript, context } = await req.json();

    if (!transcript || typeof transcript !== "string") {
      return new Response(JSON.stringify({ error: "transcript is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const contextStr = context
      ? `\n\nContext: The user is planning a fishing trip. ${context}`
      : "";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are a fishing trip planning assistant. The user is describing what they want for a fishing trip in natural language — vessel type, target species, fishing method, how much time they have, travel willingness, and any extra context (tides, water conditions, etc.). Extract structured planning data from what they say. If something isn't mentioned, leave it null. For species, capitalize properly. For vessel, normalize to: boat, kayak, or foot. For method, normalize to: fly, spin, or bait." + contextStr,
          },
          { role: "user", content: transcript },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_planner_intake",
              description: "Extract structured fishing trip planning data from natural language.",
              parameters: {
                type: "object",
                properties: {
                  vessel: {
                    type: "string",
                    description: "Boat, kayak, or foot (wading/shore)",
                    enum: ["boat", "kayak", "foot"],
                  },
                  species: {
                    type: "array",
                    items: { type: "string", description: "Target species name" },
                  },
                  method: {
                    type: "string",
                    description: "Fishing method",
                    enum: ["fly", "spin", "bait"],
                  },
                  time_available: {
                    type: "string",
                    description: "How much of the day they have, e.g. 'morning', 'full day', 'afternoon only'",
                  },
                  travel_distance: {
                    type: "string",
                    description: "How far they're willing to travel, e.g. '30 minutes', '2 hours'",
                  },
                  date: {
                    type: "string",
                    description: "Trip date in YYYY-MM-DD format if mentioned, or null",
                  },
                  location_query: {
                    type: "string",
                    description: "If the user mentions a place/area they want to fish, extract it. Otherwise null.",
                  },
                  notes: {
                    type: "string",
                    description: "Any additional context: tide preferences, water conditions, specific tactics, etc.",
                  },
                },
                required: [],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_planner_intake" } },
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
    console.error("parse-planner-voice error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
