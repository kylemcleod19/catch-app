# Tackle Variants

Group tackle by pattern (e.g. Wooly Bugger) and track each color/size combination as a variant underneath it.

## What you'll get

**Tackle item = the pattern**
- Name, type, target species, purchase location, presentation notes stay on the parent item
- The card shows the primary variant's photo, plus a swipeable slider of all variant photos when there is more than one
- A small badge shows the variant count (e.g. "4 variants")

**Variants**
- Each variant has: color, size, optional photo, optional variant-specific notes
- One variant is marked primary (defaults to the first one added) and drives the card photo
- Add, edit, reorder-by-primary, and delete variants inside the tackle form
- A variant with no photo falls back to the parent item's photo in the slider

**Tackle detail**
- Variant list with color/size chips, photo, notes, and the catch count landed on each
- Species breakdown per variant so you can see the black bugger out-fishing the brown

**Logging a catch**
- The tackle picker becomes two steps: pick the pattern, then pick the exact variant
- When a pattern has variants, choosing one is required before the catch can be saved
- Patterns with no variants behave exactly as today (single tap)
- Free-text bait entry still works for anything not in the box; existing catches keep their current tackle link untouched

**AI identify**
- Photo identification also suggests a color and size, which pre-fill the first variant

## Technical notes

Database (single migration):
- New `tackle_variants`: `id`, `tackle_id` (cascade delete), `color text`, `size text`, `photo_url text`, `notes text`, `is_primary boolean`, `sort_order int`, timestamps. At least one of color/size required (validation trigger). Partial unique index on `(tackle_id)` where `is_primary` to guarantee a single primary. RLS scoped through the owning `tackle` row's `user_id`; GRANTs for `authenticated` + `service_role`; `updated_at` trigger.
- `catches` gains nullable `variant_id` referencing `tackle_variants` (on delete set null). `tackle_id` stays for pattern-level rollups.
- Backfill: for every existing tackle item, create one variant carrying the item's current `photo_url`, marked primary, so nothing loses its picture. Existing catches keep `tackle_id` and get that variant's `variant_id`.
- The parent `tackle.photo_url` stays as the fallback image.

Storage: variant photos reuse the private `tackle-photos` bucket and the existing per-user folder policy.

Frontend:
- `src/lib/tackleData.ts` — variant CRUD, signed URLs per variant, `fetchTackle` returns `variants[]`, catch summary grouped by variant
- `src/components/tackle/VariantEditor.tsx` — repeatable rows inside `TackleFormModal`
- `src/components/tackle/TackleCard.tsx` — photo slider over variant photos with dot indicators
- `TackleDetailModal.tsx` — variant list with per-variant catch stats
- `TacklePicker.tsx` — second-step variant selection, required when variants exist; `CatchLogger.tsx` writes `variant_id` alongside `tackle_id` and the `lure_or_bait` text snapshot (now "Name — Color, Size")
- `identify-tackle` edge function schema gains `color` and `size`

Styling follows the existing rugged Safety Orange / Steel system and mobile tap-target sizes.
