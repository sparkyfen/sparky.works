export interface Env {
  SONGKICK_API_KEY: string;
  SEATGEEK_API_KEY: string;
  TELEGRAM_CHAT_ID: string;
  TELEGRAM_BOT_TOKEN: string;
}
// Import required libraries
import { Event, Venue, Performance } from './types';
import type { Request as WorkerRequest, ScheduledEvent, ExecutionContext } from "@cloudflare/workers-types/experimental"

// Define the endpoint URL and API key for Songkick
const LOCATION = '2846'; // Seattle location ID
const SONGKICK_ENDPOINT_URL = `https://api.songkick.com/api/3.0/metro_areas/${LOCATION}/calendar.json`;
const SONGKICK_VENUE_ENDPOINT_URL = `https://api.songkick.com/api/3.0/search/venues.json`;
const SEATGEEK_API_URL = `https://api.seatgeek.com/2`;

async function sendMessageToTelegram(env: Env, message: string): Promise<void> {
  // Define the Telegram API URL and chat ID
  const TELEGRAM_API_URL = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
  try {
    const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: `@${env.TELEGRAM_CHAT_ID}`,
        text: message,
      }),
    });
    if (!response.ok) {
      console.log(await response.json());
      console.log(`Error sending message to Telegram: ${response.status} ${response.statusText}`);
      return;
    }
  } catch (error: any) {
    console.log(`Error sending message to Telegram: ${error.message}`);
    return;
  }
}

async function getPerformance(env: Env, name: string) {
  // console.log(`${SEATGEEK_API_URL}/performers?q=${name}&client_id=${env.SEATGEEK_API_KEY}`);
  const response = await fetch(`${SEATGEEK_API_URL}/performers?q=${name}&client_id=${env.SEATGEEK_API_KEY}`);
  if (!response.ok) {
    console.log(`Error getPerformance to SeatGeek: ${response.status} ${response.statusText}`);
    return;
  }
  const data : any = await response.json();
  const performers = data.performers;
  const performance = performers.find((p: any) => p.name.toLowerCase() === name.toLowerCase());
  return performance;
}

async function getVenue(env: Env, name: string) {
  // console.log(`${SEATGEEK_API_URL}/venues?q=${name}&client_id=${env.SEATGEEK_API_KEY}`);
  const response = await fetch(`${SEATGEEK_API_URL}/venues?q=${name}&client_id=${env.SEATGEEK_API_KEY}`);
  if (!response.ok) {
    console.log(`Error getVenue to SeatGeek: ${response.status} ${response.statusText}`);
    return;
  }
  const data : any = await response.json();
  const venues = data.venues;
  const venue = venues.find((v: any) => v.name.toLowerCase() === name.toLowerCase());
  return venue;
}

async function getEvent(env: Env, performanceId: number, venueId: number) {
  // console.log(`${SEATGEEK_API_URL}/events?performers.id=${performanceId}&venue.id=${venueId}&client_id=${env.SEATGEEK_API_KEY}`);
  const response = await fetch(`${SEATGEEK_API_URL}/events?performers.id=${performanceId}&venue.id=${venueId}&client_id=${env.SEATGEEK_API_KEY}`);
  if (!response.ok) {
    console.log(`Error getEvent to SeatGeek: ${response.status} ${response.statusText}`);
    return;
  }
  const data : any = await response.json();
  const events = data.events;
  const event = events[0];
  return event;
}

async function getListings(env: Env, eventId: number) {
  // console.log(`${SEATGEEK_API_URL}/events/${eventId}/listings?client_id=${env.SEATGEEK_API_KEY}`);
  const response = await fetch(`${SEATGEEK_API_URL}/events/${eventId}/listings?client_id=${env.SEATGEEK_API_KEY}`);
  if (!response.ok) {
    console.log(`Error sending message to SeatGeek: ${response.status} ${response.statusText}`);
    return;
  }
  const data : any = await response.json();
  const listings = data.listings;
  return listings;
}

async function getPrice(env: Env, eventPerformance: Performance, eventVenue: Venue) {
  const performance = await getPerformance(env, eventPerformance.displayName);
  if (!performance) {
    console.log(`Unable to find performance.`);
    return undefined;
  }
  const venue = await getVenue(env, eventVenue.displayName);
  if (!venue) {
    console.log(`Unable to find venue`);
    return;
  }

  const event = await getEvent(env, performance.id, venue.id);
  console.log(`performance.id: ${performance.id}, venue.id: ${venue.id}`);
  if (!event) {
    console.log(`Unable to find event`);
    return undefined;
  }

  console.log(`event: ${event.id}`);
  return event.stats.lowest_price;
}

// Define the Cloudflare worker to handle the Songkick events and send a Telegram message
async function handleSongkickEvents(cfEvent: any, env: Env, ctx: ExecutionContext): Promise<void> {
  console.log(`Cron processed: ${cfEvent?.scheduledTime}`);
  const API_KEY = `${env.SONGKICK_API_KEY}`;
  const FROM_DATE = new Date().toISOString().slice(0, 10); // Today's date
  const TO_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // 7 days from now
  // Retrieve the Songkick events for the Seattle location and time filter
  console.log(`${SONGKICK_ENDPOINT_URL}?apikey=${API_KEY}&min_date=${FROM_DATE}&max_date=${TO_DATE}`);
  const response = await fetch(`${SONGKICK_ENDPOINT_URL}?apikey=${API_KEY}&min_date=${FROM_DATE}&max_date=${TO_DATE}`);
  if (!response.ok) {
    console.log(`Error retrieving Songkick events: ${response.status} ${response.statusText}`);
    return;
  }
  const data : any = await response.json();

  // Filter the Songkick events to include only those with a performance in the next 7 days
  if (data.resultsPage.totalEntries > 0) {
    const events = data.resultsPage.results.event;

    if (events.length > 0) {
      const messages = [];
      for (const id in events) {
        const event = events[id];
        const eventPerformance = event.performance.find((perf) => perf.billing === 'headline');
        const eventVenue: Venue = event.venue;
        // TODO Fuzzy search on eventVenue.displayName with SONGKICK_VENUE_ENDPOINT_URL to get address
        // Then send address search to SeatGeek.
        const price = await getPrice(env, eventPerformance, eventVenue);
        const startDateTime = new Date(event.start.datetime);
        const dateTimeFormatted = startDateTime.toLocaleTimeString('en-us', { timeZone: "America/Los_Angeles", weekday:"long", year:"numeric", month:"short", day:"numeric", hour: '2-digit', minute: '2-digit', hour12: true});
        if (price) {
          messages.push(`${eventPerformance.displayName}\n${eventVenue.displayName} - ${dateTimeFormatted}\nPrice: $${price}\n`);
        } else {
          console.warn(`Missing price for ${eventPerformance.displayName}\n${eventVenue.displayName} - ${event.start.datetime}`);
        }
      }
      // Create a single Telegram message with all Songkick events
      const message = messages.join('\n');
      console.log(message);
      // Send the Telegram message
      await sendMessageToTelegram(env, message);
      console.log(`Sent ${messages.length} Songkick events to Telegram`);
    } else {
      console.log('No Songkick events found for Seattle in the next 7 days');
    }
  } else {
    console.log('No Songkick events found for Seattle in the next 7 days');
  }
}

// Set up the Cloudflare worker cron trigger to run once a week on Monday at 10am PST
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleSongkickEvents(event, env, ctx));
  },
  async fetch(event: WorkerRequest, env: Env, ctx: ExecutionContext) {
    await handleSongkickEvents(event, env, ctx);
    return new Response("OK")
  }
};
