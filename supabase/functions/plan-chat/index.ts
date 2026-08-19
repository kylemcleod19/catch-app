import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM = `You are a fishing trip planning assistant inside the CATCH app. You are having a spoken/typed conversation with an angler who wants to plan a trip.

Your job, in order:
1. Work out WHAT they are trying to plan before recommending anything. Ask ONE short, specific question at a time — never a wall of questions.
2. Things you need to pin down (skip anything already known or clearly irrelevant):
   - Where: city / area / region, and when (date or rough timeframe).
   - Saltwater or freshwater — ask ONLY if both are plausible in that area.
   - A specific body of water, if they have one in mind.
   - Target species (offer 2-3 realistic options for that area/season rather than an open question).
   - How they'll fish: on foot/wading, kayak, or boat; fly, spin, or bait.
   - What tackle they actually have (their tackle box is listed in context — reference it by name).
   - How much of the day they have.
3. Keep every question concrete and answerable in a few words. Offer likely options. Never ask something the context already answers.
4. Once you know enough, act:
   - If they are heading somewhere new: call propose_spots with 3-5 candidate waters, each with why it fits and approximate latitude/longitude so they can be shown on a map. The app shows them on a map and asks the angler to pick one, so do not ask them to choose in your reply — just say what you found.
   - If the trip is at one of THEIR saved spots (listed in context): call plan_day_at_spot with that exact spot id — the app will pull real forecast, flow and tide data and build the hour-by-hour plan.
5. Call record_details every time you learn something new so the app can show progress.

Tone: plain, knowledgeable, no hype, no promises about catching fish. Keep replies to 1-3 short sentences — this is a voice-first conversation.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages = [], context = {} } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const ctxParts: string[] = [];
    ctxParts.push(`Today is ${context.today || new Date().toISOString().slice(0, 10)}.`);
    if (context.homeState) ctxParts.push(`Angler's home state: ${context.homeState}.`);
    if (context.spots?.length) {
      ctxParts.push(`\nThe angler's saved spots (use these exact ids with plan_day_at_spot):`);
      context.spots.forEach((s: any) => {
        ctxParts.push(`- id=${s.id} | ${s.name || s.body_of_water} | ${s.body_of_water} | ${s.state_code || ""} | ${s.water_type || s.site_type || ""}`);
      });
    } else {
      ctxParts.push(`The angler has no saved spots yet.`);
    }
    if (context.species?.length) ctxParts.push(`\nSpecies known to the app: ${context.species.slice(0, 60).join(", ")}`);
    if (context.tackle?.length) {
      ctxParts.push(`\nAngler's tackle box:`);
      context.tackle.slice(0, 40).forEach((t: any) => {
        ctxParts.push(`- ${t.name}${t.category ? ` (${t.category})` : ""}${t.species?.length ? ` — for ${t.species.join(", ")}` : ""}`);
      });
    } else {
      ctxParts.push(`\nThe angler's tackle box is empty — ask what they'll be throwing.`);
    }
    if (context.details && Object.keys(context.details).length) {
      ctxParts.push(`\nAlready established: ${JSON.stringify(context.details)}`);
    }

    const tools = [
      {
        type: "function",
        function: {
          name: "record_details",
          description: "Record trip details learned so far. Call whenever a new detail is established.",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string" },
              water_type: { type: "string", enum: ["saltwater", "freshwater", "both", "unknown"] },
              body_of_water: { type: "string" },
              species: { type: "array", items: { type: "string" } },
              vessel: { type: "string", enum: ["foot", "wading", "kayak", "boat", "unknown"] },
              method: { type: "string", enum: ["fly", "spin", "bait", "mixed", "unknown"] },
              tackle: { type: "array", items: { type: "string" } },
              date: { type: "string", description: "YYYY-MM-DD if known" },
              time_available: { type: "string" },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "propose_spots",
          description: "Propose candidate waters for a new area once enough is known.",
          parameters: {
            type: "object",
            properties: {
              spots: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    water_type: { type: "string", enum: ["stream", "lake", "tidal"] },
                    species: { type: "array", items: { type: "string" } },
                    why: { type: "string" },
                    access: { type: "string", enum: ["boat", "kayak", "foot"] },
                    latitude: { type: "number", description: "Approximate latitude of the water, required so it can be mapped." },
                    longitude: { type: "number", description: "Approximate longitude of the water, required so it can be mapped." },
                  },
                  required: ["name", "why", "latitude", "longitude"],
                  additionalProperties: false,
                },
              },
              summary: { type: "string" },
            },
            required: ["spots"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "plan_day_at_spot",
          description: "Build the grounded hour-by-hour day plan at one of the angler's saved spots.",
          parameters: {
            type: "object",
            properties: {
              spot_id: { type: "string", description: "Exact id from the saved spots list" },
              date: { type: "string", description: "YYYY-MM-DD" },
              reason: { type: "string" },
            },
            required: ["spot_id", "date"],
            additionalProperties: false,
          },
        },
      },
    ];

    const convo: any[] = [
      { role: "system", content: `${SYSTEM}\n\nContext:\n${ctxParts.join("\n")}` },
      ...messages,
    ];

    const callModel = async (msgs: any[]) => {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: msgs, tools }),
      });
      if (!r.ok) {
        const text = await r.text();
        console.error("AI gateway error:", r.status, text);
        const err: any = new Error("AI gateway error");
        err.status = r.status;
        throw err;
      }
      return await r.json();
    };

    let result;
    try {
      result = await callModel(convo);
    } catch (err: any) {
      if (err.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (err.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw err;
    }

    const msg = result.choices?.[0]?.message || {};
    const calls = msg.tool_calls || [];

    let details: any = null;
    let spots: any = null;
    let planRequest: any = null;

    for (const c of calls) {
      let args: any = {};
      try { args = JSON.parse(c.function?.arguments || "{}"); } catch { /* noop */ }
      if (c.function?.name === "record_details") details = args;
      if (c.function?.name === "propose_spots") spots = args;
      if (c.function?.name === "plan_day_at_spot") planRequest = args;
    }

    let reply: string = msg.content || "";

    // The model often calls record_details with no prose. Feed the tool results
    // back so it produces the next specific question in the same round trip.
    if (!reply && calls.length && !spots && !planRequest) {
      const followUp = [
        ...convo,
        msg,
        ...calls.map((c: any) => ({
          role: "tool",
          tool_call_id: c.id,
          content: JSON.stringify({ ok: true }),
        })),
      ];
      try {
        const second = await callModel(followUp);
        const m2 = second.choices?.[0]?.message || {};
        reply = m2.content || "";
        for (const c of m2.tool_calls || []) {
          let args: any = {};
          try { args = JSON.parse(c.function?.arguments || "{}"); } catch { /* noop */ }
          if (c.function?.name === "record_details") details = { ...(details || {}), ...args };
          if (c.function?.name === "propose_spots") spots = args;
          if (c.function?.name === "plan_day_at_spot") planRequest = args;
        }
      } catch (e) {
        console.error("follow-up call failed", e);
      }
    }

    if (!reply) {
      if (spots) reply = spots.summary || "Here are a few waters worth a look.";
      else if (planRequest) reply = "Pulling conditions and building your day plan…";
      else reply = "Tell me a bit more about the trip.";
    }

    return new Response(JSON.stringify({ reply, details, spots, planRequest }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("plan-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
