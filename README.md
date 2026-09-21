# Catch - passion project - fishing app - AI and tool consolidation

I like to fly fish. Particularly, I like to explore rivers and learn new spots and techniques. I had been using a variety of tools to help me explore and track my learnings. I decided to combine them in a web app as a way to practice vibe coding and give fishers a better tool for trip exploration. I don't particularly like the name and hope to find a better one soon.

## Tools I used before

* Google maps
  * Use satellite view to find river access and where there might be holes.
  * Mark fishing holes with notes about what I found
* USGS river flow data
  * See current river flows
  * Look at previous river flows to see if there had recently been a rain event that would cloudy the water or a period of long stagnancy that would lead to sediment buildup
* Weather sites
  * See hourly forecasts to determine water temps and fishing behaviors
* ChatGPT
  * Ask about species I hadn't targeted much or specific patterns to use
  * Get general information about a large fishing area
* Notepad
  * Record notes about specific trips (date, time, bait, water flows and level)
 
## How I am combining these tools

The app is meant to provide a thorough, but thoughtful set of tools to save spots, plan trips, and give context to previous trips to help fishers learn more as they explore. It should not interrupt the trip or replace raw curiosity, but rather help record the learnings that can often be lost due to how engaging the fishing is.

* Google maps API and UI used to create spots that can be used to log and plan trips
* USGS river flow data automatically links to spots to give context to trips and info about a planned trip
* Weather API pulls in the forecast for upcoming trips and stores weather for previous trips
* AI API can take voice memos and turn them into trip logs so anglers can keep a hand on their fishing pole and log real-time insights
* AI API can use users data to recommend spots and future trips

## Development

This is currently being built on Lovable. At some point I will likely move it to a different architecture and build an phone app.
