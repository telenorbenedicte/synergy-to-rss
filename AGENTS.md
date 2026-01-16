# AI guidelines

This project is a simple "webpage to RSS" project. It does:

1. Uses Github Actions to periodically run
2. Has a simple node script which:
   - Loads the page: https://www.synergyfornebu.no/arrangementer
   - Loops through all events
   - Loads the page for every event
   - Parses the relevant information about the event
   - Produces a `feed.xml` which is a valid Atom/RSS feed
3. The github action will run the Node script and commit the updated `feed.xml`
4. The `feed.xml` is hosted with Github Pages
