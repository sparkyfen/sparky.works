export interface Env {
  // Bindings
  DB: D1Database;
  TOKENS: KVNamespace;

  // Vars
  TIMEZONE: string;
  SCORE_THRESHOLD: string;
  DIGEST_DAYS: string;
  UPCOMING_MAX_DAYS: string;
  SPOTIFY_REDIRECT_URI: string;

  // Secrets
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
  LASTFM_API_KEY: string;
  TICKETMASTER_API_KEY: string;
  SEATGEEK_CLIENT_ID?: string;
  DEBUG_KEY: string;
}
