## Weather: historical insights upgrade

Goal: When a trip's weather is loaded (often a historical lookback), surface insights that anglers actually care about — pressure level + 24h trend, day-over-day temp swing, and a short AI-generated "what happened" narrative that calls out fronts.

### Data sources

- NWS forecast (already used) for recent/upcoming dates — has hourly + pressure.
- NCEI historical (already used) — has daily highs/lows, precip, wind. No pressure, no hourly.
- **New:** Open-Meteo ERA5 archive (`archive-api.open-meteo.com`) — free, no key, gives **hourly surface pressure**, temp, wind, precip back to 1940. Used only as a supplement when NCEI is the source (historical dates).

### Backend changes (`supabase/functions/weather/index.ts`)

1. When the requested date is historical (NCEI path) **or** when NWS response lacks pressure, also call Open-Meteo ERA5 for:
   - The requested date (hourly pressure, temp, wind, precip)
   - The 2 prior days (for trend/front detection)
2. Compute and attach to `given_day.summary`:
   - `pressure_hpa_avg`, `pressure_hpa_min`, `pressure_hpa_max`
   - `pressure_trend_24h_hpa` (avg today − avg yesterday)
   - `temp_change_24h_c` (avg today − avg yesterday)
   - `front_flag`: `"cold_front" | "warm_front" | "stable"` based on simple thresholds (e.g., pressure drop >4 hPa + temp drop >5°C in 24h → cold front).
3. Backfill `given_day.hourly` from ERA5 when NCEI returned none, so the existing expanded hourly strip works on historical trips.

### Frontend changes (`WeatherSection.tsx`)

1. Compact header gets a new pressure chip when present: `↓ 1009 hPa` (arrow = trend direction, color = severity).
2. New "Conditions summary" chip below the compact header — small italic line generated server-side from the deltas using a deterministic template first (cheap, no AI). Examples:
   - "Cold front overnight — pressure dropped 8 hPa, high fell 12°."
   - "Stable high pressure, warming trend (+6°)."
   - "Warm front building, pressure easing."
3. Expanded view: add a tiny 3-day pressure sparkline (today + 2 prior) using the same `niceGridLines` convention.

### Why template-first, AI-optional

Deterministic narrative from numeric deltas is free, instant, and good enough for ~90% of cases. If you want richer phrasing later, we can route the deltas through Lovable AI (Gemini Flash) behind a flag — but I'd start without it to keep cost/latency at zero.

### Out of scope (ask if you want them)

- Solunar / moon phase
- Water temp from USGS param 00010
- Multi-day "trip-window" weather card on the home feed

### Files touched

- `supabase/functions/weather/index.ts` (ERA5 fetch + computed fields + narrative template)
- `src/components/trip-log/WeatherSection.tsx` (pressure chip, summary chip, sparkline)
- Type updates to `WeatherSnapshot`
