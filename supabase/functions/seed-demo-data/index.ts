import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Template demo data — lives here as the single source of truth
const DEMO_TRIPS = [
  {
    title: "Morning on Lake Fork",
    location_name: "Lake Fork, TX",
    latitude: 32.7513,
    longitude: -95.5736,
    started_at_offset_hours: -72, // 3 days ago at 6am
    start_hour: 6,
    end_hour: 11,
    notes: "Clear skies, light wind from the south. Water temp around 62°F.",
    catches: [
      { species: "Largemouth Bass", quantity: 2, lure_or_bait: "Green Pumpkin Jig", weight_oz: 48, length_in: 16 },
      { species: "Channel Catfish", quantity: 1, lure_or_bait: "Chicken Liver", weight_oz: 80, length_in: 22 },
      { species: "Bluegill", quantity: 3, lure_or_bait: "Red Worm", weight_oz: null, length_in: 6 },
    ],
  },
  {
    title: "White River Float",
    location_name: "White River, AR",
    latitude: 36.3715,
    longitude: -92.3285,
    started_at_offset_hours: -144, // 6 days ago
    start_hour: 7,
    end_hour: 14,
    notes: "Water flow was moderate, ~800 CFS. Great conditions for wading.",
    catches: [
      { species: "Rainbow Trout", quantity: 4, lure_or_bait: "Woolly Bugger", weight_oz: 24, length_in: 14 },
      { species: "Brown Trout", quantity: 2, lure_or_bait: "Pheasant Tail Nymph", weight_oz: 32, length_in: 16 },
      { species: "Rainbow Trout", quantity: 1, lure_or_bait: "Elk Hair Caddis", weight_oz: 16, length_in: 12 },
    ],
  },
  {
    title: "Table Rock Evening",
    location_name: "Table Rock Lake, MO",
    latitude: 36.5953,
    longitude: -93.3127,
    started_at_offset_hours: -240, // 10 days ago
    start_hour: 16,
    end_hour: 20,
    notes: "Evening topwater bite was on fire. Overcast with occasional drizzle.",
    catches: [
      { species: "Smallmouth Bass", quantity: 1, lure_or_bait: "Zara Spook", weight_oz: 40, length_in: 15 },
      { species: "Spotted Bass", quantity: 1, lure_or_bait: "Whopper Plopper", weight_oz: 28, length_in: 13 },
    ],
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();

    for (const trip of DEMO_TRIPS) {
      const startedAt = new Date(now.getTime() + trip.started_at_offset_hours * 3600000);
      startedAt.setHours(trip.start_hour, 0, 0, 0);
      const endedAt = new Date(startedAt);
      endedAt.setHours(trip.end_hour, 0, 0, 0);

      const { data: tripRow, error: tripErr } = await supabase
        .from("fishing_trips")
        .insert({
          user_id,
          is_demo: true,
          title: trip.title,
          location_name: trip.location_name,
          latitude: trip.latitude,
          longitude: trip.longitude,
          started_at: startedAt.toISOString(),
          ended_at: endedAt.toISOString(),
          notes: trip.notes,
          status: "completed",
        })
        .select("id")
        .single();

      if (tripErr) {
        console.error("Trip insert error:", tripErr);
        continue;
      }

      if (trip.catches.length > 0) {
        const catchRows = trip.catches.map((c) => ({
          user_id,
          trip_id: tripRow.id,
          is_demo: true,
          species: c.species,
          quantity: c.quantity,
          lure_or_bait: c.lure_or_bait,
          weight_oz: c.weight_oz,
          length_in: c.length_in,
        }));

        const { error: catchErr } = await supabase
          .from("catches")
          .insert(catchRows);

        if (catchErr) {
          console.error("Catch insert error:", catchErr);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("seed-demo-data error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
