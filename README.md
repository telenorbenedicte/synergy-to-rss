# synergy-to-rss

Converts events from [synergyfornebu.no/arrangementer](https://www.synergyfornebu.no/arrangementer) into an Atom RSS feed.

## Feed URL

Subscribe to the feed at:

```
https://telenorbenedicte.github.io/synergy-to-rss/feed.xml
```

## How It Works

- A GitHub Actions workflow runs every 6 hours
- Scrapes event listings and fetches details (title, date, location, description, image)
- Maintains an append-only `events.json` as a historical archive
- Generates `feed.xml` (Atom format) and publishes to GitHub Pages

## Local Development

```bash
# Install dependencies
pnpm install

# Run the scraper
pnpm start
```

Requires Node.js v24.13.0 (see `.nvmrc`).
