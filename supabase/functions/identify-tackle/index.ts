import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { image_url, clarifications, previous } = await req.json();
    if (!image_url || typeof image_url !== "string") {
      return new Response(JSON.stringify({ error: "image_url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const notes: string[] = Array.isArray(clarifications)
      ? clarifications.filter((c: unknown) => typeof c === "string" && c.trim()).slice(0, 10)
      : [];

    const messages: unknown[] = [
      {
        role: "system",
        content:
          "You identify fishing tackle from a photograph. Classify the item, suggest a short descriptive name an angler would use (include colour and pattern), list the fish species it is typically used for, and give one short sentence on how it is usually presented. Also return a one-sentence 'reasoning' describing what you see. The user may send clarifications correcting or adding detail — always trust the user's clarification over the photo and update every field accordingly.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Identify this piece of fishing tackle." },
          { type: "image_url", image_url: { url: image_url } },
        ],
      },
    ];

    if (previous && typeof previous === "object") {
      messages.push({ role: "assistant", content: JSON.stringify(previous) });
    }
    for (const note of notes) {
      messages.push({ role: "user", content: `Clarification: ${note}. Re-answer with updated details.` });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        tools: [
          {
            type: "function",
            function: {
              name: "identify_tackle",
              description: "Report the identified tackle details.",
              parameters: {
                type: "object",
                properties: {
                  category: {
                    type: "string",
                    enum: ["Lures", "Flies", "Bait"],
                  },
                  subcategory: {
                    type: "string",
                    description: "Must be a subcategory of the chosen category.",
                    enum: [
                      // Lures
                      "Hardbait / Crankbait",
                      "Soft Plastic",
                      "Spoon",
                      "Spinner / Spinnerbait",
                      "Jig",
                      "Blade Bait",
                      "Topwater",
                      // Flies
                      "Dry Fly",
                      "Wet Fly",
                      "Nymph",
                      "Streamer",
                      "Topwater / Popper",
                      // Bait
                      "Worms",
                      "Insects",
                      "Fish",
                      "Crustaceans",
                      "Prepared / Dead Bait",
                      "Other",
                    ],
                  },
                  suggested_name: {
                    type: "string",
                    description: "The pattern/model name only, without colour or size (e.g. 'Woolly Bugger').",
                  },
                  color: { type: "string", description: "Dominant colour of this specific item, e.g. 'Olive'." },
                  size: { type: "string", description: "Hook or lure size if visible, e.g. '#10' or '3 in'." },
                  species: { type: "array", items: { type: "string" } },
                  presentation_hint: { type: "string" },
                  reasoning: { type: "string" },
                },
                required: ["category", "subcategory"],

                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "identify_tackle" } },
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached. Try again shortly." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      const text = await response.text();
      console.error("AI gateway error", response.status, text);
      throw new Error("AI request failed");
    }

    const result = await response.json();
    const call = result?.choices?.[0]?.message?.tool_calls?.[0];
    const parsed = call?.function?.arguments ? JSON.parse(call.function.arguments) : {};

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("identify-tackle error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
