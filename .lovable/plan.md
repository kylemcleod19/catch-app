# NOAA Tides for Saltwater / Bay Spots

Adds tide and water context for coastal spots, using the same coordinates the app already stores. For tidal spots, tide data **replaces** the USGS stream-flow experience everywhere flow appears today, following the same display conventions (icon-led chips, "MMM d" dates, snapped gridlines).

## 1. Making a spot tidal

Spot creation gets a **water type choice up front**, before any water-body search, so USGS matching never runs for saltwater:

```text
[ Freshwater ]        [ Saltwater / Tidal ]
 State -> USGS water   State -> coastal water body (free text + Places search)
 -> map -> USGS site   -> map pins
 -> name               -> nearest NOAA station auto-resolved -> name
```

- New `site_type` value `Tidal` on spots (existing `Stream` / `Lake` untouched).
- Saltwater path skips the USGS station step entirely; instead the backend resolves the nearest NOAA tide-prediction station from the spot's map pin and saves it on the spot.
- The freshwater choice also splits into **Stream** and **Lake / Reservoir** up front, since their USGS data differs: streams are matched to gauges carrying discharge (flow), lakes to gauges carrying gage height (level). Each type only offers water bodies and stations that actually publish its metric, and the water section labels/charts follow the chosen type (flow in cfs vs level in ft).
- Spot edit shows which NOAA station is linked and how far away it is.

## 2. Backend service

One edge function, `tide-water`, is the only thing that talks to NOAA. It supports three modes with different fetch/cache/persist rules:

- **current_day** — today's highs/lows plus the full 15-minute curve; cached until end of local day. Observations (water level, temp, wind, salinity, currents) cached ~15 minutes.
- **future_date** — predictions only for the requested date, cached long-term. No present-day observations are passed off as forecasts.
- **historical_trip** — full curve for the trip date plus observations that existed during the trip window, returned once and then **stored permanently on the trip**, so old trips never re-hit NOAA.

Station resolution is separate per product (tide prediction, water-level observation, water temperature, tidal current), each resolved by Haversine distance and cached, because NOAA rarely serves all products from one station. Each product also gets its own maximum distance, since timing generalizes over water far better than local conditions do: tide predictions ~25 miles, observed water level ~10 miles, water temperature and salinity ~5 miles, tidal currents ~5 miles. Two points can be close in a straight line yet separated by land with very different water, so anything beyond its threshold is reported unavailable rather than substituted from a distant station, and the resolved distance is returned with every product so the UI can flag a marginal match.

Every response uses the normalized contract from your spec (`tideSource`, `tides.highs/lows/curve`, `supplementalWaterData`, `metadata` with `predictionDataAvailable` / `curveDataAvailable`). Missing sensors return `null` with an availability flag — never zero, never invented. Subordinate stations that only publish high/low keep their highs/lows and simply mark the curve unavailable; no rate-of-change is computed from data that doesn't exist.

Derivations (Phase 2): direction (incoming/outgoing), rate in ft/hr, movement strength classified relative to that day's own tide range, and tide phase (`approaching_high`, etc.) kept separate from direction.

An `aiContext` block is built into every response — compact times/heights plus a fishing-window summary. Nothing consumes it yet; it's there for the AI features you add later.

## 3. Where it shows

- **Spot cards** — for tidal spots, the flow droplet chip is replaced by a next-tide chip (arrow up/down, time, height).
- **Spot detail** — a Tides section replacing the Water section: today's low/high/low list, a tide curve chart (same gridline + "MMM d" conventions), and a 7-day tide outlook alongside the existing weather forecast.
- **Trip log form** — for tidal spots the Water Data section renders tides instead of flow/gage. During an active trip it shows current height, direction, next event with countdown, movement strength, and your position on the curve.
- **Trip history / report** — the persisted tide snapshot: start/end height and direction, dominant direction, net change, whether the trip crossed a high or low, max movement rate, percent incoming vs outgoing, plus any observed conditions captured at the time.

## 4. Data model

New migration:

- `spots`: `noaa_tide_station_id`, `noaa_station_name`, `noaa_station_lat`, `noaa_station_lon`, `noaa_station_distance_miles`, `is_tidal`
- `noaa_station_products` — per-spot resolved station for each product type (tide, water level, temperature, current, met), so Phase 3 products slot in without redesign
- `tide_data_cache` — keyed by station + date + datum + units + product, with `expires_at`
- `fishing_trips.tide_snapshot jsonb` — the permanent historical record

Grants + RLS follow the existing pattern (per-user tables scoped to `auth.uid()`; the cache readable/insertable by authenticated users like `water_data_cache`).

## 5. Build order

1. Site-type choice + coastal creation path + station resolution + schema
2. Tide predictions (hilo + 15-min), caching, spot detail Tides section, spot card chip
3. Direction/rate/strength derivations, active-trip curve UI, trip snapshot + trip report stats
4. Supplemental observations: observed water level, water temp, currents, salinity, NOAA wind

## Technical notes

- NOAA CO-OPS `datagetter` with `product=predictions`, `datum=MLLW`, `time_zone=lst_ldt`, `units=english`, `format=json`, `application=CatchApp`; metadata API for station discovery.
- Failures degrade silently: tide sections show "unavailable" and the rest of the trip/spot flow is untouched.
- Frontend never calls NOAA; all access goes through the edge function so there are no duplicate requests per card.
