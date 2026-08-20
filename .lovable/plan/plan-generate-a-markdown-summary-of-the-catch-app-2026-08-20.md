# Plan: Generate a Markdown summary of the CATCH app

## Goal
Produce a single, well-structured Markdown document that summarizes everything the CATCH fishing app does — its features, data model, integrations, and architecture — as a durable reference the user can keep and share.

## Deliverable
Write the summary to `/mnt/documents/CATCH-app-summary.md` (persistent, cloud-backed, user-visible) and surface it via a `<presentation-artifact>` tag.

## What the summary will cover (based on codebase reads)

1. **Overview & product vision** — mobile-first fishing log + AI trip-planning app for outdoor anglers; rugged Safety-Orange/Steel-Slate design.
2. **Tech stack** — React 18, Vite, TypeScript, Tailwind, shadcn/ui, TanStack Query, React Router; Supabase backend (Lovable Cloud) with edge functions.
3. **Pages & routes** — Home (recent trips, quick-log CTA), Plan trip, Trips history, Spots list, Spot detail, Tackle Box, Profile, Sign-in, Landing.
4. **Core features**
   - Trip logging: multi-session persistent drafts, spot picker, real-time catches, auto-named trips (`[Water] · [Date] – [Top Species]`).
   - Voice logging: Web Speech API + AI parsing modal, Safari fallback.
   - Catches: species, quantity, length/weight, tackle variant link, photo.
   - Spots: multi-step creation (state → water → map → USGS → naming), pin management, freshwater vs. tidal type awareness, station linking.
   - Spot detail: map header, active conditions, historical trip list with catch summaries.
   - Tackle Box: tackle items with photos/AI ID, pattern + color/size variants, shared species table with admin merge, catch links.
   - AI Trip Planner: two paths — conversational AI ("New Spot") and guided UI from saved spots; candidate spot map with client-side geocoding; voice/text composer; day plans with time blocks; planned-trip persistence.
   - Conditions: water clarity from flow trends, 30-day flow/gage charts, tide curves, 7-day weather forecast; chart conventions (MMM d dates, niceGridLines).
5. **Integrations** — Google Maps JS & Places (singleton loader), USGS water-data & fishing sites (~29k available-data rows), NOAA tides (CO-OPS), NWS/NOAA weather (edge function, timezone-aware), Lovable AI Gateway (chat, vision tackle ID, trip planning, voice parsing).
6. **Edge functions** — weather, water-data, tide-water, plan-chat, plan-trip, parse-planner-voice, parse-trip-voice, identify-tackle, merge-species, google-maps-key, sync-usgs-locations, seed/cleanup-demo-data, backfill-weather, fetch-image-url.
7. **Data model** — fishing_trips, catches, spots, spot_points, spot_stream_data, spot_lake_data, spot_tidal_data, tackle, tackle_variants, tackle_category, tackle_subcategory, tackle_species, species, profiles, user_roles, usgs_fishing_water_bodies, usgs_water_bodies_available_data, usgs_monitoring_locations, noaa_station_products, water/weather/tide_data_cache (read-only caches).
8. **Auth & demo mode** — email + Google OAuth, Supabase sessions; anonymous demo mode cloning a disposable dataset, purged after 24h.
9. **Security posture** — RLS on all tables, SECURITY INVOKER functions, service-role-only cache writes, HIBP password protection.
10. **Design & UX rules** — mobile-first safe-area insets, `pb-nav` bottom clearance, high-contrast outdoor palette, no bot protection (Voice Log compat).

## Verification
After writing, read the file back to confirm structure and that it renders cleanly, then present the artifact.
