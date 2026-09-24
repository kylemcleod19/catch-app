import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AccessPoint {
  name: string;
  lat: number;
  lng: number;
  note: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { waterBody, stateCode, lat, lng } = await req.json();
    if (!waterBody || typeof waterBody !== "string") {
      return new Response(JSON.stringify({ error: "waterBody is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const anchor =
      typeof lat === "number" && typeof lng === "number"
        ? `The angler is looking at the area around ${lat.toFixed(4)}, ${lng.toFixed(4)} — keep suggestions within roughly 25 miles of that point.`
        : "";

    const prompt = `You are a fishing guide. Suggest 4-6 real, publicly known bank/wade fishing access points ("home base" spots: parks, boat ramps, crossings, public accesses) on or along ${waterBody}${stateCode ? ` in ${stateCode}` : ""}. ${anchor}

Return ONLY a JSON array, no markdown, no prose. Each element:
{"name": short place name, "lat": number, "lng": number, "note": one short sentence on why it's good (access type, parking, what fish)}

Coordinates must be accurate to the real place. If you are not confident about a place's location, omit it.`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!r.ok) {
      const body = await r.text();
      console.error(`AI gateway failed [${r.status}]: ${body}`);
      return new Response(JSON.stringify({ error: "AI request failed", status: r.status }), {
        status: r.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await r.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\[[\s\S]*\]/);
    let points: AccessPoint[] = [];
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        points = (Array.isArray(parsed) ? parsed : [])
          .filter(
            (p: any) =>
              p && typeof p.name === "string" &&
              typeof p.lat === "number" && typeof p.lng === "number" &&
              Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
          )
          .slice(0, 6)
          .map((p: any) => ({ name: p.name, lat: p.lat, lng: p.lng, note: String(p.note ?? "") }));
      } catch {
        points = [];
      }
    }

    return new Response(JSON.stringify({ points }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("suggest-access-points error:", err);
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
