import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Find completed trips with spots that have spot_points but no weather_snapshot
  const { data: trips, error: tripsErr } = await supabase
    .from("fishing_trips")
    .select("id, started_at, spot_id")
    .eq("status", "completed")
    .not("spot_id", "is", null)
    .is("weather_snapshot", null)
    .limit(50);

  if (tripsErr) {
    return new Response(JSON.stringify({ error: tripsErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!trips?.length) {
    return new Response(JSON.stringify({ message: "No trips to backfill", count: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const spotIds = [...new Set(trips.map((t) => t.spot_id!))];

  // Get first spot_point for each spot
  const { data: points } = await supabase
    .from("spot_points")
    .select("spot_id, latitude, longitude")
    .in("spot_id", spotIds);

  const pointMap = new Map<string, { latitude: number; longitude: number }>();
  points?.forEach((p) => {
    if (!pointMap.has(p.spot_id)) pointMap.set(p.spot_id, p);
  });

  let processed = 0;
  let errors = 0;

  for (const trip of trips) {
    const point = pointMap.get(trip.spot_id!);
    if (!point) continue;

    const dateStr = trip.started_at.split("T")[0];
    const { latitude: lat, longitude: lon } = point;

    try {
      // Check cache first
      const { data: cached } = await supabase
        .from("weather_data_cache")
        .select("response_json")
        .eq("lat", lat)
        .eq("lon", lon)
        .eq("date", dateStr)
        .maybeSingle();

      let result: any;

      if (cached?.response_json) {
        result = cached.response_json;
      } else {
        // Call weather edge function
        const url = `${supabaseUrl}/functions/v1/weather?lat=${lat}&lon=${lon}&date=${dateStr}`;
        const resp = await fetch(url, {
          headers: { Authorization: `Bearer ${serviceKey}` },
        });

        if (!resp.ok) {
          console.error(`Weather fetch failed for trip ${trip.id}: ${resp.status}`);
          errors++;
          continue;
        }

        result = await resp.json();

        // Cache it
        await supabase.from("weather_data_cache").upsert(
          { lat, lon, date: dateStr, spot_id: trip.spot_id, trip_id: trip.id, response_json: result },
          { onConflict: "lat,lon,date" }
        );
      }

      // Store snapshot on trip
      const snapshot = {
        lat,
        lon,
        date: dateStr,
        fetched_at: new Date().toISOString(),
        location: result.location,
        given_day: result.given_day,
      };

      await supabase
        .from("fishing_trips")
        .update({ weather_snapshot: snapshot })
        .eq("id", trip.id);

      processed++;

      // Small delay to respect API rate limits
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err) {
      console.error(`Error processing trip ${trip.id}:`, err);
      errors++;
    }
  }

  return new Response(
    JSON.stringify({ message: "Backfill complete", processed, errors, total: trips.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
