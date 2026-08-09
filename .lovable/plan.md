# Tackle Box

A place to keep every fly, lure, and bait you own — with a photo, what it's for, and how to present it — and to attach the right one to each catch you log.

## What you'll get

**Tackle list (new "Tackle" section)**
- Card grid of your tackle, each showing its photo, name, and type badge
- Search by name and filter by type or target species
- Empty state that invites you to add your first item

**Add / edit a tackle item**
- Photo: take a picture or upload one. After upload, an "Identify with AI" button reads the photo and pre-fills type, a suggested name, and likely target species — you can accept or edit anything before saving
- Name
- Type: Fly, Lure, Bait, Jig, Soft Plastic, Spoon, Spinner, Fly Line/Leader, Other
- Target species: multi-select from a curated freshwater + saltwater list, with the option to add your own
- Purchase location (free text, e.g. shop name)
- Presentation notes: the "how to fish it" field — how it was recommended to you
- General notes
- Delete with confirmation

**Tackle detail**
- Large photo, all fields, and a list of the catches landed on it, with a caught-count and species breakdown

**Linking to catches**
- In the catch logger, the free-text "Lure / Bait" field becomes a tackle picker: search your tackle, pick one, or type free text if the item isn't in your box yet
- Recently used and species-matched tackle float to the top of the picker
- Existing catches keep their typed text; nothing you've already logged is lost
- Voice logging still captures spoken bait names as text and will match them to your tackle when the name lines up

**Spot / trip context**
- Trip view shows which tackle produced each catch

## Technical notes

Database (single migration):
- New `species` table: `id`, `primary_name` (unique), `nicknames text[]`, `created_by`, timestamps. Any authenticated user can read and add a species; only admins (via `has_role`) can edit, merge/consolidate, or delete. GRANTs for `authenticated` + `service_role`.
- New `tackle` table: `user_id`, `name`, `type`, `purchase_location`, `presentation_notes`, `notes`, `photo_url`, `is_demo`, timestamps. RLS scoped to `auth.uid()`, GRANTs for `authenticated` + `service_role`, `updated_at` trigger.
- New `tackle_species` join table linking tackle to species (many-to-many), RLS via the owning tackle row.
- `catches` gains a nullable `tackle_id` referencing `tackle` (on delete set null). `lure_or_bait` stays as the free-text fallback and history.
- The unused `gear` table is dropped; tackle replaces it.
- Private storage bucket `tackle-photos` with per-user folder RLS; photos read through signed URLs.

Backend:
- New edge function `identify-tackle` calls Lovable AI (`google/gemini-3.6-flash`, vision) with the uploaded photo and a structured-output schema returning `{ type, suggested_name, species[], presentation_hint }`. Failures are non-fatal — the form still saves.

Frontend:
- `src/pages/TackleBoxPage.tsx` (route `/tackle`, added to bottom nav), `src/components/tackle/TackleFormModal.tsx`, `TackleCard.tsx`, `TackleDetailModal.tsx`, `TacklePicker.tsx`, `SpeciesMultiSelect.tsx`
- `src/lib/species.ts` — curated species list
- `src/lib/tackleData.ts` — fetch/create/update/delete + signed photo URLs
- `CatchLogger.tsx` swaps the bait input for `TacklePicker`, writing both `tackle_id` and `lure_or_bait` (name snapshot)
- Styling follows the existing rugged Safety Orange / Steel design system and mobile-first tap targets
