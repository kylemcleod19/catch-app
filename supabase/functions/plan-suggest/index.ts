import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const Body = z.object({
  kind: z.enum(["spots", "species_spots", "species"]),
  area: z.string().min(1).max(200),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  water_type: z.enum(["Stream", "Lake", "Tidal"]),
  date: z.string().max(20),
  species: z.array(z.string().max(80)).max(20).default([]),
  nearby: z.array(z.string().max(200)).max(20).default([]),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const spotSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "search_query", "why", "species", "lat", "lng"],
        properties: {
          name: { type: "string" },
          search_query: { type: "string" },
          why: { type: "string" },
          species: { type: "array", items: { type: "string" } },
          lat: { type: "number" },
          lng: { type: "number" },
        },
      },
    },
  },
};

const speciesSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "why"],
        properties: { name: { type: "string" }, why: { type: "string" } },
      },
    },
  },
};

const WATER: Record<string, string> = { Stream: "river or stream", Lake: "lake or reservoir", Tidal: "saltwater / tidal water" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: "Invalid request" }, 400);
    const b = parsed.data;
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "AI is not configured" }, 500);

    const where = `${b.area}${b.lat != null && b.lng != null ? ` (around ${b.lat.toFixed(3)}, ${b.lng.toFixed(3)})` : ""}`;
    let prompt: string;
    if (b.kind === "species") {
      prompt = `Suggest the 3 most realistic species to target at ${where}, a ${WATER[b.water_type]}, on ${b.date}.
${b.species.length ? `The angler has caught here before: ${b.species.join(", ")}.` : ""}
For each give a one-sentence "why" grounded in season, water type and typical behavior (e.g. "Guadalupe bass hold in riffles below shoals in early fall"). Plain tone, no promises.`;
    } else {
      prompt = `Suggest exactly 3 real, publicly accessible fishing access points on a ${WATER[b.water_type]} within about 40 miles of ${where}, for ${b.date}.
${b.kind === "species_spots" && b.species.length ? `Target species: ${b.species.join(", ")}. Pick water that suits them.` : "The angler hasn't chosen species; pick generally productive, easy-access water."}
${b.nearby.length ? `Monitored waters nearby (prefer these so we can link live data): ${b.nearby.join("; ")}.` : ""}
Each item: a short place name (park, ramp, crossing, public access), a geocodable search_query including town and state, a one-sentence "why" about access and fishing (e.g. "Public park with easy wading access and a USGS gage 2 mi upstream"), likely species, and accurate lat/lng. Only include places you are confident exist.`;
    }

    const r = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        input: [{ role: "user", content: prompt }],
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        text: {
          format: {
            type: "json_schema",
            name: "suggestions",
            strict: true,
            schema: b.kind === "species" ? speciesSchema : spotSchema,
          },
        },
      }),
    });

    if (!r.ok || !r.body) {
      const t = await r.text();
      console.error("AI gateway", r.status, t);
      if (r.status === 429) return json({ error: "Too many requests — try again in a moment." }, 429);
      if (r.status === 402) return json({ error: "AI credits are used up. Add credits in Settings → Plans & credits." }, 402);
      return json({ error: "Suggestions are unavailable right now" }, r.status >= 400 && r.status < 600 ? r.status : 500);
    }

    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    let final = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const d = line.slice(5).trim();
        if (!d || d === "[DONE]") continue;
        try {
          const ev = JSON.parse(d);
          if (ev.type === "response.output_text.delta") text += ev.delta || "";
          if (ev.type === "response.completed") {
            const out = ev.response?.output || [];
            for (const o of out) for (const c of o.content || []) if (c.type === "output_text") final += c.text || "";
          }
        } catch { /* partial */ }
      }
    }
    const raw = final || text;
    let items: unknown[] = [];
    try {
      items = (JSON.parse(raw).items || []).slice(0, 3);
    } catch {
      console.error("parse failed", raw.slice(0, 300));
      return json({ error: "The AI returned no suggestions — try again." }, 502);
    }
    return json({ items });
  } catch (e) {
    console.error("plan-suggest", e);
    return json({ error: "Suggestions are unavailable right now" }, 500);
  }
});
