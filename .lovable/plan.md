# Trip Planner — Rebuilt Step-by-Step Flow

A simple, tap-first planner. You give what you know; each step has a "Suggest for me" button that returns up to 3 AI picks, each with a short reason and a map pin. There's no chat and no voice for now.

## Flow

```text
1. Start    ->  My spot  |  New area
2. When     ->  date + time of day (multi-select)
3. Where    ->  (my spot: done)  (new area: area -> water type -> map)
4. Data     ->  link weather + USGS / tide station (automatic, confirm)
5. Fish     ->  species chips (optional) + "Suggest species"
6. Plan     ->  map, conditions, hour-by-hour plan, Save
```

### 1. Start
Two big buttons:
- **One of my spots**: a list of saved spots (most fished first, then nearest), each with a small map thumbnail.
- **Somewhere new**

### 2. When
- A date picker, plus time of day as multi-select chips (Dawn … Night). Time of day is optional.
- A small note shows what we'll be able to show for that date: "Forecast available" if the date is within the next 7 days, or "Too far out for a forecast — we'll show recent conditions."

### 3. Where (new area only)
- **Area**: type a town or river. We look it up and show it on a map right away.
- **Water type**: River/stream, Lake, or Saltwater/tidal. This is required.
- **Pick water**: a map centered on the area.
  - Nearby monitored waters of that type show as pins you can tap.
  - **"Suggest spots"** gives 3 AI picks, each shown as a pin and a card with its reason ("public wading access at the park, gage 2 mi upstream"). Tap one to use it.
  - **"Suggest by species"** opens species chips (with an "I'm not sure" option). You then get 3 picks that fit those fish, each with a reason.
  - You can also drop your own pin.
- Choosing a spot saves it as a Spot using the existing save logic. There are no extra naming or state screens, because the state comes from the area you entered.

### 4. Data linking (always)
- Right after a spot is chosen, we find the nearest matching station on our own: USGS for rivers and lakes, NOAA tides for saltwater. Weather is linked automatically by location.
- A card shows each station on the mini map with its distance, plus Change and Skip buttons. Skipping still saves the spot.

### 5. Fish (optional)
- Species chips, filtered to the water type (and your past catches at that spot, if any).
- **"Suggest species"** gives 3 picks for this water and season, each with a reason ("redfish work the flats on the morning incoming tide"). Tap to add.
- "Skip — surprise me" is always available.

### 6. Day plan
- A map header with the spot and its linked stations.
- **Conditions**:
  - Future date within forecast range: hourly weather forecast, and a tide forecast for tidal spots.
  - Otherwise: the latest river flow/gage reading, the 30-day trend chart and a clarity note, plus a note that no forecast is available yet.
- **Hour-by-hour guide**: time blocks with conditions, target species, and a tackle suggestion from your tackle box. If no species was picked, the AI names up to 3 likely ones and says why.
- **Save** stores it as a planned trip, and **Regenerate** rebuilds the plan.

## Rules applied everywhere
- AI never returns more than 3 suggestions, and every suggestion has a one-line "why".
- Every location choice or suggestion is shown on a map.
- Each step shows what you've chosen so far in a compact summary you can tap to edit.
- The spot and trip save even if AI, weather or station lookups fail.

## Technical notes
- **Remove**: `PlannerChat.tsx`, `VoiceTextComposer` usage in the planner, and the `plan-chat` function. Leave `parse-planner-voice` in place but stop using it.
- **New structure**: `PlanTripPage` drives a single step state machine. New step components go in `src/components/plan/steps/` (StartStep, WhenStep, WhereStep, LinkDataStep, SpeciesStep). `DayPlanView` and `PlanConditions` are reused, and the rest of `GuidedPlanner` is folded in.
- **Map**: a shared `PlanMap` component shows the area, suggestion pins (orange fish pin), and station pins. It reuses the existing Google Maps loader and the `CandidateSpotsMap` logic.
- **New `plan-suggest` edge function**: one endpoint with `kind: "spots" | "species_spots" | "species"`. It runs on `openai/gpt-6-astra` via the Responses API with streaming and a strict structured output that has a hard cap of `maxItems: 3` and a required `why` on each item. Spot suggestions are grounded with nearby USGS/NOAA stations and water bodies from our tables, then geocoded on the client for accurate pins. This replaces `suggest-access-points` and `plan-chat`'s propose_spots.
- **Auto-linking**: a helper finds the nearest station in `usgs_water_bodies_available_data`/`usgs_locations` or the NOAA station list, using `toFipsStateCode`, and writes the link to the spot.
- **Forecast window**: `date - today <= 7 days` means use forecast mode. Otherwise the planner fetches current values plus the last 30 days of `water-data`. `plan-trip` receives the same mode flag so its text matches the data.
- **Update project memory**: the planner is text-first with voice removed for now, and AI suggestions are capped at 3, each with a reason.
