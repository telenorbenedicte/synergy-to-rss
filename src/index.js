import * as cheerio from "cheerio";
import { Feed } from "feed";
import fetch from "node-fetch";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const BASE_URL = "https://www.synergyfornebu.no";
const EVENTS_PAGE = `${BASE_URL}/arrangementer`;
const EVENTS_JSON_PATH = "events.json";
const FEED_XML_PATH = "feed.xml";

/**
 * Fetch HTML content from a URL
 */
async function fetchHtml(url) {
  console.log(`Fetching: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

/**
 * Parse the events list page and extract event URLs
 */
function parseEventsList(html) {
  const $ = cheerio.load(html);
  const eventUrls = [];

  $(".eventscollectionitem a.eventslinkwrapper").each((_, element) => {
    const href = $(element).attr("href");
    if (href && href.startsWith("/event/")) {
      eventUrls.push(`${BASE_URL}${href}`);
    }
  });

  return eventUrls;
}

/**
 * Parse Norwegian date format (e.g., "3.2.26" -> 2026-02-03)
 * and time (e.g., "11:30")
 */
function parseDateTime(dateStr, timeStr) {
  // Date format: D.M.YY (e.g., "3.2.26")
  const dateParts = dateStr.split(".");
  if (dateParts.length !== 3) {
    console.warn(`Unexpected date format: ${dateStr}`);
    return new Date();
  }

  const day = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10) - 1; // 0-indexed
  let year = parseInt(dateParts[2], 10);

  // Convert 2-digit year to 4-digit (assume 2000s)
  if (year < 100) {
    year += 2000;
  }

  // Parse time (e.g., "11:30")
  let hours = 0;
  let minutes = 0;
  if (timeStr) {
    const timeParts = timeStr.split(":");
    hours = parseInt(timeParts[0], 10) || 0;
    minutes = parseInt(timeParts[1], 10) || 0;
  }

  return new Date(year, month, day, hours, minutes);
}

/**
 * Parse an individual event page and extract details
 */
function parseEventPage(html, url) {
  const $ = cheerio.load(html);

  // Title
  const title = $(".articleheading").text().trim();

  // Date, Time, Location from info boxes
  const infoBoxes = $(".articleinfobox");
  let dateStr = "";
  let timeStr = "";
  let location = "";

  infoBoxes.each((index, element) => {
    const text = $(element).text().trim();
    // First box is date, second is time, third is location
    if (index === 0) {
      dateStr = text;
    } else if (index === 1) {
      timeStr = text;
    } else if (index === 2) {
      location = text;
    }
  });

  // Category
  const category = $(".identifier").first().text().trim();

  // Description (rich text content)
  const descriptionHtml = $(".richtext.w-richtext").html() || "";
  const descriptionText = $(".richtext.w-richtext").text().trim();

  // Image
  const image = $(".eventheroimage").attr("src") || "";

  // Registration URL
  let registrationUrl = "";
  $("a.button").each((_, element) => {
    const href = $(element).attr("href");
    if (href && href.includes("checkin.no")) {
      registrationUrl = href;
    }
  });

  // Parse date and time
  const eventDate = parseDateTime(dateStr, timeStr);

  return {
    id: url,
    title,
    date: eventDate.toISOString(),
    location,
    category,
    description: descriptionText,
    descriptionHtml,
    image,
    registrationUrl,
    url,
  };
}

/**
 * Load existing events from events.json
 */
async function loadExistingEvents() {
  if (!existsSync(EVENTS_JSON_PATH)) {
    return { events: [] };
  }

  try {
    const content = await readFile(EVENTS_JSON_PATH, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.warn("Failed to load existing events:", error.message);
    return { events: [] };
  }
}

/**
 * Merge new events with existing events (append-only)
 */
function mergeEvents(existingData, newEvents) {
  const existingIds = new Set(existingData.events.map((e) => e.id));
  const now = new Date().toISOString();

  const eventsToAdd = newEvents
    .filter((event) => !existingIds.has(event.id))
    .map((event) => ({
      ...event,
      firstSeen: now,
    }));

  // Update existing events with fresh data (but keep firstSeen)
  const updatedExisting = existingData.events.map((existing) => {
    const fresh = newEvents.find((e) => e.id === existing.id);
    if (fresh) {
      return {
        ...fresh,
        firstSeen: existing.firstSeen,
      };
    }
    return existing;
  });

  return {
    events: [...updatedExisting, ...eventsToAdd],
    lastUpdated: now,
  };
}

/**
 * Generate Atom feed from events data
 */
function generateFeed(eventsData) {
  const feed = new Feed({
    title: "Synergy Fornebu - Arrangementer",
    description:
      "Events and activities at Synergy Fornebu - creating engaging experiences and community at the workplace",
    id: EVENTS_PAGE,
    link: EVENTS_PAGE,
    language: "nb",
    image: "https://cdn.prod.website-files.com/693ffbf0eacd2e8c1f53afb9/6940915a6b5c759e77ca018e_Favicon.png",
    favicon: "https://cdn.prod.website-files.com/693ffbf0eacd2e8c1f53afb9/6940915a6b5c759e77ca018e_Favicon.png",
    updated: new Date(eventsData.lastUpdated),
    generator: "synergy-to-rss",
    feedLinks: {
      atom: "https://github.com/synergy-to-rss/feed.xml",
    },
  });

  // Sort events by date (newest first)
  const sortedEvents = [...eventsData.events].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  for (const event of sortedEvents) {
    const eventDate = new Date(event.date);

    // Build content with image and description
    let content = "";
    if (event.image) {
      content += `<p><img src="${event.image}" alt="${event.title}" style="max-width: 100%;" /></p>`;
    }
    if (event.descriptionHtml) {
      content += event.descriptionHtml;
    }
    if (event.registrationUrl) {
      content += `<p><a href="${event.registrationUrl}">Meld deg på her</a></p>`;
    }

    feed.addItem({
      title: event.title,
      id: event.id,
      link: event.url,
      description: event.description.substring(0, 300) + (event.description.length > 300 ? "..." : ""),
      content,
      date: eventDate,
      image: event.image,
      category: event.category ? [{ name: event.category }] : [],
    });
  }

  return feed.atom1();
}

/**
 * Add a small delay between requests to be polite
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Main function
 */
async function main() {
  console.log("Starting Synergy events scraper...\n");

  // Fetch events list page
  const eventsListHtml = await fetchHtml(EVENTS_PAGE);
  const eventUrls = parseEventsList(eventsListHtml);
  console.log(`Found ${eventUrls.length} events\n`);

  // Fetch each event page
  const newEvents = [];
  for (const url of eventUrls) {
    try {
      const eventHtml = await fetchHtml(url);
      const event = parseEventPage(eventHtml, url);
      newEvents.push(event);
      console.log(`  - ${event.title} (${event.date})`);

      // Be polite - wait 500ms between requests
      await delay(500);
    } catch (error) {
      console.error(`Failed to fetch event ${url}:`, error.message);
    }
  }

  console.log(`\nSuccessfully parsed ${newEvents.length} events`);

  // Load existing events and merge
  const existingData = await loadExistingEvents();
  console.log(`Existing events in database: ${existingData.events.length}`);

  const mergedData = mergeEvents(existingData, newEvents);
  const newCount = mergedData.events.length - existingData.events.length;
  console.log(`New events added: ${newCount}`);
  console.log(`Total events in database: ${mergedData.events.length}`);

  // Save events.json
  await writeFile(EVENTS_JSON_PATH, JSON.stringify(mergedData, null, 2));
  console.log(`\nSaved events to ${EVENTS_JSON_PATH}`);

  // Generate and save feed
  const feedXml = generateFeed(mergedData);
  await writeFile(FEED_XML_PATH, feedXml);
  console.log(`Generated feed at ${FEED_XML_PATH}`);

  console.log("\nDone!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
