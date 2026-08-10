# Tackle: category + subcategory

Replace the single flat tackle "type" with a two-level structure: a top-level category (Lures, Flies, Bait) and a subcategory chosen from that category's list.

## Taxonomy

- **Lures**: Hardbait / Crankbait, Soft Plastic, Spoon, Spinner / Spinnerbait, Jig, Blade Bait, Topwater, Other
- **Flies**: Dry Fly, Wet Fly, Nymph, Streamer, Topwater / Popper, Other
- **Bait**: Worms, Insects, Fish, Crustaceans, Prepared / Dead Bait, Other

Each category gets an "Other" subcategory so nothing is unclassifiable.

## Data

Add `category` and `subcategory` columns to the tackle table (category required, subcategory required). Existing tackle: all 4 current items are "Fly", so they map to category Flies / subcategory Dry Fly is not safe to assume — they will be set to Flies with subcategory "Other" for the owner to refine. The old `type` column stays in place temporarily as a read-only fallback and is dropped once the new fields are live.

## UI

- **Add/Edit tackle form**: category selector (3 large buttons) followed by a subcategory selector that shows only that category's options; changing category resets the subcategory.
- **Tackle Box page**: the filter row becomes category chips; picking a category reveals a second row of subcategory chips for that category.
- **Cards, detail view, tackle picker**: show `Category · Subcategory` where the single type was shown.

## AI identification

The photo-identification function returns a category and a subcategory from the lists above instead of a flat type, and the form applies both.

## Technical notes

- Taxonomy lives in one exported constant in `src/lib/tackleData.ts` (`TACKLE_CATEGORIES` map) driving form, filters and the edge function schema.
- Migration adds the two columns with a backfill, then a follow-up removes `type` after code is updated.
- Files touched: `src/lib/tackleData.ts`, `src/components/tackle/TackleFormModal.tsx`, `TackleCard.tsx`, `TackleDetailModal.tsx`, `TacklePicker.tsx`, `src/pages/TackleBoxPage.tsx`, `supabase/functions/identify-tackle/index.ts`.
