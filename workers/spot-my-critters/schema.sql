DROP TABLE IF EXISTS followed_friends;
DROP TABLE IF EXISTS posted_events;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  tg_user_id INTEGER PRIMARY KEY,
  tg_username TEXT,
  lastfm_username TEXT,
  registered_at INTEGER NOT NULL
);

CREATE TABLE followed_friends (
  tg_user_id INTEGER NOT NULL,
  lastfm_username TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (tg_user_id, lastfm_username)
);

CREATE TABLE posted_events (
  tg_user_id INTEGER NOT NULL,
  ticketmaster_id TEXT NOT NULL,
  posted_at INTEGER NOT NULL,
  event_date TEXT NOT NULL,
  PRIMARY KEY (tg_user_id, ticketmaster_id)
);

CREATE INDEX idx_posted_events_date ON posted_events(event_date);
