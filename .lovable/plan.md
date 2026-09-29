# Trip forecast display

## What will change
- For a future trip, request forecast weather for the selected date instead of displaying a historical-data message.
- When hourly forecast data is available, show the same time-by-time temperature, precipitation, wind, and condition breakdown used for past trips.
- When hourly data is unavailable, show a five-day daily forecast ending on the trip date: the trip day plus the four preceding days.
- Keep current historical weather behavior unchanged for past trips.

## Technical details
- Extend the weather forecast response to include hourly values and enough daily values for the five-day fallback.
- Update the trip weather section to distinguish future forecasts from historical snapshots and render the appropriate breakdown.
- Preserve weather as non-blocking so trip saving still works if forecast services fail.
- Deploy and test the weather function, then verify the trip screen and preview error logs.
