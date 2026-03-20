import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcript } = await req.json();

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
              "You are a fishing trip data extractor. The user will describe their fishing trip in natural language. Extract structured data from what they say. Use 24-hour HH:MM format for times. If a time like '9' is mentioned without AM/PM, assume AM for start times before noon and PM for end times. If no date is mentioned, leave it null. For catches, extract species name (capitalize properly), quantity, and any lure/bait mentioned. Any remaining unstructured information should go in notes.",
          },
          { role: "user", content: transcript },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_trip_data",
              description: "Extract structured fishing trip data from natural language.",
              parameters: {
                type: "object",
                properties: {
                  start_time: {
                    type: "string",
                    description: "Trip start time in HH:MM 24-hour format",
                  },
                  end_time: {
                    type: "string",
                    description: "Trip end time in HH:MM 24-hour format",
                  },
                  date: {
                    type: "string",
                    description: "Trip date in YYYY-MM-DD format, or null if not mentioned",
                  },
                  location: {
                    type: "string",
                    description: "Location name if mentioned, or null",
                  },
                  catches: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        species: { type: "string", description: "Fish species name" },
                        quantity: { type: "number", description: "Number caught" },
                        lure_or_bait: { type: "string", description: "Lure or bait used, or null" },
                        weight_oz: { type: "number", description: "Weight in ounces if mentioned, or null" },
                        length_in: { type: "number", description: "Length in inches if mentioned, or null" },
                      },
                      required: ["species", "quantity"],
                    },
                  },
                  notes: {
                    type: "string",
                    description: "Any additional notes or unstructured info not captured above",
                  },
                },
                required: ["catches"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_trip_data" } },
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
    console.error("parse-trip-voice error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
