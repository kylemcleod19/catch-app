# Plan Trip — AI Trip Planner

An AI-forward planner that either finds you a spot in a new area or plans the best hours at a spot you already fish. Plans are saved as planned trips and convert into logged trips.

## Step 1 — Choose your path

From "Plan Trip" on the home screen, a full-screen planner opens with two choices:

1. **Explore a new area** — "I'm going to Corpus Christi on July 20th."
2. **Plan at one of my spots** — pick an existing spot + date.

Both converge on the same output: a saved planned trip with a spot (or candidate area), a date, and an hour-by-hour guide.

## Step 2 — Angler intake (both paths) — voice-first

The AI guides you through intake conversationally, **voice-first**: a mic button is the primary input on every screen, so you narrate your answers ("I'm wading for reds on the flats, mostly throwing soft plastics, and I've got the whole morning") and the planner parses it into structured answers — typing is always available as a fallback for quiet environments or corrections. The same Web Speech → AI parsing flow already used by Voice Log is reused here.

The AI asks short, answerable prompts one at a time:

- Do you have a boat, kayak, or are you on foot / wading?
- What species are you targeting? (pulled from your species table + past catches)
- Fly, spin, or bait? (from your tackle box)
- How much of the day do you have, and how far will you travel?

The AI nudges you toward richer detail ("what's the water like there this time of year?", "any tides you're counting on?") to make later windows and tackle suggestions better, rather than demanding exhaustive typed inputs.

Answers are remembered on your profile as defaults so later plans skip ahead.

## Step 3a — Explore a new area

- You type a place; the AI proposes 3-5 candidate waters grounded in what we can verify: USGS monitoring sites and NOAA tide stations near that place, plus the water-body list we already store.
- Candidates render on a map with pins, each with a short "why" (species fit, access for your boat/foot answer, current conditions).
- Live grounding: "this river is running low for the season" (USGS flow vs. recent history), "this creek just spiked from rain", "the bay has a strong outgoing tide mid-morning" (NOAA).
- You pick one → it is saved as a new Spot (reusing the existing spot creation + station linking flow) → continue to Step 3.

## Step 2b — Plan at an existing spot

- Pick the spot and date. We load its linked station data and forecast automatically.
- If it's been fished before, we add a **Past trips insight** panel: total trips, best months/hours by catch rate, species mix, top tackle/variants that produced, and conditions on your best days (flow range, tide stage, pressure, sky) compared to the forecast for the planned date.

## Step 3 — The day plan

A visual + AI hybrid screen:

- **Forecast strip** — hourly temp, wind, precip chance, cloud cover, pressure trend for the planned date, in the spot's local time.
- **Water/tide chart** — tide curve with high/low markers for tidal spots; flow/gage trend and forecast context for streams; lake level for lakes. Same chart conventions as the rest of the app (MMM d axis, nice grid lines).
- **Time-window bands** overlaid on the charts, shaded by how favorable each block is.
- **Hour-by-hour guide** below: consolidated blocks (adjacent hours merge when nothing meaningful changes), each with the window, what's happening (light, tide stage, wind, flow), a target species, and a tackle suggestion drawn from your tackle box (item + variant). Neutral tone — states conditions and a reasonable approach rather than promising results.
- Refine by voice or chat: "I can only fish the afternoon", "I'd rather target reds" — spoken or typed, parsed into a re-plan.

## Step 4 — Save

- Saved as a trip with status `planned`, holding the spot, planned start/end, the AI plan, and the intake answers.
- Appears in Trips under an **Upcoming** section, editable and re-plannable (forecast refreshes as the date nears).
- One tap converts it into a live logged trip on the day, prefilled with spot, times, and suggested tackle.

## Technical notes

- **Schema**: extend `fishing_trips` with `status = 'planned'`, plus `plan_json` (AI plan + intake answers) and `forecast_snapshot`. Add planner defaults (boat/foot, preferred method) to `profiles`. No new tables needed; RLS mirrors existing trip policies.
- **Edge function `plan-trip`** (Lovable AI, streaming): receives intake answers, spot/area context, forecast, USGS/NOAA series, and past-trip aggregates; returns structured JSON — candidate spots (explore path) or consolidated time blocks with reason, species, and tackle references (spot path). Tool-style grounding: the function fetches station/weather data server-side rather than letting the model invent numbers. A shared `parse-voice` helper (factored out of the existing `parse-trip-voice` function) turns spoken intake and refinement into structured answers, so voice-first input works everywhere in the planner.
- **Reuse**: `weather`, `water-data`, `tide-water` edge functions; the Web Speech + AI parsing flow from Voice Log; `SpotWeatherForecast`, `SpotWaterConditions`, `SpotTideConditions`, `chartGrid`, `SpotCreationModal`, `TacklePicker`.
- **Past-trip insights** computed client-side from `fishing_trips`, `catches`, and their stored `weather_snapshot` / `water_flow_snapshot` / `tide_snapshot`, then passed to the model as a compact summary.
- **New files**: `src/pages/PlanTripPage.tsx` (route `/plan`), `src/components/plan/*` (IntakeStep, AreaExplorer, DayPlanView, PastTripInsights), `supabase/functions/plan-trip/index.ts`.
- Core save must succeed even if AI or an external API fails — the planned trip persists with whatever data loaded.

## Build order

1. Schema migration + `planned` status support in Trips.
2. Planner shell, route, and intake step with saved defaults.
3. Existing-spot path: forecast + water/tide visuals + past-trip insights.
4. `plan-trip` edge function and the hour-by-hour guide.
5. Explore-a-new-area path with map candidates and spot creation.
6. Convert planned trip → logged trip.
