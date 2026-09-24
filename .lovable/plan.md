# Show upcoming trips and preserve saved plans

## What will change
- Add an **Upcoming Trips** section to the Home screen, ordered by the soonest trip first.
- Show each trip’s date, saved spot, and whether it includes a saved plan.
- Let users open an upcoming trip from either Home or Trips.
- Display the complete saved plan inside the upcoming trip: summary, best window, time blocks, species, tackle, approach, and notes.
- Keep the plan attached when the trip is viewed or later saved as completed.

## Important behavior
- Upcoming trips will still appear when the user has no completed trips.
- Existing recent/completed trip behavior remains unchanged.
- Empty or older planned trips without generated details will show a clear fallback instead of a blank plan area.

## Technical details
- Reuse a focused saved-plan display across Home/Trips via the existing trip form.
- Load `plan_json` with the trip and render it without modifying it during normal trip edits.
- Correct the Trips page loading flow so planned trips are fetched independently of completed-trip results.
- Verify compilation and the Home → upcoming trip → saved plan interaction.
