

## Spot Map UX Overhaul — Revised Plan

### Overview
Split the current "coordinates" step into two distinct steps: **Home Base** (entry point with place search and spot naming) and **Holes** (long-press to drop fishing holes on a larger map). Also improve map usability across both steps.

### New Step Flow
1. **State** — unchanged
2. **Water Body** — unchanged  
3. **USGS Link** — unchanged
4. **Home Base** (new) — Set the entry/parking point and name the spot
5. **Holes** (new) — Drop fishing holes on the map via long-press

### Step 4: Home Base

- Show the normalized water body name prominently at top (e.g., "on Guadalupe River") so the user knows not to repeat it in the spot name
- Google Places Autocomplete search bar: "Search for a nearby landmark, park, road..."
- When user selects a place result:
  - Pan the map to that location and drop a "Home Base" marker (distinct icon/color)
  - Pre-fill the spot name with the place name (e.g., "Allen Bates Park")
  - Store as the first point with label "Home Base"
- Spot name input below, pre-filled but editable
- Map showing the home base pin (large, near-full-width, `gestureHandling: "greedy"`, satellite toggle)
- Alternative: user can long-press the map to manually place home base without searching
- "My Location" button to center on GPS

### Step 5: Holes

- Large map (same improvements: greedy gestures, satellite toggle, ~50vh height)
- Map centered on the home base point
- Existing home base pin shown (dimmed/different color)
- Long-press (~500ms) to drop a new hole pin
- On drop, show inline naming prompt with quick-pick chips: "Hole 1", "Hole 2", "Deep pool", "Riffle", "Bank spot", custom
- Tap existing hole pin to rename or delete
- Pin list below map for review
- "Create Spot" button to save

### Technical Changes

**File: `src/components/spots/SpotCreationModal.tsx`**
1. Add `Step` type values `"homebase"` and `"holes"` (replace `"coordinates"`)
2. Add Google Places Autocomplete using `google.maps.places.AutocompleteService` + `PlacesService` (already have Maps JS API loaded; need to add `libraries: ["places"]` to `useJsApiLoader`)
3. Home base step: search input, map with single pin, spot name input pre-filled from search
4. Holes step: large map with long-press handler, post-drop naming overlay with chips, marker click to edit/delete
5. Map options: `gestureHandling: "greedy"`, `mapTypeControl: true`, height `max(50vh, 300px)`
6. Long-press implementation: `onMouseDown`/`onTouchStart` with 500ms timer, cancel on `mousemove`/`touchmove` beyond threshold
7. Remove the old pre-tap label input and `newLabel` state

**File: `src/components/spots/SpotPicker.tsx`**
- Apply same map improvements (greedy gestures, satellite, long-press) to the "add a point" inline map

**Google Maps Libraries**: Update `useJsApiLoader` calls to include `libraries: ["places"]` for autocomplete support.

