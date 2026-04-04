import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { updates } = await req.json();
  // updates: [{site_id, normalized_water_body}, ...]

  let updated = 0;
  const batchSize = 200;
  
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    const vals = batch.map((r: any) => {
      const sid = r.site_id.replace(/'/g, "''");
      const nwb = (r.normalized_water_body || "").replace(/'/g, "''");
      return `('${sid}', ${nwb ? `'${nwb}'` : 'NULL'})`;
    }).join(", ");

    const sql = `UPDATE public.usgs_monitoring_locations AS u 
      SET normalized_water_body = v.nwb, updated_at = now() 
      FROM (VALUES ${vals}) AS v(sid, nwb) 
      WHERE u.site_id = v.sid;`;

    const { error } = await supabase.rpc('', {} as any).then(() => ({ error: null })).catch((e: any) => ({ error: e }));
    
    // Use direct SQL via postgres
    const res = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/`,
      { method: "POST", headers: { "Content-Type": "application/json" } }
    );
    
    // Actually just use the supabase client to do individual updates
    for (const item of batch) {
      const { error } = await supabase
        .from("usgs_monitoring_locations")
        .update({ 
          normalized_water_body: item.normalized_water_body || null,
          updated_at: new Date().toISOString()
        })
        .eq("site_id", item.site_id);
      if (!error) updated++;
    }
  }

  return new Response(JSON.stringify({ updated, total: updates.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
