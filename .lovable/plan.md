

## Cleanup Plan for `normalized_water_body` Column

### Problem Scope
- **180K rows** with normalized names, **87K distinct values** — many are dirty
- ~5,700 rows prefixed with numbers (e.g., "13215 White River")
- ~300 rows that are purely numeric (e.g., "38160")
- ~8,600 rows prefixed with apostrophes (e.g., "'bull Shoals Lake")
- Hundreds with agency prefixes like `(coe)`, `(usace)`, location suffixes like "Site WR", "@ Jimmie Creek", "1.0 Mi. West of Highway", river-mile markers, etc.

### Approach: Two-Pass AI Re-normalization via Edge Function

Rather than writing hundreds of SQL regex rules by hand, we reuse the same AI normalization approach already in `sync-usgs-locations` but run it as a bulk cleanup job. The AI model already understands the rules — it just missed some cases on first pass.

**Pass 1 — Deterministic SQL fixes** (fast, no AI needed):
- Set purely numeric values to `NULL`
- Strip leading apostrophes and fix capitalization (`'bull Shoals Lake` → `Bull Shoals Lake`)
- Strip leading hyphens and junk codes (`-r3`, `-r4` → `NULL`)
- Strip agency prefixes: `(coe)`, `(usace)`, `(COE)` etc.
- Strip leading numeric prefixes: `13215 White River` → `White River`
- Expand common abbreviations: `Lk` → `Lake`, `R.` → `River`, `Ck` → `Creek`, `Rv` → `River`

**Pass 2 — AI re-normalization for remaining messy rows:**
- Query rows where `normalized_water_body` still contains patterns like `Site`, `@`, `Mile`, `Rmi`, `Mp`, `Fort`, location descriptions, or coordinate-style prefixes
- Send them through the same Gemini Flash Lite normalizer in batches of 100
- Update in place

### Implementation

1. **New edge function `cleanup-water-bodies`** with two actions:
   - `action: "sql-pass"` — runs the deterministic SQL fixes via service role
   - `action: "ai-pass"` — fetches the next batch of still-dirty rows, normalizes with AI, updates them
   - Can be called repeatedly until no dirty rows remain

2. **Database migration**: None needed — we're only updating existing data values, not schema.

3. **Dirty-row detection query** used by both passes:
   ```sql
   WHERE normalized_water_body ~ '^\d+$'          -- pure numbers
      OR normalized_water_body ~ '^\d+ '           -- leading numbers
      OR normalized_water_body ~ '^'''              -- leading apostrophe
      OR normalized_water_body ~ '^\('              -- leading parens/agency
      OR normalized_water_body ~ '^\-'              -- leading dash
      OR normalized_water_body ~ ' (Site|@|Mile|Rmi|Mp) '  -- location suffixes
      OR normalized_water_body ~ '\d+ (Mi\.|Fort|East|West|South|North)'
      OR normalized_water_body ~ 'Lk |R\.|Ck |Rv |Byu '   -- unexpanded abbreviations
      OR normalized_water_body != initcap(normalized_water_body)  -- capitalization issues
   ```

4. **Run the cleanup**: Invoke the SQL pass once, then loop the AI pass until it reports 0 remaining.

### What This Fixes
| Pattern | Example Before | Example After |
|---|---|---|
| Pure number | `38160` | `NULL` |
| Leading number | `13215 White River` | `White River` |
| Leading apostrophe | `'bull Shoals Lake` | `Bull Shoals Lake` |
| Agency prefix | `(coe) Black River` | `Black River` |
| Location suffix | `Lake Austin Site AC at Austin, TX` | `Lake Austin` |
| At-reference | `Bull Shoals Lake @ Jimmie Creek` | `Bull Shoals Lake` |
| Mile marker | `East Fork White River 3.6 Rmi` | `East Fork White River` |
| Abbreviation | `Lk Wedington` | `Lake Wedington` |
| Junk code | `-r3` | `NULL` |

### Estimated Effort
- ~15K rows fixed by SQL pass (fast, seconds)
- ~5-10K rows need AI pass (a few minutes in batches)
- Remainder are already clean

