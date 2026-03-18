

## Voice-to-Trip Data Feature

### Architecture

```text
[Mic Button] → Web Speech API → transcript string
    ↓
[Edge Function: parse-trip-voice]
    → Lovable AI (gemini-3-flash-preview) with tool-calling
    → Returns structured JSON: { startTime, endTime, catches: [{species, quantity, lure}], notes }
    ↓
[Frontend] → Pre-fills TripLogForm fields + auto-creates catch records
```

### Implementation Steps

**1. Create Edge Function `supabase/functions/parse-trip-voice/index.ts`**
- Accepts `{ transcript: string }` 
- Calls Lovable AI gateway with a system prompt like "Extract fishing trip data from natural language"
- Uses tool-calling with a structured schema to reliably extract:
  - `start_time` (string, HH:MM)
  - `end_time` (string, HH:MM)  
  - `date` (string, optional — defaults to today)
  - `catches` array: `{ species, quantity, lure_or_bait }`
  - `location` (string, optional)
  - `notes` (string — any remaining unstructured info)
- Returns parsed JSON to the client
- Add to `supabase/config.toml` with `verify_jwt = false`

**2. Add a voice dictation button to `TripLogForm.tsx`**
- Mic button in the header area of the form (next to the title)
- Uses `window.SpeechRecognition` (Web Speech API) for browser-native dictation — no API key needed
- Shows a recording indicator while listening
- On speech end, sends transcript to the edge function
- On response, pre-fills form fields (date, times) and auto-creates catch records via the existing `CatchLogger` insert logic

**3. Update `CatchLogger.tsx`**
- Expose a method or accept a prop to programmatically add catches (so the voice parser can bulk-insert them)
- After AI parsing, insert each catch record into the `catches` table using the existing insert pattern

### Key Decisions
- **Web Speech API** over ElevenLabs — free, no setup, good enough for dictation
- **Lovable AI with tool-calling** over LangChain — simpler, already configured, structured output is reliable
- **Pre-fill rather than auto-save** — user can review/edit the AI-parsed data before saving the trip

### Example Voice Input → Output
Input: *"I fished from 9 to 1 and caught 3 sunfish and 2 bass. I used mainly a green woolly bugger."*

Extracted:
```json
{
  "start_time": "09:00",
  "end_time": "13:00",
  "catches": [
    { "species": "Sunfish", "quantity": 3, "lure_or_bait": "Green Woolly Bugger" },
    { "species": "Bass", "quantity": 2, "lure_or_bait": "Green Woolly Bugger" }
  ],
  "notes": null
}
```

